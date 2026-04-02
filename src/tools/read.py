"""File Read tool: read file contents with line numbers."""

import os

from src.types import Tool
from src.permissions.types import PermissionLevel
from src.permissions.path_check import is_within_project, is_sensitive_file


MAX_LINES = 500          # hard cap: never return more than this
DEFAULT_LIMIT = 200      # default if not specified


class FileReadTool(Tool):

    @property
    def name(self) -> str:
        return "file_read"

    @property
    def description(self) -> str:
        return (
            "Read the contents of a file with line numbers. "
            "Returns lines in 'line_number | content' format. "
            "Use offset and limit to read specific sections of large files. "
            "Do NOT use this to read directories (use bash 'ls' instead). "
            "Do NOT use this to search for text across files (use bash 'grep' instead). "
            f"Maximum {MAX_LINES} lines per read. If a file is larger, "
            "read it in sections using offset."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Absolute or relative path to the file.",
                },
                "offset": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Starting line number (0-based). Default: 0.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_LINES,
                    "description": f"Number of lines to read. Default: {DEFAULT_LIMIT}. Max: {MAX_LINES}.",
                },
            },
            "required": ["file_path"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return True  # read-only

    def check_permission(self, file_path: str = "", **_) -> tuple[PermissionLevel, bool]:
        """Read: AUTO within project, ASK outside, DENY for sensitive files."""
        if is_sensitive_file(file_path):
            return PermissionLevel.DENY, False
        if not is_within_project(file_path, os.getcwd()):
            return PermissionLevel.ASK, False
        return PermissionLevel.AUTO, False

    async def execute(self, file_path: str = "", offset: int = 0, limit: int = DEFAULT_LIMIT, **_) -> str:
        if not file_path:
            return "Error: file_path is required."

        # Resolve path
        path = os.path.abspath(file_path)

        if not os.path.exists(path):
            return f"Error: file not found at '{path}'. Use bash 'ls' or 'find' to locate the correct path."

        if os.path.isdir(path):
            return f"Error: '{path}' is a directory, not a file. Use bash 'ls {path}' to list its contents."

        # Enforce hard cap
        limit = min(limit, MAX_LINES)

        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
        except PermissionError:
            return f"Error: permission denied reading '{path}'."
        except Exception as e:
            return f"Error reading file: {e}"

        total_lines = len(all_lines)

        if offset >= total_lines:
            return f"Error: offset {offset} is beyond end of file ({total_lines} lines)."

        # Slice the requested range
        selected = all_lines[offset:offset + limit]

        # Format with line numbers
        numbered_lines = []
        for i, line in enumerate(selected):
            line_num = offset + i + 1  # 1-based for display
            numbered_lines.append(f"{line_num:>6} | {line.rstrip()}")

        result = "\n".join(numbered_lines)

        # Truncation indicator
        remaining = total_lines - (offset + len(selected))
        if remaining > 0:
            result += f"\n\n[showing lines {offset+1}-{offset+len(selected)} of {total_lines}. {remaining} more lines below. Use offset={offset+len(selected)} to continue.]"

        return result
