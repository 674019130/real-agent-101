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
from src.tools.executor import StreamingToolExecutor
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
from src.environment import get_environment_prompt
from src.permissions.types import PermissionMode
from src.tools.subagent import SubAgentTool
from src.tools.skill import SkillTool
from src.skills.loader import (
    scan_skills, scan_commands,
    get_skills_prompt, get_commands_prompt,
    load_command_body,
)

load_dotenv()

console = Console()

# ============================================================
# Configuration
# ============================================================

API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL = "gpt-4o"
compact_config = CompactConfig(model=MODEL)

# ── Scan skills and commands at startup ──
_skills = scan_skills()
_commands = scan_commands()
_command_map = {cmd.name: cmd for cmd in _commands}

# System prompt: assembled from all components
# This is built ONCE at startup and never changes (KV cache friendly)
SYSTEM_PROMPT = "\n\n".join(filter(None, [
    "You are a helpful coding assistant. Be concise and direct.",
    get_environment_prompt(),
    f"# Context Persistence\n{get_context_dir_description()}",
    get_skills_prompt(_skills),
    get_commands_prompt(_commands),
]))


def build_registry() -> ToolRegistry:
    """Register all available tools including sub-agent."""
    registry = ToolRegistry()
    registry.register(BashTool())
    registry.register(FileReadTool())
    registry.register(FileWriteTool())
    registry.register(FileEditTool())
    registry.register(TodoTool())

    # Skill tool: model can load skill content on demand (Layer 2)
    if _skills:
        registry.register(SkillTool(_skills))

    # Sub-agent: inherits all tools above, configured after registry is built
    sub_agent = SubAgentTool()
    sub_agent.configure(registry, {
        "api_key": API_KEY,
        "model": MODEL,
        "system": SYSTEM_PROMPT,
    })
    registry.register(sub_agent)

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

        # ── Command expansion: /xxx → expand template as user message ──
        if user_input.strip().startswith("/"):
            cmd_name = user_input.strip()[1:].split()[0]
            cmd = _command_map.get(cmd_name)
            if cmd:
                body = load_command_body(cmd)
                console.print(f"[dim]Expanding command: /{cmd_name}[/dim]")
                user_input = body
            # If not a known command, pass through as regular input

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

            # ── 4. Call API with streaming + mid-stream tool execution ──
            assistant_text = ""
            tool_calls = []         # accumulator for SSE chunks
            submitted = set()       # indices already submitted to executor
            finish_reason = None
            executor = StreamingToolExecutor(registry, permission_mode)

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

                    # Accumulate tool_calls chunk by chunk
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

                        # ── Mid-stream execution trigger ──
                        # When a new index appears, the previous one is complete.
                        # Submit it to the executor immediately.
                        for i in range(len(tool_calls) - 1):
                            if i not in submitted and tool_calls[i]["id"]:
                                executor.add_tool(
                                    i, tool_calls[i]["id"],
                                    tool_calls[i]["function"]["name"],
                                    tool_calls[i]["function"]["arguments"],
                                )
                                submitted.add(i)

                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]

            except Exception as e:
                console.print(f"\n[bold red]Error:[/bold red] {e}")
                messages.pop()
                break

            print()

            # Submit the last tool_call (wasn't caught mid-stream)
            if finish_reason == "tool_calls":
                for i in range(len(tool_calls)):
                    if i not in submitted and tool_calls[i]["id"]:
                        executor.add_tool(
                            i, tool_calls[i]["id"],
                            tool_calls[i]["function"]["name"],
                            tool_calls[i]["function"]["arguments"],
                        )
                        submitted.add(i)

            # ── 5. Append assistant message ──
            assistant_msg = {"role": "assistant", "content": assistant_text or None}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            messages.append(assistant_msg)
            compact_state.record_assistant_message()

            # ── 6. Wait for all tool executions, collect results in order ──
            if finish_reason == "tool_calls" and tool_calls:
                results = await executor.wait_all()

                for tool_call_id, result_content in results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": result_content,
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
