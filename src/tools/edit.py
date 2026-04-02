"""File Edit tool: surgical string replacement in files."""

import os

from src.types import Tool
from src.permissions.types import PermissionLevel
from src.permissions.path_check import is_within_project, is_bypass_immune


class FileEditTool(Tool):

    @property
    def name(self) -> str:
        return "file_edit"

    @property
    def description(self) -> str:
        return (
            "Replace a specific string in a file with new content. "
            "The old_string must match EXACTLY one location in the file (including whitespace and indentation). "
            "If old_string matches 0 times: you have the wrong content, re-read the file. "
            "If old_string matches multiple times: provide more surrounding context to make it unique. "
            "Use this for targeted edits. For creating new files or full rewrites, use file_write."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file to edit.",
                },
                "old_string": {
                    "type": "string",
                    "description": "The exact string to find and replace. Must match exactly once.",
                },
                "new_string": {
                    "type": "string",
                    "description": "The string to replace old_string with.",
                },
            },
            "required": ["file_path", "old_string", "new_string"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False  # modifies files

    def check_permission(self, file_path: str = "", **_) -> tuple[PermissionLevel, bool]:
        """Edit: ASK within project, DENY outside or bypass-immune paths."""
        if is_bypass_immune(file_path):
            return PermissionLevel.DENY, True  # even yolo won't skip
        if not is_within_project(file_path, os.getcwd()):
            return PermissionLevel.DENY, False
        return PermissionLevel.ASK, False

    async def execute(self, file_path: str = "", old_string: str = "", new_string: str = "", **_) -> str:
        if not file_path:
            return "Error: file_path is required."
        if not old_string:
            return "Error: old_string is required. Provide the exact text to replace."

        path = os.path.abspath(file_path)

        if not os.path.exists(path):
            return f"Error: file not found at '{path}'."

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            return f"Error reading file: {e}"

        # Count occurrences
        count = content.count(old_string)

        if count == 0:
            # Actionable error: tell the model what to do
            preview = content[:500] if len(content) > 500 else content
            return (
                f"Error: old_string not found in '{path}'. "
                f"The text you provided does not exist in the file. "
                f"Re-read the file to get the current content.\n"
                f"File preview (first 500 chars):\n{preview}"
            )

        if count > 1:
            # Actionable error: tell the model to be more specific
            return (
                f"Error: old_string found {count} times in '{path}'. "
                f"Include more surrounding context in old_string to uniquely identify the location."
            )

        # Exactly one match — do the replacement
        new_content = content.replace(old_string, new_string, 1)

        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
        except Exception as e:
            return f"Error writing file: {e}"

        return f"OK: replaced 1 occurrence in '{path}'."
