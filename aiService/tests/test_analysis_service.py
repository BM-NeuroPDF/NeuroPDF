"""Unit coverage for ``analysis_service`` SSE helpers (no HTTP stack)."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import analysis_service


def test_truncate_pdf_context_uncut() -> None:
    assert analysis_service.truncate_pdf_context("short", max_chars=100) == "short"


def test_truncate_pdf_context_truncates() -> None:
    raw = "x" * 500
    assert len(analysis_service.truncate_pdf_context(raw, max_chars=100)) == 100


def test_build_history_text_orders_roles() -> None:
    h = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}]
    out = analysis_service.build_history_text(h)
    assert "USER: hi" in out and "ASSISTANT: yo" in out


def test_build_history_text_empty() -> None:
    assert analysis_service.build_history_text([]) == ""


@pytest.mark.asyncio
async def test_streaming_producer_exception_emits_error_sse() -> None:
    request = MagicMock()
    request.is_disconnected = AsyncMock(return_value=False)

    def broken() -> Iterator[str]:
        raise RuntimeError("stream boom")

    resp = analysis_service.streaming_llm_sse_response(
        request,
        broken,
        lambda s: {"type": "done", "answer": s},
    )
    body = b"".join([chunk async for chunk in resp.body_iterator])
    assert b'"type": "error"' in body
    assert b"stream boom" in body


@pytest.mark.asyncio
async def test_streaming_immediate_disconnect_stops_producer() -> None:
    request = MagicMock()
    request.is_disconnected = AsyncMock(return_value=True)

    def endless() -> Iterator[str]:
        for _ in range(10_000):
            yield "x"

    resp = analysis_service.streaming_llm_sse_response(
        request,
        endless,
        lambda s: {"type": "done", "answer": s},
    )
    _ = b"".join([chunk async for chunk in resp.body_iterator])


@pytest.mark.asyncio
async def test_streaming_yields_ping_when_idle_long_enough() -> None:
    request = MagicMock()
    request.is_disconnected = AsyncMock(return_value=False)

    mono_seq = iter([10.0, 10.0, 10.0, 26.0, 26.0, 26.0, 26.0])

    def fake_mono() -> float:
        return next(mono_seq, 99.0)

    wait_calls = {"n": 0}
    real_wait_for = asyncio.wait_for

    async def fake_wait_for(coro, *, timeout):  # noqa: ANN001
        wait_calls["n"] += 1
        if wait_calls["n"] <= 6:
            try:
                await asyncio.wait_for(coro, timeout=0)
            except asyncio.TimeoutError:
                raise asyncio.TimeoutError from None
            raise AssertionError("expected immediate timeout")
        return await real_wait_for(coro, timeout=timeout)

    def delayed_token() -> Iterator[str]:
        time.sleep(0.02)
        yield "z"

    with (
        patch.object(analysis_service.time, "monotonic", side_effect=fake_mono),
        patch.object(analysis_service.asyncio, "wait_for", fake_wait_for),
    ):
        resp = analysis_service.streaming_llm_sse_response(
            request,
            delayed_token,
            lambda s: {"type": "done", "answer": s},
        )
        body = b"".join([chunk async for chunk in resp.body_iterator])

    assert b": ping" in body


@pytest.mark.asyncio
async def test_streaming_second_enqueue_raises_queue_full() -> None:
    """Drive backpressure handling without relying on a racing tiny queue."""

    class SecondPutFailsQueue(asyncio.Queue):
        def __init__(self, maxsize: int = 256) -> None:
            super().__init__(maxsize=maxsize)
            self._puts = 0

        def put_nowait(self, item):  # noqa: ANN001
            self._puts += 1
            if self._puts == 2:
                raise asyncio.QueueFull
            return super().put_nowait(item)

    request = MagicMock()
    request.is_disconnected = AsyncMock(return_value=False)

    def three_tokens() -> Iterator[str]:
        yield "a"
        yield "b"
        yield "c"

    with patch.object(analysis_service.asyncio, "Queue", SecondPutFailsQueue):
        resp = analysis_service.streaming_llm_sse_response(
            request,
            three_tokens,
            lambda s: {"type": "done", "answer": s},
        )
        body = b"".join([chunk async for chunk in resp.body_iterator])

    assert b"stream_backpressure_overflow" in body


@pytest.mark.asyncio
async def test_streaming_backpressure_inner_put_full_swallowed() -> None:
    """Hit lines 61-62: inner error enqueue also raises QueueFull and is swallowed."""

    class BackpressureInnerFullQueue(asyncio.Queue):
        def __init__(self, maxsize: int = 256) -> None:
            super().__init__(maxsize=maxsize)
            self._token_puts = 0

        def put_nowait(self, item):  # noqa: ANN001
            if isinstance(item, tuple) and item[0] == "token":
                self._token_puts += 1
                if self._token_puts == 2:
                    raise asyncio.QueueFull
            if isinstance(item, tuple) and item[0] == "error":
                raise asyncio.QueueFull
            return super().put_nowait(item)

    checks = {"n": 0}

    async def disconnect_after_some_loops() -> bool:
        checks["n"] += 1
        return checks["n"] > 40

    request = MagicMock()
    request.is_disconnected = AsyncMock(side_effect=disconnect_after_some_loops)

    def two_tokens() -> Iterator[str]:
        yield "a"
        yield "b"

    with patch.object(analysis_service.asyncio, "Queue", BackpressureInnerFullQueue):
        resp = analysis_service.streaming_llm_sse_response(
            request,
            two_tokens,
            lambda s: {"type": "done", "answer": s},
        )
        body = b"".join([chunk async for chunk in resp.body_iterator])

    assert b'"type": "token"' in body


@pytest.mark.asyncio
async def test_streaming_stop_event_checked_before_second_enqueue() -> None:
    """Hit line 75: stop_event set, producer breaks before second token enqueue."""

    disconnect_signal = asyncio.Event()
    observed = {"second_pulled": False}

    async def is_disconnected() -> bool:
        return disconnect_signal.is_set()

    request = MagicMock()
    request.is_disconnected = AsyncMock(side_effect=is_disconnected)

    def two_tokens_wait_for_disconnect() -> Iterator[str]:
        yield "a"
        while not disconnect_signal.is_set():
            time.sleep(0.005)
        observed["second_pulled"] = True
        yield "b"

    resp = analysis_service.streaming_llm_sse_response(
        request,
        two_tokens_wait_for_disconnect,
        lambda s: {"type": "done", "answer": s},
    )

    chunks: list[bytes] = []
    async for chunk in resp.body_iterator:
        chunks.append(chunk)
        if b'"type": "token"' in chunk:
            disconnect_signal.set()

    await asyncio.sleep(0.05)
    assert observed["second_pulled"] is True
    assert b'"token": "b"' not in b"".join(chunks)
