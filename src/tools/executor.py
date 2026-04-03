"""Streaming Tool Executor: mid-stream execution with concurrency control.

Design (from Claude Code's StreamingToolExecutor.ts):

1. As each tool_call completes during SSE streaming, it's added to a queue
2. The queue processor checks: can this tool run now?
   - concurrent_safe + all currently running are concurrent_safe → run immediately
   - NOT concurrent_safe → block queue, wait for all running to finish, then run alone
3. Results accumulate in a buffer
4. After all tool_calls are received (finish_reason), wait for all executions to complete
5. Return results in original tool_call order

Key invariant: non-concurrent-safe tools NEVER overlap with anything else.
This guarantees implicit dependency ordering without explicit dependency tracking.
"""

import asyncio
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from rich.console import Console

from src.types import Tool
from src.tools.registry import ToolRegistry
from src.permissions.types import PermissionLevel, PermissionMode
from src.permissions.checker import check_permission, prompt_user

console = Console()


class ToolStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    DENIED = "denied"
    REJECTED = "rejected"


@dataclass
class ToolTask:
    """A single tool execution task in the queue."""
    index: int                  # original position in tool_calls array
    tool_call_id: str
    tool_name: str
    tool_args: dict
    tool: Tool | None
    is_concurrent_safe: bool
    status: ToolStatus = ToolStatus.QUEUED
    result: str = ""
    _task: asyncio.Task | None = field(default=None, repr=False)


class StreamingToolExecutor:
    """Queue-based tool executor with concurrency control.

    Usage:
        executor = StreamingToolExecutor(registry, permission_mode)

        # During SSE streaming, as each tool_call completes:
        executor.add_tool(index, tool_call_id, name, args)

        # After finish_reason received:
        results = await executor.wait_all()
        # results is list of (tool_call_id, content) in original order
    """

    def __init__(self, registry: ToolRegistry, permission_mode: PermissionMode):
        self._registry = registry
        self._permission_mode = permission_mode
        self._queue: list[ToolTask] = []
        self._running: list[ToolTask] = []
        self._results: dict[int, tuple[str, str]] = {}  # index → (tool_call_id, result)
        self._queue_event = asyncio.Event()

    def add_tool(self, index: int, tool_call_id: str, name: str, args_json: str):
        """Add a completed tool_call to the execution queue.

        Called mid-stream when a tool_call's arguments are fully received.
        Immediately tries to start execution if possible.
        """
        try:
            args = json.loads(args_json) if args_json else {}
        except json.JSONDecodeError:
            args = {}

        tool = self._registry.get(name)
        is_safe = tool.is_concurrent_safe if tool else False

        task = ToolTask(
            index=index,
            tool_call_id=tool_call_id,
            tool_name=name,
            tool_args=args,
            tool=tool,
            is_concurrent_safe=is_safe,
        )
        self._queue.append(task)

        # Signal the queue processor
        self._queue_event.set()

    async def wait_all(self) -> list[tuple[str, str]]:
        """Wait for all queued and running tools to complete.

        Returns results in original tool_call order:
        [(tool_call_id, result_content), ...]
        """
        # Process queue until everything is done
        while True:
            await self._process_queue()

            # Check if everything is done
            all_done = all(
                t.status in (ToolStatus.DONE, ToolStatus.DENIED, ToolStatus.REJECTED)
                for t in self._queue
            )
            if all_done:
                break

            # Wait for a running task to complete before re-processing
            running_tasks = [t._task for t in self._running if t._task]
            if running_tasks:
                await asyncio.wait(running_tasks, return_when=asyncio.FIRST_COMPLETED)
            else:
                # Nothing running, but not all done — process again
                await asyncio.sleep(0)

        # Collect results in original order
        results = []
        for task in sorted(self._queue, key=lambda t: t.index):
            results.append((task.tool_call_id, task.result))
        return results

    async def _process_queue(self):
        """Process queued tools, respecting concurrency rules.

        Core logic:
        - Walk the queue in order
        - concurrent_safe + all running are safe → start immediately
        - NOT concurrent_safe → STOP, wait for running to finish, then start alone
        """
        # Clean up finished tasks from running list
        self._running = [t for t in self._running if t.status == ToolStatus.RUNNING]

        for task in self._queue:
            if task.status != ToolStatus.QUEUED:
                continue

            if self._can_execute(task):
                await self._start_task(task)
            else:
                if not task.is_concurrent_safe:
                    # Non-concurrent-safe: block queue, don't look further
                    break

    def _can_execute(self, task: ToolTask) -> bool:
        """Check if a task can start executing now."""
        if not self._running:
            return True

        if task.is_concurrent_safe:
            # Can run if all currently running are also concurrent_safe
            return all(t.is_concurrent_safe for t in self._running)

        # Non-concurrent-safe: can only run if nothing else is running
        return len(self._running) == 0

    async def _start_task(self, task: ToolTask):
        """Start executing a tool task."""
        # Permission check first (synchronous, may block for user input)
        permitted = await self._check_permission(task)
        if not permitted:
            return

        task.status = ToolStatus.RUNNING
        self._running.append(task)

        console.print(f"[dim]Running {task.tool_name}...[/dim]")

        # Launch async execution
        task._task = asyncio.create_task(self._execute_task(task))

    async def _execute_task(self, task: ToolTask):
        """Execute a single tool and store the result."""
        try:
            result = await self._registry.dispatch(task.tool_name, task.tool_args)
            if task.tool:
                console.print(task.tool.render(result))
            task.result = result
        except Exception as e:
            task.result = f"Error executing {task.tool_name}: {e}"
        finally:
            task.status = ToolStatus.DONE
            # Wake up the queue processor
            self._queue_event.set()

    async def _check_permission(self, task: ToolTask) -> bool:
        """Run permission check. Returns True if execution is allowed."""
        if not task.tool:
            task.result = f"Error: unknown tool '{task.tool_name}'"
            task.status = ToolStatus.DENIED
            return False

        # Step 1: Tool declares its permission level
        tool_level, bypass_immune = task.tool.check_permission(**task.tool_args)

        # Step 2: Apply global mode
        final_level = check_permission(
            task.tool_name, tool_level, self._permission_mode, bypass_immune
        )

        # Step 3: Act
        if final_level == PermissionLevel.DENY:
            console.print(f"[bold red]Denied:[/bold red] {task.tool_name}")
            task.result = (
                f"DENIED: '{task.tool_name}' is not allowed with these parameters. "
                "This operation requires explicit user request."
            )
            task.status = ToolStatus.DENIED
            return False

        if final_level == PermissionLevel.ASK:
            approved = prompt_user(task.tool_name, task.tool_args)
            if not approved:
                task.result = (
                    f"REJECTED: User denied execution of '{task.tool_name}'. "
                    "Do not retry. Ask the user what they'd like instead."
                )
                task.status = ToolStatus.REJECTED
                return False

        return True
