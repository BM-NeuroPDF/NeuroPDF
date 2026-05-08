"""SSE streaming and PDF-chat context helpers for the analysis router (no llm_manager imports)."""

from __future__ import annotations

import asyncio
import contextlib
import json
import threading
import time
from collections.abc import Callable, Iterator
from typing import Any

from fastapi import Request
from fastapi.responses import StreamingResponse

MAX_CONTEXT_CHARS = 45000


def _sse_data(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


def build_history_text(history: list, *, max_turns: int = 10) -> str:
    lines: list[str] = []
    for turn in history[-max_turns:]:
        lines.append(f"{turn['role'].upper()}: {turn['content']}\n")
    return "".join(lines)


def truncate_pdf_context(pdf_text: str, *, max_chars: int = MAX_CONTEXT_CHARS) -> str:
    if len(pdf_text) > max_chars:
        return pdf_text[:max_chars]
    return pdf_text


def streaming_llm_sse_response(
    request: Request,
    token_iterator: Callable[[], Iterator[str]],
    build_done_payload: Callable[[str], dict[str, Any]],
) -> StreamingResponse:
    """Queue + thread producer + shared SSE framing; LLM iteration injected via ``token_iterator``."""

    q: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=256)
    stop_event = threading.Event()
    loop = asyncio.get_running_loop()
    producer_state = {"suppress_terminal_done": False}

    async def _enqueue_token(tok: str) -> bool:
        try:
            q.put_nowait(("token", tok))
            return True
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(("error", "stream_backpressure_overflow"))
            except asyncio.QueueFull:
                pass
            return False

    async def _enqueue_done() -> None:
        await q.put(("done", ""))

    async def _enqueue_error(msg: str) -> None:
        await q.put(("error", msg))

    def _producer() -> None:
        try:
            for token in token_iterator():
                if stop_event.is_set():
                    break
                fut = asyncio.run_coroutine_threadsafe(_enqueue_token(token), loop)
                if not fut.result(timeout=120):
                    producer_state["suppress_terminal_done"] = True
                    break
            if not producer_state["suppress_terminal_done"]:
                asyncio.run_coroutine_threadsafe(_enqueue_done(), loop).result(
                    timeout=120
                )
        except Exception as e:
            asyncio.run_coroutine_threadsafe(_enqueue_error(str(e)), loop).result(
                timeout=120
            )

    producer_task = asyncio.to_thread(_producer)
    runner = asyncio.create_task(producer_task)

    async def event_stream():
        assembled: list[str] = []
        last_ping = time.monotonic()
        try:
            while True:
                if await request.is_disconnected():
                    stop_event.set()
                    break
                now = time.monotonic()
                if now - last_ping >= 15:
                    yield b": ping\n\n"
                    last_ping = now
                try:
                    event, payload = await asyncio.wait_for(q.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                if event == "token":
                    assembled.append(payload)
                    yield _sse_data({"type": "token", "token": payload})
                elif event == "error":
                    yield _sse_data(
                        {"type": "error", "detail": payload, "retry_ms": 1500}
                    )
                    break
                elif event == "done":
                    assembled_answer = "".join(assembled).strip()
                    yield _sse_data(build_done_payload(assembled_answer))
                    break
        finally:
            stop_event.set()
            runner.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await runner

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
