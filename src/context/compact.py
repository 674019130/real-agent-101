"""Five-layer context compaction system.

Layer 1: Time-based microcompact — clear old tool results after idle gap
Layer 2: Cached microcompact   — clear tool results while preserving API cache
Layer 3: Session memory compact — use persisted summary, zero API calls
Layer 4: Traditional full compact — model summarizes everything
Layer 5: API-native management  — server-side context trimming

Each layer is progressively more aggressive. The orchestrator tries
lighter layers first, falls back to heavier ones.

Claude Code's actual ordering:
    cached MC → session memory → traditional → API native
    (time-based MC runs as a pre-step, not in the main chain)

Ours follows the same logic.
"""

import time
from dataclasses import dataclass, field

from src.api import call_api
from src.context.token_counter import estimate_tokens
from src.context.persistence import (
    save_tool_result,
    save_history_snapshot,
    load_session_memory,
    save_session_memory,
)


# ============================================================
# Configuration
# ============================================================

@dataclass
class CompactConfig:
    """All compaction parameters in one place."""
    model: str = "gpt-4o"

    # Context window
    max_context_tokens: int = 128_000
    autocompact_buffer: int = 13_000      # CC uses 13K buffer
    summary_max_tokens: int = 4_000

    # Layer 1: Time-based microcompact
    idle_gap_seconds: int = 3600          # 60 minutes (CC default)
    keep_recent_results: int = 5          # keep last N tool results

    # Layer 2: Cached microcompact
    cache_mc_trigger_count: int = 20      # trigger after N tool results
    cache_mc_keep_recent: int = 5

    # Layer 3: Session memory
    sm_min_tokens: int = 10_000           # minimum to preserve
    sm_max_tokens: int = 40_000           # hard cap
    sm_min_messages: int = 5              # minimum text messages to keep

    # Layer 5: API-native
    api_max_input_tokens: int = 180_000
    api_target_input_tokens: int = 40_000

    @property
    def trigger_threshold(self) -> int:
        """Token count that triggers auto-compaction."""
        return self.max_context_tokens - self.autocompact_buffer


# ============================================================
# Compaction State (Module-level, reset after each compaction)
# ============================================================

@dataclass
class CompactState:
    """Mutable state tracking compaction-related metadata.

    Claude Code keeps this in module-level stores that get reset
    after each compaction. We do the same.
    """
    last_assistant_time: float = 0.0
    tool_result_count: int = 0
    compact_failures: int = 0             # circuit breaker: stop after 3
    max_failures: int = 3

    def record_assistant_message(self):
        self.last_assistant_time = time.time()

    def record_tool_result(self):
        self.tool_result_count += 1

    def reset(self):
        self.tool_result_count = 0
        self.compact_failures = 0

    @property
    def idle_seconds(self) -> float:
        if self.last_assistant_time == 0:
            return 0
        return time.time() - self.last_assistant_time

    @property
    def circuit_broken(self) -> bool:
        return self.compact_failures >= self.max_failures


# Global state instance
_state = CompactState()

def get_state() -> CompactState:
    return _state


# ============================================================
# Layer 1: Time-Based Microcompact
# ============================================================

def layer1_time_based_microcompact(
    messages: list[dict],
    config: CompactConfig,
    state: CompactState,
) -> tuple[list[dict], bool]:
    """Clear old tool results if there's been a long idle gap.

    Logic: If the gap since last assistant message exceeds threshold,
    the API's server-side KV cache has expired anyway (cache miss).
    Since we'll pay the full recompute cost regardless, we might as well
    clear old tool results to save tokens.

    This is a PRE-STEP, not part of the main compaction chain.
    It runs before every API call if the idle condition is met.

    Returns: (modified messages, whether any changes were made)
    """
    if state.idle_seconds < config.idle_gap_seconds:
        return messages, False

    # Find tool result messages, keep the most recent N
    tool_result_indices = [
        i for i, msg in enumerate(messages)
        if msg.get("role") == "tool"
    ]

    if len(tool_result_indices) <= config.keep_recent_results:
        return messages, False

    # Indices to clear (all except the most recent N)
    to_clear = tool_result_indices[:-config.keep_recent_results]

    modified = False
    for i in to_clear:
        msg = messages[i]
        content = msg.get("content", "")
        if content and not content.startswith("[Cleared"):
            # Persist before clearing
            tool_call_id = msg.get("tool_call_id", f"unknown_{i}")
            save_tool_result(tool_call_id, "unknown", content)

            # Replace with marker
            messages[i] = {
                **msg,
                "content": f"[Cleared: old tool result. See .agent/context/tool_results/{tool_call_id}.txt]",
            }
            modified = True

    if modified:
        state.reset()

    return messages, modified


# ============================================================
# Layer 2: Cached Microcompact
# ============================================================

def layer2_cached_microcompact(
    messages: list[dict],
    config: CompactConfig,
    state: CompactState,
) -> tuple[list[dict], bool]:
    """Clear tool results while being cache-aware.

    In production (Anthropic API), this uses cache_edits to delete
    tool_use blocks server-side without invalidating the KV cache prefix.

    Since we use OpenAI (no cache_edits), we simulate the same logic
    client-side: clear old tool results, accept the cache miss.

    The DESIGN is what matters — the cache-awareness is an optimization
    on top of the same conceptual operation as Layer 1.

    Trigger: tool_result_count exceeds threshold.
    """
    if state.tool_result_count < config.cache_mc_trigger_count:
        return messages, False

    # Same clearing logic as Layer 1, but triggered by count not time
    tool_result_indices = [
        i for i, msg in enumerate(messages)
        if msg.get("role") == "tool"
        and not msg.get("content", "").startswith("[Cleared")
    ]

    if len(tool_result_indices) <= config.cache_mc_keep_recent:
        return messages, False

    to_clear = tool_result_indices[:-config.cache_mc_keep_recent]

    modified = False
    for i in to_clear:
        msg = messages[i]
        content = msg.get("content", "")
        tool_call_id = msg.get("tool_call_id", f"unknown_{i}")
        save_tool_result(tool_call_id, "unknown", content)
        messages[i] = {
            **msg,
            "content": f"[Cleared: tool result. See .agent/context/tool_results/{tool_call_id}.txt]",
        }
        modified = True

    if modified:
        state.reset()

    return messages, modified


# ============================================================
# Layer 3: Session Memory Compact
# ============================================================

def layer3_session_memory_compact(
    messages: list[dict],
    config: CompactConfig,
) -> list[dict] | None:
    """Use persisted session memory as a summary — zero API calls.

    Claude Code maintains a session_memory.md that gets updated
    throughout the conversation. When compaction is needed,
    it reads this file and uses it as the summary instead of
    calling the API to generate one.

    Advantage: no API call = no cost, no latency.
    Disadvantage: memory file might be stale or incomplete.

    Returns: compacted message list, or None if not available.
    """
    memory = load_session_memory()
    if not memory:
        return None

    # Calculate how many recent messages to keep
    # Walk backwards from the end, accumulating tokens
    keep_tokens = 0
    keep_from = len(messages)
    text_msg_count = 0

    for i in range(len(messages) - 1, -1, -1):
        msg_tokens = estimate_tokens([messages[i]])
        if (keep_tokens + msg_tokens > config.sm_max_tokens
                and text_msg_count >= config.sm_min_messages
                and keep_tokens >= config.sm_min_tokens):
            break
        keep_tokens += msg_tokens
        keep_from = i
        if messages[i].get("role") in ("user", "assistant"):
            content = messages[i].get("content")
            if isinstance(content, str) and content:
                text_msg_count += 1

    if keep_from <= 0:
        return None  # nothing to compress

    # Build compressed output:
    # [boundary marker] + [session memory as summary] + [kept messages]
    compressed = [
        {
            "role": "user",
            "content": (
                "[COMPACT BOUNDARY — Session memory summary]\n\n"
                f"{memory}\n\n"
                "[END SUMMARY — Recent messages follow]"
            ),
        },
        {
            "role": "assistant",
            "content": "Understood. I have the session context. Continuing.",
        },
    ] + messages[keep_from:]

    return compressed


# ============================================================
# Layer 4: Traditional Full Compact
# ============================================================

async def layer4_full_compact(
    messages: list[dict],
    config: CompactConfig,
    api_key: str,
) -> list[dict]:
    """Model-generated summary of the full conversation.

    This is the L01 approach, improved:
    1. Persist history to disk before compressing
    2. Better summary prompt (structured output)
    3. Keep recent messages verbatim (don't compress everything)
    4. Update session memory file with the summary
    5. Handle prompt-too-long errors with truncation retry

    This costs one API call but produces the highest quality summary.
    """
    # Step 1: Persist history snapshot
    save_history_snapshot(messages)

    # Step 2: Calculate which messages to keep verbatim
    keep_tokens = 0
    keep_from = len(messages)
    for i in range(len(messages) - 1, -1, -1):
        msg_tokens = estimate_tokens([messages[i]])
        if keep_tokens + msg_tokens > config.sm_max_tokens:
            break
        keep_tokens += msg_tokens
        keep_from = i

    # Messages to summarize (everything before keep_from)
    to_summarize = messages[:keep_from]
    to_keep = messages[keep_from:]

    if not to_summarize:
        return messages  # nothing to compress

    # Step 3: Build conversation text for summarization
    conversation_text = ""
    for msg in to_summarize:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")

        if isinstance(content, str) and content:
            # Truncate very long content in the dump
            if len(content) > 2000:
                content = content[:2000] + "\n[...truncated for summary...]"
            conversation_text += f"[{role}]: {content}\n\n"

        # Include tool call info
        tool_calls = msg.get("tool_calls", [])
        for tc in tool_calls:
            name = tc.get("function", {}).get("name", "?")
            args_preview = tc.get("function", {}).get("arguments", "")[:200]
            conversation_text += f"[{role}]: [tool_call: {name}({args_preview})]\n\n"

    # Step 4: Call API for summary
    summary_prompt = (
        "Summarize this conversation segment. Structure your summary as:\n\n"
        "## Task\nWhat the user is trying to accomplish.\n\n"
        "## Progress\nWhat has been done so far (files modified, tools used, decisions made).\n\n"
        "## Current State\nWhere things stand now. Any pending work.\n\n"
        "## Key Context\nImportant details needed to continue (variable names, file paths, "
        "error messages, user preferences).\n\n"
        "Be concise. Preserve specific details (paths, names, numbers). "
        "Omit pleasantries and meta-commentary.\n\n"
        f"--- CONVERSATION ({len(to_summarize)} messages) ---\n"
        f"{conversation_text}"
    )

    try:
        summary = await call_api(
            api_key=api_key,
            model=config.model,
            system="You are a conversation summarizer. Output a structured summary.",
            messages=[{"role": "user", "content": summary_prompt}],
            max_tokens=config.summary_max_tokens,
        )
    except Exception:
        # Prompt too long — truncate and retry
        # Take only the last half of to_summarize
        half = len(to_summarize) // 2
        truncated_text = ""
        for msg in to_summarize[half:]:
            content = msg.get("content", "")
            if isinstance(content, str) and content:
                truncated_text += f"[{msg.get('role')}]: {content[:1000]}\n\n"

        summary = await call_api(
            api_key=api_key,
            model=config.model,
            system="You are a conversation summarizer. Output a structured summary.",
            messages=[{"role": "user", "content": (
                "Summarize this conversation (truncated due to length):\n\n"
                f"[First {half} messages omitted]\n\n{truncated_text}"
            )}],
            max_tokens=config.summary_max_tokens,
        )

    # Step 5: Update session memory
    save_session_memory(summary)

    # Step 6: Build compressed output
    return [
        {
            "role": "user",
            "content": (
                "[COMPACT BOUNDARY — AI-generated summary]\n\n"
                f"{summary}\n\n"
                "[END SUMMARY — Recent messages follow]\n"
                "[Full history saved to .agent/context/history.jsonl]"
            ),
        },
        {
            "role": "assistant",
            "content": "Understood. I have the summarized context. Continuing.",
        },
    ] + to_keep


# ============================================================
# Layer 5: API-Native Context Management
# ============================================================

def layer5_api_native_params(
    messages: list[dict],
    config: CompactConfig,
) -> dict | None:
    """Generate API-native context management parameters.

    Anthropic API supports server-side context trimming:
        {"context_management": {"max_input_tokens": 180000, "target": 40000}}

    OpenAI does not have this. We return the parameters that WOULD be
    sent if using Anthropic API, and the API caller can include them
    if the provider supports it.

    This is a request-time optimization, not a message mutation.
    The messages list is NOT modified.

    Returns: dict of API params to merge into the request, or None.
    """
    tokens = estimate_tokens(messages)
    if tokens <= config.api_max_input_tokens:
        return None

    # Would tell the API: "trim this down to target"
    return {
        "context_management": {
            "strategy": "clear_tool_uses",
            "max_input_tokens": config.api_max_input_tokens,
            "target_input_tokens": config.api_target_input_tokens,
        }
    }


# ============================================================
# Orchestrator: Run layers in order
# ============================================================

def needs_compaction(messages: list[dict], config: CompactConfig) -> bool:
    """Check if any compaction is needed."""
    return estimate_tokens(messages) >= config.trigger_threshold


async def run_compaction(
    messages: list[dict],
    config: CompactConfig,
    api_key: str,
    state: CompactState | None = None,
    force: bool = False,
) -> list[dict]:
    """Run the 5-layer compaction chain.

    Order (lightest → heaviest):
        Pre-step: Layer 1 (time-based, runs regardless)
        Layer 2: Cached microcompact (if tool count high)
        Layer 3: Session memory (if memory file exists)
        Layer 4: Full compact (always works, costs 1 API call)
        Layer 5: API-native (returned as metadata, not applied here)

    Each layer checks if it brought tokens under threshold.
    If yes, stop. If no, try the next layer.

    force=True skips threshold checks (for manual /compact).
    """
    if state is None:
        state = get_state()

    if state.circuit_broken and not force:
        return messages  # too many failures, stop trying

    # ── Pre-step: Layer 1 (time-based) ──
    messages, l1_changed = layer1_time_based_microcompact(messages, config, state)
    if l1_changed and not force and not needs_compaction(messages, config):
        return messages

    # ── Layer 2: Cached microcompact ──
    messages, l2_changed = layer2_cached_microcompact(messages, config, state)
    if l2_changed and not force and not needs_compaction(messages, config):
        return messages

    # ── Layer 3: Session memory compact ──
    l3_result = layer3_session_memory_compact(messages, config)
    if l3_result is not None:
        if not force and not needs_compaction(l3_result, config):
            return l3_result
        # Session memory wasn't enough, but use it as a starting point
        # for Layer 4 (fewer messages to summarize)
        messages = l3_result

    # ── Layer 4: Full compact ──
    try:
        result = await layer4_full_compact(messages, config, api_key)
        state.reset()
        return result
    except Exception as e:
        state.compact_failures += 1
        # If Layer 4 fails, return whatever we have (L1/L2/L3 may have helped)
        return messages
