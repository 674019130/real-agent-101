"""Hook engine: run user-defined scripts at key lifecycle points.

Hooks are shell scripts that execute at specific events in the agent lifecycle.
They receive context via stdin (JSON) and can return decisions via stdout (JSON).

Events:
    PreToolUse   — before a tool runs (can modify params, block, or allow)
    PostToolUse  — after a tool completes (can modify output, log, audit)
    Notification — agent wants to notify the user (e.g. task done)

Hook configuration lives in .agent/hooks.json:
{
    "PreToolUse": ["./hooks/pre-check.sh"],
    "PostToolUse": ["./hooks/audit-log.sh"],
    "Notification": ["./hooks/notify.sh"]
}

Each hook script:
    - Receives JSON on stdin: {"event": "...", "tool": "...", "params": {...}, ...}
    - Returns JSON on stdout:
        PreToolUse:  {"behavior": "allow"} or {"behavior": "deny", "message": "..."}
                     or {"behavior": "allow", "params": {...}}  ← modify tool params!
        PostToolUse: {"behavior": "allow"} or {"behavior": "allow", "output": "..."}  ← modify output!
    - Has a timeout (5 seconds default)
    - Non-zero exit code = hook failed, treated as "allow" (fail-open)

The real value of hooks is NOT the mechanism (subprocess + json),
it's the INTEGRATION DEPTH:
    - PreToolUse can surgically modify tool params (e.g. add -i to rm commands)
    - PostToolUse can sanitize tool output before model sees it
    - In production (CC): hooks integrate bidirectionally with the permission system

Design choices:
    - Fail-open: a broken hook doesn't block the agent
    - Timeout: prevents hung hooks from freezing the agent
    - JSON I/O: language-agnostic, any shell script works
    - Multiple hooks per event: all must "allow" for the event to proceed
"""

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any

from rich.console import Console

console = Console()

HOOKS_CONFIG_PATH = ".agent/hooks.json"
HOOK_TIMEOUT = 5.0  # seconds


@dataclass
class HookResult:
    """Result from running a hook script."""
    behavior: str       # "allow" | "deny"
    message: str = ""   # optional deny reason
    modified_params: dict | None = None  # PreToolUse: hook can modify tool input
    modified_output: str | None = None   # PostToolUse: hook can modify tool output


def load_hooks_config() -> dict[str, list[str]]:
    """Load hook configuration from .agent/hooks.json.
    Returns empty dict if file doesn't exist."""
    if not os.path.exists(HOOKS_CONFIG_PATH):
        return {}
    try:
        with open(HOOKS_CONFIG_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


async def run_hook(script: str, event_data: dict) -> HookResult:
    """Run a single hook script.

    Sends event_data as JSON to stdin, reads JSON from stdout.
    Times out after HOOK_TIMEOUT seconds.
    Fail-open: errors or timeout → allow.
    """
    try:
        proc = await asyncio.create_subprocess_shell(
            script,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        input_json = json.dumps(event_data, ensure_ascii=False).encode()
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=input_json),
            timeout=HOOK_TIMEOUT,
        )

        if proc.returncode != 0:
            console.print(f"[dim]Hook '{script}' exited with code {proc.returncode}[/dim]")
            return HookResult(behavior="allow")

        # Parse stdout as JSON
        output = stdout.decode().strip()
        if not output:
            return HookResult(behavior="allow")

        result = json.loads(output)
        return HookResult(
            behavior=result.get("behavior", "allow"),
            message=result.get("message", ""),
            modified_params=result.get("params"),
            modified_output=result.get("output"),
        )

    except asyncio.TimeoutError:
        console.print(f"[dim]Hook '{script}' timed out ({HOOK_TIMEOUT}s)[/dim]")
        return HookResult(behavior="allow")
    except Exception as e:
        console.print(f"[dim]Hook '{script}' error: {e}[/dim]")
        return HookResult(behavior="allow")


async def run_hooks(event: str, event_data: dict) -> HookResult:
    """Run all hooks registered for an event.

    All hooks must "allow" for the event to proceed.
    First "deny" stops execution and returns the deny result.
    If a hook modifies params, the modified params are passed to subsequent hooks.
    """
    config = load_hooks_config()
    scripts = config.get(event, [])

    if not scripts:
        return HookResult(behavior="allow")

    current_params = event_data.get("params", {})

    for script in scripts:
        data = {**event_data, "params": current_params}
        result = await run_hook(script, data)

        if result.behavior == "deny":
            return result

        # Allow hook to modify params for next hook / actual execution
        if result.modified_params is not None:
            current_params = result.modified_params

    return HookResult(behavior="allow", modified_params=current_params)
