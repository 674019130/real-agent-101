"""File Write tool: create or overwrite entire files."""

import os

from src.types import Tool
from src.permissions.types import PermissionLevel
from src.permissions.path_check import is_within_project, is_bypass_immune


class FileWriteTool(Tool):

    @property
    def name(self) -> str:
        return "file_write"

    @property
    def description(self) -> str:
        return (
            "Create a new file or overwrite an existing file with the given content. "
            "WARNING: this overwrites the entire file. For targeted edits, use file_edit instead. "
            "Parent directories will be created automatically if they don't exist."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file to create or overwrite.",
                },
                "content": {
                    "type": "string",
                    "description": "The full content to write to the file.",
                },
            },
            "required": ["file_path", "content"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False  # modifies files

    def check_permission(self, file_path: str = "", **_) -> tuple[PermissionLevel, bool]:
        """Write: ASK within project, DENY outside or bypass-immune paths."""
        if is_bypass_immune(file_path):
            return PermissionLevel.DENY, True
        if not is_within_project(file_path, os.getcwd()):
            return PermissionLevel.DENY, False
        return PermissionLevel.ASK, False

    async def execute(self, file_path: str = "", content: str = "", **_) -> str:
        if not file_path:
            return "Error: file_path is required."

        path = os.path.abspath(file_path)
        is_new = not os.path.exists(path)

        # Create parent directories if needed
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            return f"Error writing file: {e}"

        action = "Created" if is_new else "Overwritten"
        lines = content.count("\n") + (1 if content and not content.endswith("\n") else 0)
        return f"OK: {action} '{path}' ({lines} lines)."
