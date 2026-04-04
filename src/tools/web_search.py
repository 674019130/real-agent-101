"""Web search tool: Tavily API integration.

# 为什么选 Tavily:
#
#   传统搜索 API（Google、Bing）返回的是 URL 列表，
#   模型还需要再调一个 "读网页" 工具去获取内容。
#   两步操作，浪费 token 和时间。
#
#   Tavily 专为 AI agent 设计：
#     - 直接返回提取后的文本内容（不只是 URL）
#     - 每个结果包含 title + content snippet + url
#     - 一次调用就能拿到可用的搜索结果
#     - 支持搜索深度控制（basic / advanced）
#
# 设计决策:
#
#   is_concurrent_safe = True
#     搜索是纯读操作，不修改任何本地状态。
#     模型可以同时发起多个搜索（比如一边搜 API 文档一边搜 error message）。
#
#   check_permission → ASK
#     虽然搜索本身无害，但会发送用户的查询到外部 API。
#     出于隐私考虑，默认需要用户确认。
#     CC 的 WebSearch 也不是 AUTO — 它在 explicit permission 列表里。
#
#   结果截断:
#     Tavily 返回的内容可能很长。每个结果截取前 500 字符，
#     总共最多 5 个结果，避免占用过多上下文空间。
"""

import os
import json

import httpx

from src.types import Tool
from src.permissions.types import PermissionLevel


# Tavily API endpoint
TAVILY_API_URL = "https://api.tavily.com/search"

# 结果限制：避免搜索结果占用过多上下文
MAX_RESULTS = 5
MAX_CONTENT_LENGTH = 500  # 每个结果的内容截取长度


class WebSearchTool(Tool):
    """Web search via Tavily API.

    模型用这个工具搜索互联网获取最新信息。
    返回格式化的搜索结果（title + snippet + url）。
    """

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "Search the web for current information. "
            "Returns titles, content snippets, and URLs. "
            "Use when you need up-to-date information that may not be in your training data."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                },
                "search_depth": {
                    "type": "string",
                    "enum": ["basic", "advanced"],
                    "description": "Search depth: 'basic' for quick results, 'advanced' for more thorough search.",
                },
            },
            "required": ["query"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        # 搜索是纯读操作：不修改本地状态，可以并发执行
        return True

    def check_permission(self, **params) -> tuple[PermissionLevel, bool]:
        # ASK：搜索会发送查询到外部服务，需要用户知情同意
        # 不是 bypass_immune — yolo 模式下可以跳过确认
        return PermissionLevel.ASK, False

    async def execute(self, query: str = "", search_depth: str = "basic", **_) -> str:
        """执行 Tavily 搜索，返回格式化的结果。"""
        if not query:
            return "Error: 'query' is required."

        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return "Error: TAVILY_API_KEY not set. Set it in .env or environment."

        # ── 调用 Tavily API ──
        payload = {
            "query": query,
            "search_depth": search_depth,
            "max_results": MAX_RESULTS,
            "include_answer": True,  # Tavily 会生成一个简短的综合答案
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    TAVILY_API_URL,
                    json={**payload, "api_key": api_key},
                    headers={"Content-Type": "application/json"},
                )

                if resp.status_code != 200:
                    return f"Error: Tavily API returned {resp.status_code}: {resp.text[:200]}"

                data = resp.json()

        except httpx.TimeoutException:
            return "Error: Search timed out after 30 seconds."
        except httpx.HTTPError as e:
            return f"Error: HTTP error during search: {e}"

        # ── 格式化结果 ──
        return self._format_results(query, data)

    def _format_results(self, query: str, data: dict) -> str:
        """将 Tavily 响应格式化为模型可读的文本。

        格式：
            Search results for: "query"

            Answer: [Tavily 生成的综合答案]

            1. [Title]
               URL: https://...
               [Content snippet, truncated to MAX_CONTENT_LENGTH]

            2. ...
        """
        lines = [f'Search results for: "{query}"']

        # Tavily 的综合答案（如果有）
        answer = data.get("answer")
        if answer:
            lines.append(f"\nAnswer: {answer}")

        # 逐条结果
        results = data.get("results", [])
        if not results:
            lines.append("\nNo results found.")
            return "\n".join(lines)

        lines.append("")
        for i, result in enumerate(results, 1):
            title = result.get("title", "No title")
            url = result.get("url", "")
            content = result.get("content", "")

            # 截取内容，避免单个结果过长
            if len(content) > MAX_CONTENT_LENGTH:
                content = content[:MAX_CONTENT_LENGTH] + "..."

            lines.append(f"{i}. {title}")
            if url:
                lines.append(f"   URL: {url}")
            if content:
                lines.append(f"   {content}")
            lines.append("")

        return "\n".join(lines)
