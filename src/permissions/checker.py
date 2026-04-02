"""Permission checker: the central decision point.

Takes a tool call (tool + params) and the current mode,
returns a PermissionLevel. Does NOT execute the check —
just decides what level of permission is needed.

The actual y/n prompt or auto-approve happens in the agent loop.
"""

from rich.console import Console

from src.permissions.types import PermissionLevel, PermissionMode

console = Console()


def check_permission(
    tool_name: str,
    tool_level: PermissionLevel,
    mode: PermissionMode,
    bypass_immune: bool = False,
) -> PermissionLevel:
    """Apply global mode to the tool's declared permission level.

    Logic:
        1. bypass-immune → always ASK, regardless of mode
        2. YOLO mode → everything becomes AUTO (except bypass-immune)
        3. AUTO mode → ASK becomes AUTO, DENY stays DENY
        4. NORMAL mode → pass through as-is

    Args:
        tool_name: for logging
        tool_level: the level the tool itself declared
        mode: global permission mode
        bypass_immune: if True, always requires confirmation

    Returns:
        Final PermissionLevel after mode adjustment.
    """
    # Bypass-immune checks always require confirmation
    if bypass_immune:
        return PermissionLevel.ASK

    # Apply global mode
    if mode == PermissionMode.YOLO:
        # YOLO: everything auto except DENY → ASK (not auto)
        if tool_level == PermissionLevel.DENY:
            return PermissionLevel.ASK
        return PermissionLevel.AUTO

    if mode == PermissionMode.AUTO:
        # AUTO: ASK becomes AUTO, DENY stays DENY
        if tool_level == PermissionLevel.ASK:
            return PermissionLevel.AUTO
        return tool_level

    # NORMAL: pass through
    return tool_level


def prompt_user(tool_name: str, params: dict) -> bool:
    """Blocking y/n prompt. Returns True if approved."""
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
