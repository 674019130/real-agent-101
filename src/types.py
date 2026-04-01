"""Core type definitions for the agent."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


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


# ============================================================
# Compact Config
# ============================================================

@dataclass
class CompactConfig:
    """Configuration for context compaction."""
    model: str = "gpt-4o"
    max_context_percentage: float = 0.8       # trigger at 80%
    max_context_tokens: int = 128_000         # model's context window
    summary_max_tokens: int = 4_000           # max tokens for the summary output

    @property
    def trigger_threshold(self) -> int:
        return int(self.max_context_tokens * self.max_context_percentage)
