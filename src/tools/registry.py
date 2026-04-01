"""Tool registry: register, lookup, and dispatch tools."""

from src.types import Tool


class ToolRegistry:
    """Central registry for all available tools."""

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool by name."""
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        """Lookup a tool by name."""
        return self._tools.get(name)

    async def dispatch(self, name: str, params: dict) -> str:
        """Execute a tool by name with given parameters.
        Returns the result string, or an error message."""
        tool = self.get(name)
        if tool is None:
            return f"Error: unknown tool '{name}'"
        try:
            return await tool.execute(**params)
        except Exception as e:
            return f"Error executing {name}: {e}"

    def get_api_schemas(self) -> list[dict]:
        """Get all tool definitions in Anthropic API format."""
        return [tool.to_api_schema() for tool in self._tools.values()]

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools
