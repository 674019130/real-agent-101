"""Bash tool: execute shell commands."""

import asyncio
import os

from src.types import Tool
from src.permissions.types import PermissionLevel


# Default blacklist: commands that should never run without explicit override
DEFAULT_BLACKLIST = [
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=",
    ":(){:|:&};:",  # fork bomb
]

# Commands requiring user confirmation (dangerous but sometimes needed)
DANGEROUS_PATTERNS = [
    "sudo ",
    "chmod 777",
    "rm -rf",
    "rm -r /",
    "> /dev/sd",
    "shutdown",
    "reboot",
    "kill -9",
    "pkill",
    "git push --force",
    "git reset --hard",
]

MAX_OUTPUT_CHARS = 50_000  # ~12,500 tokens — hard cap on result size


class BashTool(Tool):

    @property
    def name(self) -> str:
        return "bash"

    @property
    def description(self) -> str:
        return (
            "Execute a bash command and return its output (stdout + stderr). "
            "Use this for: running scripts, installing packages, git operations, "
            "checking system state, or any CLI operation. "
            "Do NOT use this for reading file contents (use file_read instead). "
            "Do NOT use this for editing files (use file_edit instead). "
            "Commands run in the current working directory. "
            "Long-running commands will timeout after 30 seconds."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute.",
                },
            },
            "required": ["command"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False  # bash can modify state

    def _check_blacklist(self, command: str) -> str | None:
        """Check if command is in the hard blacklist.
        Returns error message if blocked, None if OK."""
        for pattern in DEFAULT_BLACKLIST:
            if pattern in command:
                return f"BLOCKED: command contains blacklisted pattern '{pattern}'. This command cannot be executed."
        return None

    def is_dangerous(self, command: str) -> bool:
        """Check if command matches dangerous patterns (needs user confirmation)."""
        return any(p in command for p in DANGEROUS_PATTERNS)

    def check_permission(self, command: str = "", **_) -> tuple[PermissionLevel, bool]:
        """Bash permission: blacklisted → DENY, dangerous → ASK, safe → ASK.
        Bash is never AUTO because any command can modify state."""
        if self._check_blacklist(command):
            return PermissionLevel.DENY, True  # bypass-immune
        if self.is_dangerous(command):
            return PermissionLevel.DENY, False
        return PermissionLevel.ASK, False

    async def execute(self, command: str = "", **_) -> str:
        if not command.strip():
            return "Error: empty command. Provide a bash command to execute."

        # Hard blacklist check
        blocked = self._check_blacklist(command)
        if blocked:
            return blocked

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=os.getcwd(),
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=30.0
            )
        except asyncio.TimeoutError:
            return "Error: command timed out after 30 seconds."
        except Exception as e:
            return f"Error executing command: {e}"

        output = ""
        if stdout:
            output += stdout.decode(errors="replace")
        if stderr:
            output += ("\n--- stderr ---\n" if output else "") + stderr.decode(errors="replace")

        if not output:
            output = f"(no output, exit code: {proc.returncode})"

        # Truncate with indicator
        if len(output) > MAX_OUTPUT_CHARS:
            total = len(output)
            output = output[:MAX_OUTPUT_CHARS]
            output += f"\n\n[truncated: showing {MAX_OUTPUT_CHARS:,} of {total:,} chars]"

        if proc.returncode != 0:
            output = f"Exit code: {proc.returncode}\n{output}"

        return output

    def render(self, result: str) -> str:
        return f"```\n{result}\n```"
