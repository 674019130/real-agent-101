"""Core type definitions for the agent."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from src.permissions.types import PermissionLevel


# ============================================================
# Message Types
# ============================================================

@dataclass
class Message:
    """A single message in the conversation."""
    role: str          # "user" | "assistant" | "tool"
    content: Any       # str or None (for tool_calls)


# ============================================================
# Tool Definition
# ============================================================

class Tool(ABC):
    """Base class for all tools.

    Every tool must define:
    - name: identifier the model uses to call this tool
    - description: what this tool does (the model reads this)
    - input_schema: JSON Schema defining accepted parameters
    - is_concurrent_safe: can this tool run in parallel with others?
    - execute(): the actual business logic
    - render(): format the output for display to the user
    """

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        ...

    @property
    @abstractmethod
    def input_schema(self) -> dict:
        """JSON Schema for tool parameters.
        Example: {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}
        """
        ...

    @property
    def is_concurrent_safe(self) -> bool:
        """Whether this tool is safe to run concurrently (read-only).
        Default False (exclusive/write operation)."""
        return False

    @abstractmethod
    async def execute(self, **params) -> str:
        """Run the tool's business logic. Returns result as string."""
        ...

    def check_permission(self, **params) -> tuple[PermissionLevel, bool]:
        """Determine permission level for this specific invocation.

        Returns:
            (level, bypass_immune) where:
            - level: AUTO / ASK / DENY based on the operation
            - bypass_immune: if True, even yolo mode won't skip the check

        Override in subclasses for tool-specific logic.
        Default: ASK for write tools, AUTO for read-only tools.
        """
        if self.is_concurrent_safe:
            return PermissionLevel.AUTO, False
        return PermissionLevel.ASK, False

    def render(self, result: str) -> str:
        """Format tool output for user display.
        Override for custom rendering (syntax highlight, truncation, etc.)."""
        return result

    def to_api_schema(self) -> dict:
        """Convert to OpenAI API tool definition format.

        OpenAI wraps tools in {"type": "function", "function": {...}}
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


# CompactConfig is now in src/context/compact.py
