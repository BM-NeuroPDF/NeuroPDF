from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.db import get_db
from app.deps import get_current_user
from app.main import app
from app.routers.files import _legacy, routes_summarize


class _FakeStreamResponse:
    def __init__(self, lines: list[str], status_code: int = 200):
        self._lines = lines
        self.status_code = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def aiter_lines(self):
        for line in self._lines:
            yield line

    async def aread(self):
        return b"error"

    async def aclose(self):
        return None


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def stream(self, *args, **kwargs):
        url = kwargs.get("url") or (args[1] if len(args) > 1 else "")
        if str(url).endswith("/chat/stream"):
            return _FakeStreamResponse(
                [
                    "data: {\"type\":\"token\",\"token\":\"Hi \"}",
                    "",
                    "data: {\"type\":\"done\",\"answer\":\"Hi there\"}",
                    "",
                ]
            )
        return _FakeStreamResponse(
            [
                "data: {\"type\":\"token\",\"token\":\"Sum \"}",
                "",
                "data: {\"type\":\"done\",\"summary\":\"Sum done\"}",
                "",
            ]
        )


def test_chat_message_stream_proxies_sse(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {"sub": "u1"}
    monkeypatch.setattr(_legacy.httpx, "AsyncClient", _FakeAsyncClient)
    client = TestClient(app)
    try:
        resp = client.post(
            "/files/chat/message/stream",
            json={"session_id": "s1", "message": "hello", "language": "tr"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert "data: {\"type\":\"token\"" in resp.text
        assert "data: {\"type\":\"done\"" in resp.text
    finally:
        app.dependency_overrides.clear()


def test_summarize_stream_proxies_sse(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: {"sub": "u1"}
    app.dependency_overrides[get_db] = lambda: MagicMock()
    monkeypatch.setattr(routes_summarize.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(_legacy, "get_user_llm_choice", lambda db, user_id: (1, "cloud"))
    client = TestClient(app)
    try:
        files = {"file": ("a.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}
        resp = client.post("/files/summarize/stream", files=files)
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert "data: {\"type\":\"token\"" in resp.text
        assert "data: {\"type\":\"done\"" in resp.text
    finally:
        app.dependency_overrides.clear()
