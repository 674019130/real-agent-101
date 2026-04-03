"""Raw OpenAI API client using httpx. No SDK.

Includes retry with exponential backoff for transient errors (5xx, timeout,
connection errors). 4xx errors (bad request, auth) are NOT retried.
"""

import asyncio
import json
import sys
from typing import AsyncGenerator

import httpx


API_URL = "https://api.openai.com/v1/chat/completions"

# Retry configuration
MAX_RETRIES = 3
BACKOFF_SECONDS = [1, 2, 4]  # exponential: 1s, 2s, 4s


def _is_transient_error(exc: Exception) -> bool:
    """Check if an error is transient and worth retrying.

    Retries on:
    - HTTP 5xx (server errors)
    - Timeout errors
    - Connection errors (network issues)

    Does NOT retry on:
    - HTTP 4xx (bad request, auth errors, rate limit)
    - JSON decode errors
    - Other non-network errors
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ConnectTimeout)):
        return True
    if isinstance(exc, (ConnectionError, OSError)):
        return True
    return False


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

    Retries up to 3 times on transient errors with exponential backoff.
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

    last_exception: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
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
            return  # success — stream completed

        except Exception as e:
            last_exception = e
            if not _is_transient_error(e) or attempt >= MAX_RETRIES:
                raise
            backoff = BACKOFF_SECONDS[attempt]
            print(
                f"[retry] stream_response attempt {attempt + 1}/{MAX_RETRIES} "
                f"failed: {e}. Retrying in {backoff}s...",
                file=sys.stderr,
            )
            await asyncio.sleep(backoff)

    # Should not reach here, but just in case
    if last_exception:
        raise last_exception


async def call_api(
    api_key: str,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 8096,
) -> str:
    """Non-streaming API call. Used for compaction summarization.

    Retries up to 3 times on transient errors with exponential backoff.
    """
    full_messages = [{"role": "system", "content": system}] + messages

    last_exception: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
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

        except Exception as e:
            last_exception = e
            if not _is_transient_error(e) or attempt >= MAX_RETRIES:
                raise
            backoff = BACKOFF_SECONDS[attempt]
            print(
                f"[retry] call_api attempt {attempt + 1}/{MAX_RETRIES} "
                f"failed: {e}. Retrying in {backoff}s...",
                file=sys.stderr,
            )
            await asyncio.sleep(backoff)

    # Should not reach here, but just in case
    if last_exception:
        raise last_exception
    raise RuntimeError("call_api: unexpected state after retry loop")
