"""Real Agent 101 - Main entry point."""

import argparse
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
from src.context.compact import (
    CompactConfig, CompactState, get_state,
    needs_compaction, run_compaction,
    layer1_time_based_microcompact,
)
from src.context.persistence import get_context_dir_description
from src.permissions.types import PermissionLevel, PermissionMode
from src.permissions.checker import check_permission, prompt_user

load_dotenv()

console = Console()

# ============================================================
# Configuration
# ============================================================

API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL = "gpt-4o"
compact_config = CompactConfig(model=MODEL)

# System prompt includes context persistence paths
SYSTEM_PROMPT = (
    "You are a helpful coding assistant. Be concise and direct.\n\n"
    f"# Context Persistence\n{get_context_dir_description()}"
)


def build_registry() -> ToolRegistry:
    """Register all available tools."""
    registry = ToolRegistry()
    registry.register(BashTool())
    registry.register(FileReadTool())
    registry.register(FileWriteTool())
    registry.register(FileEditTool())
    registry.register(TodoTool())
    return registry


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments. --mode sets the global permission mode."""
    parser = argparse.ArgumentParser(description="Real Agent 101")
    parser.add_argument(
        "--mode",
        choices=["normal", "auto", "yolo"],
        default="normal",
        help="Permission mode: normal (default), auto, yolo",
    )
    return parser.parse_args()


# ============================================================
# Agent Loop
# ============================================================

async def agent_loop(permission_mode: PermissionMode):
    """The core agent loop with three-tier permission system.

    Permission flow per tool call:
        1. tool.check_permission(**params) → (level, bypass_immune)
        2. check_permission(level, mode, bypass_immune) → final_level
        3. AUTO → execute immediately
           ASK  → prompt user y/n
           DENY → return REJECTED to model
    """

    messages: list[dict] = []
    registry = build_registry()
    compact_state = get_state()

    mode_label = {
        PermissionMode.NORMAL: "normal",
        PermissionMode.AUTO: "auto",
        PermissionMode.YOLO: "[bold red]yolo[/bold red]",
    }[permission_mode]

    console.print(f"[bold green]Real Agent 101[/bold green] — mode: {mode_label} — type 'quit' to exit\n")

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

        # ── Inner loop: tool execution chain ──
        while True:
            # ── 2. Pre-step: time-based microcompact (Layer 1) ──
            messages, _ = layer1_time_based_microcompact(
                messages, compact_config, compact_state
            )

            # ── 3. Check if full compaction needed (Layers 2-4) ──
            if needs_compaction(messages, compact_config):
                console.print("[dim]Compacting context...[/dim]")
                messages = await run_compaction(
                    messages, compact_config, API_KEY, compact_state
                )

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

                    if delta.get("content"):
                        text = delta["content"]
                        print(text, end="", flush=True)
                        assistant_text += text

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

            print()

            # ── 5. Append assistant message ──
            assistant_msg = {"role": "assistant", "content": assistant_text or None}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            messages.append(assistant_msg)
            compact_state.record_assistant_message()

            # ── 5. Handle tool_calls with permission system ──
            if finish_reason == "tool_calls" and tool_calls:
                for tc in tool_calls:
                    func_name = tc["function"]["name"]
                    try:
                        func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                    except json.JSONDecodeError:
                        func_args = {}

                    tool = registry.get(func_name)
                    if not tool:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": f"Error: unknown tool '{func_name}'",
                        })
                        continue

                    # ── Permission check (3 steps) ──

                    # Step 1: Tool declares its own permission level
                    tool_level, bypass_immune = tool.check_permission(**func_args)

                    # Step 2: Apply global mode
                    final_level = check_permission(
                        func_name, tool_level, permission_mode, bypass_immune
                    )

                    # Step 3: Act on the final level
                    if final_level == PermissionLevel.DENY:
                        console.print(f"[bold red]Denied:[/bold red] {func_name}")
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": f"DENIED: '{func_name}' is not allowed with these parameters. This operation requires explicit user request.",
                        })
                        continue

                    if final_level == PermissionLevel.ASK:
                        approved = prompt_user(func_name, func_args)
                        if not approved:
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc["id"],
                                "content": f"REJECTED: User denied execution of '{func_name}'. Do not retry. Ask the user what they'd like instead.",
                            })
                            continue

                    # final_level == AUTO or user approved → execute
                    console.print(f"[dim]Running {func_name}...[/dim]")
                    result = await registry.dispatch(func_name, func_args)

                    if tool:
                        console.print(tool.render(result))

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result,
                    })
                    compact_state.record_tool_result()

                continue

            break


def main():
    args = parse_args()

    if not API_KEY:
        console.print("[bold red]Error:[/bold red] Set OPENAI_API_KEY in .env or environment")
        sys.exit(1)

    permission_mode = PermissionMode(args.mode)
    init_store(".agent/todo.json")

    asyncio.run(agent_loop(permission_mode))


if __name__ == "__main__":
    main()
