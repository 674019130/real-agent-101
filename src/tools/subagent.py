"""Sub-Agent tool: spawn isolated child agents for complex subtasks.

Design:
    - Sub-agent is created via a tool call (model says "I need a sub-agent")
    - Inherits ALL parent tools EXCEPT SubAgentTool itself (no recursive creation)
    - Completely isolated context: only receives the prompt from parent
    - Runs its own agent loop with its own messages list
    - Returns a text result to the parent when done (finish_reason == "stop")
    - Has a max_turns limit to prevent infinite loops

From Claude Code (TeamCreate/SendMessage):
    - CC allows multiple sub-agents with names
    - CC sub-agents can communicate via SendMessage
    - We simplify: one sub-agent at a time, returns result to parent

The parent should describe:
    - What task the sub-agent should do
    - What success looks like (so the sub-agent knows when to stop)
    - Any relevant context (file paths, requirements)
"""

import asyncio
import json
import os

from src.types import Tool
from src.permissions.types import PermissionLevel


MAX_TURNS = 20  # safety limit: sub-agent can't loop forever


class SubAgentTool(Tool):

    @property
    def name(self) -> str:
        return "sub_agent"

    @property
    def description(self) -> str:
        return (
            "Spawn an isolated sub-agent to handle a complex subtask. "
            "The sub-agent has all your tools but its own separate context. "
            "Use this for tasks that are independent and self-contained, "
            "like 'search the codebase for all usages of X' or "
            "'write tests for module Y'. "
            "Provide a clear task description and success criteria. "
            "The sub-agent will return its result as text when done."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": (
                        "Clear task description for the sub-agent. "
                        "Include: what to do, what success looks like, "
                        "and any relevant file paths or context."
                    ),
                },
                "max_turns": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_TURNS,
                    "description": f"Maximum conversation turns (default: 10, max: {MAX_TURNS}).",
                },
            },
            "required": ["task"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False  # sub-agent may use write tools

    def check_permission(self, **_) -> tuple[PermissionLevel, bool]:
        """Sub-agent creation always requires user confirmation."""
        return PermissionLevel.ASK, False

    async def execute(self, task: str = "", max_turns: int = 10, **_) -> str:
        """Spawn a sub-agent and run it to completion.

        The sub-agent:
        1. Gets a fresh messages list (isolated context)
        2. Inherits parent's tools minus SubAgentTool
        3. Runs its own agent loop for up to max_turns
        4. Returns the final assistant response as result
        """
        if not task:
            return "Error: 'task' is required. Describe what the sub-agent should do."

        # Lazy imports to avoid circular dependency
        from src.api import stream_response
        from src.tools.registry import ToolRegistry

        # These will be injected by the parent before execution
        if not hasattr(self, '_parent_registry') or not hasattr(self, '_api_config'):
            return "Error: sub-agent not properly initialized. Missing parent registry or API config."

        registry: ToolRegistry = self._parent_registry
        api_key: str = self._api_config["api_key"]
        model: str = self._api_config["model"]
        system: str = self._api_config["system"]

        # Build sub-agent registry: all tools except sub_agent itself
        sub_registry = ToolRegistry()
        for tool_name in registry._tools:
            if tool_name != "sub_agent":
                sub_registry.register(registry._tools[tool_name])

        max_turns = min(max_turns, MAX_TURNS)

        # Sub-agent system prompt
        sub_system = (
            f"{system}\n\n"
            "# Sub-Agent Mode\n"
            "You are a sub-agent spawned for a specific task. "
            "Complete the task and provide your final answer. "
            "Be thorough but efficient. Do not ask for user input.\n\n"
            f"# Task\n{task}"
        )

        # Run sub-agent loop
        messages: list[dict] = [{"role": "user", "content": task}]
        last_response = ""

        from rich.console import Console
        console = Console()

        for turn in range(max_turns):
            console.print(f"[dim]  Sub-agent turn {turn + 1}/{max_turns}...[/dim]")

            # Call API
            assistant_text = ""
            tool_calls = []
            finish_reason = None

            try:
                async for chunk in stream_response(
                    api_key=api_key,
                    model=model,
                    system=sub_system,
                    messages=messages,
                    tools=sub_registry.get_api_schemas() or None,
                ):
                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    choice = choices[0]
                    delta = choice.get("delta", {})

                    if delta.get("content"):
                        assistant_text += delta["content"]

                    if delta.get("tool_calls"):
                        for tc in delta["tool_calls"]:
                            idx = tc["index"]
                            while len(tool_calls) <= idx:
                                tool_calls.append({
                                    "id": "", "type": "function",
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
                return f"Sub-agent API error on turn {turn + 1}: {e}"

            # Append assistant message
            assistant_msg = {"role": "assistant", "content": assistant_text or None}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            messages.append(assistant_msg)

            if assistant_text:
                last_response = assistant_text

            # If done, return response
            if finish_reason == "stop":
                break

            # Execute tool calls (serial, simplified — no executor needed)
            if finish_reason == "tool_calls" and tool_calls:
                for tc in tool_calls:
                    func_name = tc["function"]["name"]
                    try:
                        func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                    except json.JSONDecodeError:
                        func_args = {}

                    console.print(f"[dim]  Sub-agent: {func_name}[/dim]")
                    result = await sub_registry.dispatch(func_name, func_args)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result,
                    })
        else:
            last_response += f"\n\n[Sub-agent reached max turns ({max_turns})]"

        if not last_response:
            return "[Sub-agent completed but produced no text response]"

        return last_response

    def configure(self, parent_registry: 'ToolRegistry', api_config: dict):
        """Inject parent's registry and API config before the tool is usable.
        Called during agent initialization."""
        self._parent_registry = parent_registry
        self._api_config = api_config
