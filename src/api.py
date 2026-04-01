"""Raw OpenAI API client using httpx. No SDK."""

import json
from typing import AsyncGenerator

import httpx


API_URL = "https://api.openai.com/v1/chat/completions"


async def stream_response(
    api_key: str,
    model: str,
    system: str,
    messages: list[dict],
    tools: list[dict] | None = None,
    max_tokens: int = 8096,
) -> AsyncGenerator[dict, None]:
    """Stream a response from the OpenAI API via SSE.

    Yields parsed SSE event dicts (OpenAI 'chunk' format):
    - Each chunk has choices[0].delta with role, content, tool_calls
    - finish_reason in choices[0] signals end: "stop" or "tool_calls"
    """
    # OpenAI: system prompt is the first message, not a separate param
    full_messages = [{"role": "system", "content": system}] + messages

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": full_messages,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST", API_URL, json=payload, headers=headers, timeout=120.0
        ) as resp:
            resp.raise_for_status()

            # Parse SSE: lines starting with "data: " contain JSON
            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            return
                        try:
                            event = json.loads(data_str)
                            yield event
                        except json.JSONDecodeError:
                            pass


async def call_api(
    api_key: str,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 8096,
) -> str:
    """Non-streaming API call. Used for compaction summarization."""
    full_messages = [{"role": "system", "content": system}] + messages

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "messages": full_messages,
                "stream": False,
            },
            timeout=60.0,
        )
        resp.raise_for_status()
        data = resp.json()

    return data["choices"][0]["message"]["content"]
