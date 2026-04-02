"""Token estimation utilities.

Production-grade would use tiktoken for exact counts.
We use char/4 for threshold checks (good enough for triggering decisions)
and provide a hook for exact counting when billing matters.
"""

import json


def estimate_tokens(messages: list[dict]) -> int:
    """Rough token estimate: ~4 chars per token.

    Why char/4:
    - English averages ~4 chars/token, Chinese ~2 chars/token
    - We're using this for threshold checks, not billing
    - Off by 20-30% is fine for "should we compact?" decisions
    - tiktoken would be exact but adds a dependency and ~10ms per call

    Claude Code uses the same rough estimation for auto-compact triggers,
    and exact counting only for telemetry/billing.
    """
    total_chars = 0
    for msg in messages:
        # Count role overhead (~4 tokens per message for role/delimiters)
        total_chars += 16

        content = msg.get("content", "")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for block in content:
                total_chars += len(json.dumps(block, ensure_ascii=False))

        # Count tool_calls if present (arguments can be large)
        tool_calls = msg.get("tool_calls", [])
        for tc in tool_calls:
            total_chars += len(json.dumps(tc, ensure_ascii=False))

    return total_chars // 4
