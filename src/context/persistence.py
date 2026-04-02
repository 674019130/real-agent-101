"""Context persistence: save compressed content to disk.

Design principle from Claude Code: don't add a "read history" tool.
Instead, put the path in the system prompt, let the model use Read tool.

Directory structure:
    .agent/context/
    ├── tool_results/          # Individual tool results (cleared from context)
    │   └── {tool_call_id}.txt
    ├── history.jsonl           # Full message history before compression
    └── session_memory.md       # Running summary (like CC's session memory)
"""

import json
import os
from datetime import datetime

CONTEXT_DIR = ".agent/context"
TOOL_RESULTS_DIR = os.path.join(CONTEXT_DIR, "tool_results")
HISTORY_FILE = os.path.join(CONTEXT_DIR, "history.jsonl")
SESSION_MEMORY_FILE = os.path.join(CONTEXT_DIR, "session_memory.md")


def ensure_dirs():
    """Create persistence directories if they don't exist."""
    os.makedirs(TOOL_RESULTS_DIR, exist_ok=True)


def save_tool_result(tool_call_id: str, tool_name: str, result: str):
    """Persist a tool result to disk before clearing it from context."""
    ensure_dirs()
    path = os.path.join(TOOL_RESULTS_DIR, f"{tool_call_id}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Tool: {tool_name}\n")
        f.write(f"# Saved: {datetime.now().isoformat()}\n\n")
        f.write(result)
    return path


def save_history_snapshot(messages: list[dict]):
    """Append current messages to history file before compression.

    Uses JSONL (one JSON object per line) so we can append without
    reading the whole file. Each entry is a snapshot of the full
    message list at compression time.
    """
    ensure_dirs()
    snapshot = {
        "timestamp": datetime.now().isoformat(),
        "message_count": len(messages),
        "messages": messages,
    }
    with open(HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(snapshot, ensure_ascii=False) + "\n")


def load_session_memory() -> str | None:
    """Load session memory file if it exists.
    Returns None if no memory file or empty."""
    if not os.path.exists(SESSION_MEMORY_FILE):
        return None
    with open(SESSION_MEMORY_FILE, "r", encoding="utf-8") as f:
        content = f.read().strip()
    return content if content else None


def save_session_memory(summary: str):
    """Write/overwrite session memory with latest summary."""
    ensure_dirs()
    with open(SESSION_MEMORY_FILE, "w", encoding="utf-8") as f:
        f.write(f"# Session Memory\n")
        f.write(f"# Updated: {datetime.now().isoformat()}\n\n")
        f.write(summary)


def get_context_dir_description() -> str:
    """Return a description for the system prompt.

    This is how we tell the model where to find persisted context.
    Goes into the system prompt, model uses Read tool to access.
    """
    abs_path = os.path.abspath(CONTEXT_DIR)
    return (
        f"Compressed context is persisted at `{abs_path}/`. "
        f"Tool results cleared from context are saved in `{abs_path}/tool_results/`. "
        f"Session memory summary is at `{abs_path}/session_memory.md`. "
        f"Use file_read to access any of these if you need historical context."
    )
