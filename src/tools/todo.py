"""Todo List tool: task decomposition and progress tracking."""

import json
import os
from dataclasses import dataclass, field, asdict

from src.types import Tool


@dataclass
class TodoItem:
    id: int
    text: str
    status: str = "pending"  # pending | in_progress | done | cancelled


class TodoStore:
    """In-memory todo list with optional file persistence."""

    def __init__(self, persist_path: str | None = None):
        self._items: list[TodoItem] = []
        self._next_id = 1
        self._persist_path = persist_path
        if persist_path and os.path.exists(persist_path):
            self._load()

    def add(self, text: str) -> TodoItem:
        item = TodoItem(id=self._next_id, text=text)
        self._next_id += 1
        self._items.append(item)
        self._save()
        return item

    def update(self, item_id: int, status: str) -> str:
        for item in self._items:
            if item.id == item_id:
                item.status = status
                self._save()
                return f"OK: task {item_id} → {status}"
        return f"Error: task {item_id} not found."

    def list_all(self) -> str:
        if not self._items:
            return "(no tasks)"
        lines = []
        for item in self._items:
            marker = {"pending": "[ ]", "in_progress": "[/]", "done": "[x]", "cancelled": "[-]"}.get(item.status, "[ ]")
            lines.append(f"{marker} #{item.id}: {item.text}")
        return "\n".join(lines)

    def _save(self):
        if self._persist_path:
            with open(self._persist_path, "w") as f:
                json.dump([asdict(i) for i in self._items], f, ensure_ascii=False)

    def _load(self):
        with open(self._persist_path, "r") as f:
            data = json.load(f)
        self._items = [TodoItem(**d) for d in data]
        if self._items:
            self._next_id = max(i.id for i in self._items) + 1


# Shared store instance (initialized in main.py)
_store = TodoStore()


def get_store() -> TodoStore:
    return _store


def init_store(persist_path: str | None = None):
    global _store
    _store = TodoStore(persist_path)


class TodoTool(Tool):

    @property
    def name(self) -> str:
        return "todo"

    @property
    def description(self) -> str:
        return (
            "Manage a task list. Use this to break down complex work into steps "
            "and track progress. Actions: 'add' (create task), 'update' (change status), "
            "'list' (show all tasks). "
            "Always break down multi-step work into a todo list before starting."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "update", "list"],
                    "description": "The action to perform.",
                },
                "text": {
                    "type": "string",
                    "description": "Task description (required for 'add').",
                },
                "task_id": {
                    "type": "integer",
                    "description": "Task ID (required for 'update').",
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "done", "cancelled"],
                    "description": "New status (required for 'update').",
                },
            },
            "required": ["action"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False  # modifies state

    async def execute(self, action: str = "", text: str = "", task_id: int = 0, status: str = "", **_) -> str:
        store = get_store()

        if action == "add":
            if not text:
                return "Error: 'text' is required for add action."
            item = store.add(text)
            return f"OK: created task #{item.id}: {item.text}"

        elif action == "update":
            if not task_id:
                return "Error: 'task_id' is required for update action."
            if not status:
                return "Error: 'status' is required for update action."
            return store.update(task_id, status)

        elif action == "list":
            return store.list_all()

        else:
            return f"Error: unknown action '{action}'. Use 'add', 'update', or 'list'."
