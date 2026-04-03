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

Production features:
- Error cascade: bash failure aborts sibling tasks (non-read-only tools)
- Unified timeout: executor-level timeout for individual tools
- Progress callback: long-running tools can report intermediate status
"""

import asyncio
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

from rich.console import Console

from src.types import Tool
from src.tools.registry import ToolRegistry
from src.permissions.types import PermissionLevel, PermissionMode
from src.permissions.checker import check_permission, prompt_user

console = Console()

# ── Configuration ──
DEFAULT_TOOL_TIMEOUT = 120.0    # seconds, per-tool execution timeout
BASH_TOOL_TIMEOUT = 30.0        # bash has its own shorter timeout


class ToolStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    DENIED = "denied"
    REJECTED = "rejected"
    ABORTED = "aborted"         # killed by error cascade
    TIMED_OUT = "timed_out"


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

    Production features:
        - Error cascade: bash errors abort queued non-read-only siblings
        - Unified timeout: per-tool timeout with cleanup
        - Progress callback: on_progress(tool_name, message) for long ops
    """

    def __init__(
        self,
        registry: ToolRegistry,
        permission_mode: PermissionMode,
        on_progress: Callable[[str, str], None] | None = None,
    ):
        self._registry = registry
        self._permission_mode = permission_mode
        self._on_progress = on_progress
        self._queue: list[ToolTask] = []
        self._running: list[ToolTask] = []
        self._aborted = False       # set True when error cascade fires
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
        self._queue_event.set()

    async def wait_all(self) -> list[tuple[str, str]]:
        """Wait for all queued and running tools to complete.

        Returns results in original tool_call order:
        [(tool_call_id, result_content), ...]
        """
        while True:
            await self._process_queue()

            all_done = all(
                t.status in (
                    ToolStatus.DONE, ToolStatus.DENIED,
                    ToolStatus.REJECTED, ToolStatus.ABORTED,
                    ToolStatus.TIMED_OUT,
                )
                for t in self._queue
            )
            if all_done:
                break

            running_tasks = [t._task for t in self._running if t._task]
            if running_tasks:
                await asyncio.wait(running_tasks, return_when=asyncio.FIRST_COMPLETED)
            else:
                await asyncio.sleep(0)

        # Collect results in original order
        return [
            (task.tool_call_id, task.result)
            for task in sorted(self._queue, key=lambda t: t.index)
        ]

    # ── Queue Processing ──

    async def _process_queue(self):
        """Process queued tools, respecting concurrency rules.

        Walk the queue in order:
        - concurrent_safe + all running are safe → start immediately
        - NOT concurrent_safe → STOP, wait for running to finish
        - If error cascade active → abort remaining queued non-safe tools
        """
        self._running = [t for t in self._running if t.status == ToolStatus.RUNNING]

        for task in self._queue:
            if task.status != ToolStatus.QUEUED:
                continue

            # Error cascade: abort queued non-read-only tools
            if self._aborted and not task.is_concurrent_safe:
                task.status = ToolStatus.ABORTED
                task.result = (
                    f"ABORTED: '{task.tool_name}' was cancelled because a "
                    "previous tool failed. Review the error above."
                )
                console.print(f"[dim]Aborted {task.tool_name} (error cascade)[/dim]")
                continue

            if self._can_execute(task):
                await self._start_task(task)
            else:
                if not task.is_concurrent_safe:
                    break

    def _can_execute(self, task: ToolTask) -> bool:
        """Check if a task can start executing now."""
        if not self._running:
            return True
        if task.is_concurrent_safe:
            return all(t.is_concurrent_safe for t in self._running)
        return len(self._running) == 0

    # ── Task Lifecycle ──

    async def _start_task(self, task: ToolTask):
        """Start executing a tool task (permission check + async launch)."""
        permitted = await self._check_permission(task)
        if not permitted:
            return

        task.status = ToolStatus.RUNNING
        self._running.append(task)

        # Progress callback: notify that tool is starting
        if self._on_progress:
            self._on_progress(task.tool_name, "starting")

        console.print(f"[dim]Running {task.tool_name}...[/dim]")
        task._task = asyncio.create_task(self._execute_with_timeout(task))

    async def _execute_with_timeout(self, task: ToolTask):
        """Execute a tool with unified timeout.

        Timeout values:
        - bash: 30s (already has internal timeout, this is a safety net)
        - other tools: 120s default
        """
        timeout = BASH_TOOL_TIMEOUT if task.tool_name == "bash" else DEFAULT_TOOL_TIMEOUT

        try:
            result = await asyncio.wait_for(
                self._registry.dispatch(task.tool_name, task.tool_args),
                timeout=timeout,
            )
            if task.tool:
                console.print(task.tool.render(result))
            task.result = result

            # Bash error cascade: non-zero exit code = failure
            if task.tool_name == "bash" and result.startswith("Exit code:"):
                self._trigger_error_cascade(task)

            # Progress callback: done
            if self._on_progress:
                self._on_progress(task.tool_name, "done")

        except asyncio.TimeoutError:
            task.result = (
                f"Error: {task.tool_name} timed out after {timeout:.0f}s. "
                "The operation took too long. Try a simpler approach."
            )
            task.status = ToolStatus.TIMED_OUT
            console.print(f"[bold red]Timeout:[/bold red] {task.tool_name} ({timeout:.0f}s)")

            # Timeout on bash triggers error cascade (same as error)
            if task.tool_name == "bash":
                self._trigger_error_cascade(task)
            return

        except Exception as e:
            task.result = f"Error executing {task.tool_name}: {e}"

            # Bash errors cascade to siblings
            if task.tool_name == "bash":
                self._trigger_error_cascade(task)

        finally:
            if task.status == ToolStatus.RUNNING:
                task.status = ToolStatus.DONE
            self._queue_event.set()

    def _trigger_error_cascade(self, failed_task: ToolTask):
        """Abort queued non-read-only siblings after a bash failure.

        Claude Code behavior (StreamingToolExecutor.ts):
        - Bash errors abort sibling tasks via siblingAbortController
        - Read-only tools do NOT cascade (they're independent)
        - Only bash triggers cascade (not file_read, not file_edit)

        This prevents a sequence like:
            bash("npm test") [FAIL] → bash("git commit") [should NOT run]
        """
        self._aborted = True
        console.print(
            f"[bold red]Error cascade:[/bold red] {failed_task.tool_name} failed, "
            "aborting remaining write operations"
        )

        # Cancel running async tasks for non-safe tools
        for task in self._running:
            if task is not failed_task and not task.is_concurrent_safe and task._task:
                task._task.cancel()

    # ── Permission Check ──

    async def _check_permission(self, task: ToolTask) -> bool:
        """Run 3-step permission check. Returns True if execution is allowed."""
        if not task.tool:
            task.result = f"Error: unknown tool '{task.tool_name}'"
            task.status = ToolStatus.DENIED
            return False

        tool_level, bypass_immune = task.tool.check_permission(**task.tool_args)

        final_level = check_permission(
            task.tool_name, tool_level, self._permission_mode, bypass_immune
        )

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
