"""Real Agent 101 - Main entry point."""

import asyncio
import json
import os
import sys

from dotenv import load_dotenv
from rich.console import Console

from src.api import stream_response
from src.tools.registry import ToolRegistry
from src.context.compact import needs_compaction, compact_messages
from src.types import CompactConfig

load_dotenv()

console = Console()

# ============================================================
# Configuration
# ============================================================

API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL = "gpt-4o"
SYSTEM_PROMPT = "You are a helpful coding assistant. Be concise and direct."

compact_config = CompactConfig(model=MODEL)


# ============================================================
# Agent Loop
# ============================================================

async def agent_loop():
    """The core agent loop: input → API → output → repeat.

    Flow:
        while True:
            1. Read user input
            2. Append to messages
            3. Check if compaction needed (BEFORE calling API)
            4. Call API (streaming)
            5. Collect response: text + tool_calls
            6. Append assistant message to history
            7. If stop_reason is "tool_calls" → execute tools → continue
            8. If stop_reason is "stop" → show output → back to 1
    """

    messages: list[dict] = []
    registry = ToolRegistry()
    # Tools will be registered here in future lessons

    console.print("[bold green]Real Agent 101[/bold green] — type 'quit' to exit\n")

    while True:
        # ── 1. User input ──
        try:
            user_input = console.input("[bold cyan]You:[/bold cyan] ")
        except (EOFError, KeyboardInterrupt):
            console.print("\nBye!")
            break

        if user_input.strip().lower() in ("quit", "exit"):
            console.print("Bye!")
            break

        if not user_input.strip():
            continue

        messages.append({"role": "user", "content": user_input})

        # ── 2. Check compaction BEFORE sending to API ──
        if needs_compaction(messages, compact_config):
            console.print("[dim]Compacting context...[/dim]")
            messages = await compact_messages(messages, compact_config, API_KEY)

        # ── 3. Call API with streaming ──
        assistant_text = ""
        tool_calls = []        # OpenAI tool_calls accumulator
        finish_reason = None

        console.print("[bold magenta]Assistant:[/bold magenta] ", end="")

        try:
            async for chunk in stream_response(
                api_key=API_KEY,
                model=MODEL,
                system=SYSTEM_PROMPT,
                messages=messages,
                tools=registry.get_api_schemas() or None,
            ):
                choices = chunk.get("choices", [])
                if not choices:
                    continue

                choice = choices[0]
                delta = choice.get("delta", {})

                # ── Stream text content ──
                if delta.get("content"):
                    text = delta["content"]
                    print(text, end="", flush=True)
                    assistant_text += text

                # ── Collect tool_calls (streamed incrementally) ──
                if delta.get("tool_calls"):
                    for tc in delta["tool_calls"]:
                        idx = tc["index"]
                        # Grow the list if needed
                        while len(tool_calls) <= idx:
                            tool_calls.append({
                                "id": "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            })
                        if tc.get("id"):
                            tool_calls[idx]["id"] = tc["id"]
                        if tc.get("function", {}).get("name"):
                            tool_calls[idx]["function"]["name"] = tc["function"]["name"]
                        if tc.get("function", {}).get("arguments"):
                            tool_calls[idx]["function"]["arguments"] += tc["function"]["arguments"]

                # ── Read finish_reason ──
                if choice.get("finish_reason"):
                    finish_reason = choice["finish_reason"]

        except Exception as e:
            console.print(f"\n[bold red]Error:[/bold red] {e}")
            messages.pop()  # remove the failed user message
            continue

        print()  # newline after streaming

        # ── 4. Append assistant message to history ──
        assistant_msg = {"role": "assistant", "content": assistant_text or None}
        if tool_calls:
            assistant_msg["tool_calls"] = tool_calls
        messages.append(assistant_msg)

        # ── 5. Handle tool_calls (future lessons) ──
        if finish_reason == "tool_calls" and tool_calls:
            console.print("[dim]Tool calls requested but not yet implemented.[/dim]")
            # Future: execute each tool, append tool results, continue loop


def main():
    if not API_KEY:
        console.print("[bold red]Error:[/bold red] Set OPENAI_API_KEY in .env or environment")
        sys.exit(1)
    asyncio.run(agent_loop())


if __name__ == "__main__":
    main()
