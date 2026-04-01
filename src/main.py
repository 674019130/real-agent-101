"""Real Agent 101 - Main entry point."""

import asyncio
import json
import os
import sys

from dotenv import load_dotenv
from rich.console import Console

from src.api import stream_response
from src.tools.registry import ToolRegistry
from src.tools.bash import BashTool
from src.tools.read import FileReadTool
from src.tools.write import FileWriteTool
from src.tools.edit import FileEditTool
from src.tools.todo import TodoTool, init_store
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


def build_registry() -> ToolRegistry:
    """Register all available tools."""
    registry = ToolRegistry()
    registry.register(BashTool())
    registry.register(FileReadTool())
    registry.register(FileWriteTool())
    registry.register(FileEditTool())
    registry.register(TodoTool())
    return registry


def ask_permission(tool_name: str, params: dict) -> bool:
    """Blocking permission check: ask user y/n before executing a tool.
    Returns True if approved, False if rejected."""
    console.print(f"\n[bold yellow]Tool:[/bold yellow] {tool_name}")
    for k, v in params.items():
        display = str(v)
        if len(display) > 200:
            display = display[:200] + "..."
        console.print(f"  {k}: {display}")

    while True:
        answer = console.input("[bold yellow]Allow? (y/n):[/bold yellow] ").strip().lower()
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False


# ============================================================
# Agent Loop
# ============================================================

async def agent_loop():
    """The core agent loop: input → API → output → repeat.

    Flow:
        while True:
            1. Read user input
            2. Append to messages
            3. Check compaction (BEFORE calling API)
            4. Call API (streaming)
            5. Collect response: text + tool_calls
            6. Append assistant message to history
            7. If finish_reason is "tool_calls":
               - For each tool call: check permission → execute → collect result
               - Append tool results to messages
               - Continue loop (go back to step 3, no new user input)
            8. If finish_reason is "stop": back to 1
    """

    messages: list[dict] = []
    registry = build_registry()

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

        # ── Inner loop: keeps running while model requests tool_calls ──
        while True:
            # ── 2. Check compaction ──
            if needs_compaction(messages, compact_config):
                console.print("[dim]Compacting context...[/dim]")
                messages = await compact_messages(messages, compact_config, API_KEY)

            # ── 3. Call API with streaming ──
            assistant_text = ""
            tool_calls = []
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

                    # Stream text
                    if delta.get("content"):
                        text = delta["content"]
                        print(text, end="", flush=True)
                        assistant_text += text

                    # Collect tool_calls
                    if delta.get("tool_calls"):
                        for tc in delta["tool_calls"]:
                            idx = tc["index"]
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

                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]

            except Exception as e:
                console.print(f"\n[bold red]Error:[/bold red] {e}")
                messages.pop()
                break

            print()  # newline after streaming

            # ── 4. Append assistant message ──
            assistant_msg = {"role": "assistant", "content": assistant_text or None}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            messages.append(assistant_msg)

            # ── 5. Handle tool_calls ──
            if finish_reason == "tool_calls" and tool_calls:
                for tc in tool_calls:
                    func_name = tc["function"]["name"]
                    try:
                        func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                    except json.JSONDecodeError:
                        func_args = {}

                    # Permission check
                    tool = registry.get(func_name)
                    needs_permission = True

                    # Read-only tools don't need confirmation
                    if tool and tool.is_concurrent_safe:
                        needs_permission = False

                    # Dangerous bash commands always need confirmation
                    if func_name == "bash" and hasattr(tool, "is_dangerous"):
                        if tool.is_dangerous(func_args.get("command", "")):
                            needs_permission = True

                    if needs_permission:
                        approved = ask_permission(func_name, func_args)
                        if not approved:
                            # User rejected — tell the model explicitly
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "content": f"REJECTED: User denied execution of '{func_name}'. Do not retry this exact command. Ask the user what they'd like to do instead.",
                            })
                            continue

                    # Execute tool
                    console.print(f"[dim]Running {func_name}...[/dim]")
                    result = await registry.dispatch(func_name, func_args)

                    # Render for user display
                    if tool:
                        console.print(tool.render(result))

                    # Append tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result,
                    })

                # Tool results appended — continue inner loop to let model process them
                continue

            # ── 6. No tool_calls: model is done, break inner loop ──
            break


def main():
    if not API_KEY:
        console.print("[bold red]Error:[/bold red] Set OPENAI_API_KEY in .env or environment")
        sys.exit(1)

    # Initialize todo persistence
    init_store(".agent/todo.json")

    asyncio.run(agent_loop())


if __name__ == "__main__":
    main()
