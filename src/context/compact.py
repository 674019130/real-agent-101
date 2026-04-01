"""Context compaction: compress conversation history when approaching limits."""

from src.types import CompactConfig
from src.api import call_api


def estimate_tokens(messages: list[dict]) -> int:
    """Rough token estimate: ~4 chars per token.
    Good enough for threshold checks. Not for billing."""
    total_chars = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    total_chars += len(str(block))
                else:
                    total_chars += len(str(block))
    return total_chars // 4


def needs_compaction(messages: list[dict], config: CompactConfig) -> bool:
    """Check if the message list exceeds the compaction threshold."""
    return estimate_tokens(messages) >= config.trigger_threshold


async def compact_messages(
    messages: list[dict],
    config: CompactConfig,
    api_key: str,
) -> list[dict]:
    """Compress the entire conversation into a summary.

    Strategy (L01 - crude):
    - Dump conversation as text, ask model to summarize
    - Replace all messages with 2 messages: summary + ack
    - The model outputs plain text, we wrap it in the fixed structure

    Input: message list
    Output: compressed message list (always 2 messages)
    """
    # Build a text dump of the conversation for summarization
    conversation_text = ""
    for msg in messages:
        role = msg["role"]
        content = msg.get("content", "")
        if isinstance(content, str):
            conversation_text += f"[{role}]: {content}\n\n"
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        conversation_text += f"[{role}]: {block['text']}\n\n"
                    elif block.get("function_call"):
                        conversation_text += f"[{role}]: [called tool: {block['function_call']['name']}]\n\n"

    summary_prompt = (
        "Summarize the following conversation concisely. "
        "Preserve: key decisions made, files modified, current task state, "
        "and any important context needed to continue. "
        "Be concise but complete.\n\n"
        f"--- CONVERSATION ---\n{conversation_text}"
    )

    summary_text = await call_api(
        api_key=api_key,
        model=config.model,
        system="You are a conversation summarizer. Output only the summary.",
        messages=[{"role": "user", "content": summary_prompt}],
        max_tokens=config.summary_max_tokens,
    )

    # Return a fixed 2-message structure with the summary inside
    return [
        {
            "role": "user",
            "content": (
                "[COMPRESSED CONTEXT - Summary of previous conversation]\n\n"
                f"{summary_text}\n\n"
                "[END COMPRESSED CONTEXT - Continue from here]"
            ),
        },
        {
            "role": "assistant",
            "content": "Understood. I have the context of our previous conversation. How can I continue helping you?",
        },
    ]
