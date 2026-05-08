from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException, Request

from app.main import app
from app import rate_limit
from app.routers.files import routes_chat


def _request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/files/chat",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "app": app,
    }
    req = Request(scope)
    req._is_disconnected = False
    return req


def _attach_client(req: Request, post_result: object) -> None:
    req.app.state.ai_http_client = MagicMock(post=AsyncMock(return_value=post_result))


@pytest.fixture(autouse=True)
def _reset_rate_limit_state() -> None:
    rate_limit._LOCAL_DEGRADED.clear()
    rate_limit._REDIS_FAIL_COUNT = 0
    rate_limit._REDIS_BREAKER_OPEN_UNTIL = 0.0
    yield
    rate_limit._LOCAL_DEGRADED.clear()
    rate_limit._REDIS_FAIL_COUNT = 0
    rate_limit._REDIS_BREAKER_OPEN_UNTIL = 0.0


@pytest.mark.asyncio
async def test_start_chat_from_text_paths() -> None:
    req = _request()
    current_user = {"sub": "u1"}
    db = MagicMock()
    owned = SimpleNamespace(id="p1", filename="f.pdf", pdf_data=b"%PDF")

    ok_resp = MagicMock(status_code=200)
    ok_resp.json.return_value = {"session_id": "s1"}
    _attach_client(req, ok_resp)

    with (
        patch.object(
            routes_chat._legacy_module.user_repo,
            "get_llm_provider",
            AsyncMock(side_effect=Exception("provider fail")),
        ),
        patch.object(routes_chat, "get_pdf_from_db", return_value=owned),
        patch.object(
            routes_chat, "run_in_threadpool", AsyncMock(return_value="text from pdf")
        ),
        patch.object(
            routes_chat,
            "create_pdf_chat_session_record",
            return_value=SimpleNamespace(id="db1"),
        ),
    ):
        out = await routes_chat.start_chat_from_text(
            req,
            {
                "filename": "",
                "pdf_id": "p1",
                "pdf_text": "",
                "mode": "pro",
            },
            current_user=current_user,
            db=db,
        )
    assert out["session_id"] == "s1"
    assert out["pdf_id"] == "p1"
    assert out["db_session_id"] == "db1"


@pytest.mark.asyncio
async def test_start_chat_from_text_validation_and_upstream_errors() -> None:
    req = _request()
    current_user = {"sub": "u1"}
    db = MagicMock()

    bad_resp = MagicMock(status_code=502, text="boom")
    _attach_client(req, bad_resp)

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_llm_provider",
        AsyncMock(return_value="local"),
    ):
        with pytest.raises(HTTPException) as e1:
            await routes_chat.start_chat_from_text(
                req,
                {"pdf_text": "x", "filename": "f.pdf"},
                current_user=current_user,
                db=db,
            )
    assert e1.value.status_code == 502

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_llm_provider",
        AsyncMock(return_value="local"),
    ):
        with pytest.raises(HTTPException) as e2:
            await routes_chat.start_chat_from_text(
                req,
                {"pdf_text": "", "filename": "f.pdf"},
                current_user=current_user,
                db=db,
            )
    assert e2.value.status_code == 400

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_llm_provider",
        AsyncMock(return_value="cloud"),
    ):
        with patch.object(routes_chat, "get_pdf_from_db", return_value=None):
            with pytest.raises(HTTPException) as e3:
                await routes_chat.start_chat_from_text(
                    req,
                    {"pdf_text": "x", "filename": "f.pdf", "pdf_id": "missing"},
                    current_user=current_user,
                    db=db,
                )
    assert e3.value.status_code == 404

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_llm_provider",
        AsyncMock(return_value="cloud"),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.start_chat_from_text(
                req, {"pdf_text": "x", "filename": "f.pdf"}, current_user={}, db=None
            )

    with (
        patch.object(
            routes_chat._legacy_module.user_repo,
            "get_llm_provider",
            AsyncMock(side_effect=RuntimeError("x")),
        ),
        patch.object(
            routes_chat._legacy_module,
            "_raise_db_unavailable",
            side_effect=HTTPException(status_code=503, detail="db"),
        ),
        patch.object(
            routes_chat,
            "create_pdf_chat_session_record",
            side_effect=routes_chat.OperationalError("x", None, None),
        ),
    ):
        ok_resp = MagicMock(status_code=200)
        ok_resp.json.return_value = {"session_id": "sok"}
        _attach_client(req, ok_resp)
        with pytest.raises(HTTPException) as e4:
            await routes_chat.start_chat_from_text(
                req,
                {"pdf_text": "x", "filename": "f.pdf"},
                current_user={"sub": "u1"},
                db=MagicMock(),
            )
    assert e4.value.status_code == 503

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=RuntimeError("boom"))
    )
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_llm_provider",
        AsyncMock(return_value="cloud"),
    ):
        with pytest.raises(HTTPException) as e5:
            await routes_chat.start_chat_from_text(
                req,
                {"pdf_text": "x", "filename": "f.pdf"},
                current_user={"sub": "u1"},
                db=MagicMock(),
            )
    assert e5.value.status_code == 500


@pytest.mark.asyncio
async def test_start_chat_session_error_paths() -> None:
    req = _request()
    file_obj = SimpleNamespace(
        content_type="text/plain", filename="x.txt", read=AsyncMock(return_value=b"x")
    )
    with pytest.raises(HTTPException) as e1:
        await routes_chat.start_chat_session(
            req, file=file_obj, current_user={"sub": "u1"}, db=MagicMock()
        )
    assert e1.value.status_code == 400

    pdf_file = SimpleNamespace(
        content_type="application/pdf",
        filename="x.pdf",
        read=AsyncMock(return_value=b"%PDF"),
    )
    with pytest.raises(HTTPException) as e2:
        await routes_chat.start_chat_session(
            req, file=pdf_file, current_user={}, db=MagicMock()
        )
    assert e2.value.status_code == 401

    fail_resp = MagicMock(status_code=500, text="ai fail")
    _attach_client(req, fail_resp)
    with (
        patch.object(
            routes_chat._legacy_module.user_repo,
            "get_llm_provider",
            AsyncMock(return_value="cloud"),
        ),
        patch.object(
            routes_chat, "save_pdf_to_db", return_value=SimpleNamespace(id="p1")
        ),
        patch.object(
            routes_chat._legacy_module, "_extract_text_from_pdf_bytes", return_value=""
        ),
    ):
        with pytest.raises(HTTPException) as e3:
            await routes_chat.start_chat_session(
                req, file=pdf_file, current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e3.value.status_code == 502

    ok_resp = MagicMock(status_code=200)
    ok_resp.json.return_value = {"session_id": "s-ok"}
    _attach_client(req, ok_resp)
    with (
        patch.object(
            routes_chat._legacy_module.user_repo,
            "get_llm_provider",
            AsyncMock(return_value="cloud"),
        ),
        patch.object(
            routes_chat, "save_pdf_to_db", return_value=SimpleNamespace(id="p1")
        ),
        patch.object(
            routes_chat._legacy_module,
            "_extract_text_from_pdf_bytes",
            side_effect=Exception("extract fail"),
        ),
        patch.object(
            routes_chat,
            "create_pdf_chat_session_record",
            return_value=SimpleNamespace(id="db1"),
        ),
    ):
        out = await routes_chat.start_chat_session(
            req, file=pdf_file, current_user={"sub": "u1"}, db=MagicMock()
        )
    assert out["session_id"] == "s-ok"

    with (
        patch.object(
            routes_chat._legacy_module.user_repo,
            "get_llm_provider",
            AsyncMock(side_effect=routes_chat.OperationalError("x", None, None)),
        ),
        patch.object(
            routes_chat._legacy_module,
            "_raise_db_unavailable",
            side_effect=HTTPException(status_code=503, detail="db"),
        ),
    ):
        with pytest.raises(HTTPException) as e4:
            await routes_chat.start_chat_session(
                req, file=pdf_file, current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e4.value.status_code == 503

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=RuntimeError("boom"))
    )
    with (
        patch.object(
            routes_chat._legacy_module.user_repo,
            "get_llm_provider",
            AsyncMock(return_value="cloud"),
        ),
        patch.object(
            routes_chat, "save_pdf_to_db", return_value=SimpleNamespace(id="p1")
        ),
    ):
        with pytest.raises(HTTPException) as e5:
            await routes_chat.start_chat_session(
                req, file=pdf_file, current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e5.value.status_code == 500


@pytest.mark.asyncio
async def test_send_chat_message_error_paths() -> None:
    req = _request()
    with pytest.raises(HTTPException) as e0:
        await routes_chat.send_chat_message(
            req, {"session_id": "s"}, {"sub": "u1"}, MagicMock()
        )
    assert e0.value.status_code == 400

    quota = MagicMock(status_code=429)
    quota.json.return_value = {"detail": "quota exceeded gemini"}
    _attach_client(req, quota)
    with pytest.raises(HTTPException) as e1:
        await routes_chat.send_chat_message(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}, MagicMock()
        )
    assert e1.value.status_code == 429

    rate = MagicMock(status_code=429)
    rate.json.return_value = {"detail": "rate limit gemini"}
    _attach_client(req, rate)
    with pytest.raises(HTTPException) as e2:
        await routes_chat.send_chat_message(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}, MagicMock()
        )
    assert e2.value.status_code == 429

    nonjson = MagicMock(status_code=500, text="plain-text-error")
    nonjson.json.side_effect = Exception("json fail")
    _attach_client(req, nonjson)
    with pytest.raises(HTTPException) as e2b:
        await routes_chat.send_chat_message(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}, MagicMock()
        )
    assert e2b.value.status_code == 500

    read_timeout_post = AsyncMock(side_effect=httpx.ReadTimeout("rt"))
    req.app.state.ai_http_client = MagicMock(post=read_timeout_post)
    with pytest.raises(HTTPException) as e3:
        await routes_chat.send_chat_message(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}, MagicMock()
        )
    assert e3.value.status_code == 504

    generic_post = AsyncMock(side_effect=RuntimeError("boom"))
    req.app.state.ai_http_client = MagicMock(post=generic_post)
    with pytest.raises(HTTPException) as e4:
        await routes_chat.send_chat_message(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}, MagicMock()
        )
    assert e4.value.status_code == 500


@pytest.mark.asyncio
async def test_send_chat_message_persist_warning_path() -> None:
    req = _request()
    ok = MagicMock(status_code=200)
    ok.json.return_value = {"answer": "ok"}
    _attach_client(req, ok)
    with patch.object(
        routes_chat, "append_chat_turn", side_effect=Exception("persist")
    ):
        out = await routes_chat.send_chat_message(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}, MagicMock()
        )
    assert out["answer"] == "ok"


@pytest.mark.asyncio
async def test_stream_endpoint_error_and_disconnect_paths() -> None:
    req = _request()

    class _Upstream:
        status_code = 500

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def aread(self):
            return b"upstream-fail"

        async def aiter_lines(self):
            if False:
                yield ""

        async def aclose(self):
            return None

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        def stream(self, *_args, **_kwargs):
            return _Upstream()

    with patch.object(routes_chat.httpx, "AsyncClient", return_value=_Client()):
        resp = await routes_chat.send_chat_message_stream(
            req, {"session_id": "s1", "message": "m"}, {"sub": "u1"}
        )
        body = b"".join([chunk async for chunk in resp.body_iterator])
    assert b'"type": "error"' in body

    with pytest.raises(HTTPException) as e1:
        await routes_chat.send_chat_message_stream(
            req, {"session_id": "s1"}, {"sub": "u1"}
        )
    assert e1.value.status_code == 400

    class _Upstream2:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def aiter_lines(self):
            yield None
            yield "data: token"

        async def aclose(self):
            return None

    class _Client2:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        def stream(self, *_args, **_kwargs):
            return _Upstream2()

    async def _disc():
        return True

    req2 = _request()
    req2.is_disconnected = _disc
    with patch.object(routes_chat.httpx, "AsyncClient", return_value=_Client2()):
        resp2 = await routes_chat.send_chat_message_stream(
            req2, {"session_id": "s1", "message": "m"}, {"sub": "u1"}
        )
        _ = b"".join([chunk async for chunk in resp2.body_iterator])

    async def _disc_false():
        return False

    req3 = _request()
    req3.is_disconnected = _disc_false

    class _Upstream3:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def aiter_lines(self):
            yield None
            yield "data: ok"

        async def aclose(self):
            return None

    class _Client3:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        def stream(self, *_args, **_kwargs):
            return _Upstream3()

    with patch.object(routes_chat.httpx, "AsyncClient", return_value=_Client3()):
        resp3 = await routes_chat.send_chat_message_stream(
            req3, {"session_id": "s1", "message": "m"}, {"sub": "u1"}
        )
        body3 = b"".join([chunk async for chunk in resp3.body_iterator])
    assert b"data: ok" in body3


@pytest.mark.asyncio
async def test_list_sessions_and_messages_paths() -> None:
    with pytest.raises(HTTPException) as e1:
        await routes_chat.list_pdf_chat_sessions(current_user={}, db=MagicMock())
    assert e1.value.status_code == 401

    with pytest.raises(HTTPException) as e2:
        await routes_chat.get_pdf_chat_session_messages(
            "db1", current_user={}, db=MagicMock()
        )
    assert e2.value.status_code == 401

    with (
        patch.object(
            routes_chat,
            "list_user_chat_sessions",
            side_effect=routes_chat.OperationalError("x", None, None),
        ),
        patch.object(
            routes_chat._legacy_module,
            "_raise_db_unavailable",
            side_effect=HTTPException(status_code=503, detail="db"),
        ),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.list_pdf_chat_sessions(
                current_user={"sub": "u1"}, db=MagicMock()
            )

    with (
        patch.object(routes_chat, "get_chat_session_by_db_id", return_value=None),
        patch.object(routes_chat, "get_session_messages_ordered", return_value=[]),
        patch.object(
            routes_chat._legacy_module, "stats_cache_get_json", return_value=None
        ),
    ):
        with pytest.raises(HTTPException) as e3:
            await routes_chat.get_pdf_chat_session_messages(
                "db1", current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e3.value.status_code == 404

    with (
        patch.object(routes_chat, "Session", object),
        patch.object(routes_chat, "sessionmaker"),
    ):
        db = MagicMock()
        db.get_bind.return_value = object()
        sm = MagicMock()
        sess = MagicMock()
        sess.__enter__ = lambda self: self
        sess.__exit__ = lambda self, *args: False
        sm.return_value = sess
        routes_chat.sessionmaker.return_value = sm
        with patch.object(
            routes_chat,
            "get_chat_session_by_db_id",
            return_value=SimpleNamespace(id="x"),
        ):
            with patch.object(
                routes_chat, "get_session_messages_ordered", return_value=[]
            ):
                out = await routes_chat.get_pdf_chat_session_messages(
                    "db1", current_user={"sub": "u1"}, db=db
                )
        assert "messages" in out

    with (
        patch.object(
            routes_chat,
            "get_chat_session_by_db_id",
            side_effect=routes_chat.OperationalError("x", None, None),
        ),
        patch.object(
            routes_chat._legacy_module, "stats_cache_get_json", return_value=None
        ),
        patch.object(
            routes_chat._legacy_module,
            "_raise_db_unavailable",
            side_effect=HTTPException(status_code=503, detail="db"),
        ),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.get_pdf_chat_session_messages(
                "db1", current_user={"sub": "u1"}, db=MagicMock()
            )

    class _DummySession:
        def get_bind(self):
            return object()

    class _Closable:
        def close(self):
            return None

    with (
        patch.object(routes_chat, "Session", _DummySession),
        patch.object(routes_chat, "sessionmaker", return_value=lambda: _Closable()),
        patch.object(
            routes_chat._legacy_module, "stats_cache_get_json", return_value=None
        ),
        patch.object(
            routes_chat,
            "get_chat_session_by_db_id",
            return_value=SimpleNamespace(id="db1"),
        ),
        patch.object(routes_chat, "get_session_messages_ordered", return_value=[]),
    ):
        out2 = await routes_chat.get_pdf_chat_session_messages(
            "db1", current_user={"sub": "u1"}, db=_DummySession()
        )
    assert "messages" in out2


@pytest.mark.asyncio
async def test_resume_paths() -> None:
    req = _request()
    with pytest.raises(HTTPException) as e1:
        await routes_chat.resume_pdf_chat_session(
            req, "db1", current_user={}, db=MagicMock()
        )
    assert e1.value.status_code == 401

    with patch.object(routes_chat, "get_chat_session_by_db_id", return_value=None):
        with pytest.raises(HTTPException) as e2:
            await routes_chat.resume_pdf_chat_session(
                req, "db1", current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e2.value.status_code == 404

    sess = SimpleNamespace(
        id="db1",
        ai_session_id="ai1",
        pdf_id=None,
        filename="f.pdf",
        llm_provider="cloud",
        mode="flash",
        context_text="",
    )
    with patch.object(routes_chat, "get_chat_session_by_db_id", return_value=sess):
        with pytest.raises(HTTPException) as e3:
            await routes_chat.resume_pdf_chat_session(
                req, "db1", current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e3.value.status_code == 410

    sess2 = SimpleNamespace(
        id="db2",
        ai_session_id="ai2",
        pdf_id=None,
        filename="f.pdf",
        llm_provider="cloud",
        mode="flash",
        context_text="hello",
    )
    fail = MagicMock(status_code=500, text="x")
    fail.json.side_effect = Exception("bad-json")
    _attach_client(req, fail)
    with (
        patch.object(routes_chat, "get_chat_session_by_db_id", return_value=sess2),
        patch.object(routes_chat, "get_session_messages_ordered", return_value=[]),
        patch.object(routes_chat, "history_for_ai_restore", return_value=[]),
    ):
        with pytest.raises(HTTPException) as e4:
            await routes_chat.resume_pdf_chat_session(
                req, "db2", current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e4.value.status_code == 502

    sess3 = SimpleNamespace(
        id="db3",
        ai_session_id="ai3",
        pdf_id="pdf-id",
        filename="f.pdf",
        llm_provider="cloud",
        mode="flash",
        context_text="",
    )
    ok = MagicMock(status_code=200)
    ok.json.return_value = {}
    _attach_client(req, ok)
    with (
        patch.object(routes_chat, "get_chat_session_by_db_id", return_value=sess3),
        patch.object(
            routes_chat,
            "get_pdf_from_db",
            return_value=SimpleNamespace(pdf_data=b"%PDF"),
        ),
        patch.object(
            routes_chat, "run_in_threadpool", AsyncMock(return_value="pdf-text")
        ),
        patch.object(routes_chat, "get_session_messages_ordered", return_value=[]),
        patch.object(routes_chat, "history_for_ai_restore", return_value=[]),
    ):
        out = await routes_chat.resume_pdf_chat_session(
            req, "db3", current_user={"sub": "u1"}, db=MagicMock()
        )
    assert out["session_id"] == "ai3"

    with (
        patch.object(
            routes_chat,
            "get_chat_session_by_db_id",
            side_effect=routes_chat.OperationalError("x", None, None),
        ),
        patch.object(
            routes_chat._legacy_module,
            "_raise_db_unavailable",
            side_effect=HTTPException(status_code=503, detail="db"),
        ),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.resume_pdf_chat_session(
                req, "db1", current_user={"sub": "u1"}, db=MagicMock()
            )

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=RuntimeError("boom"))
    )
    with (
        patch.object(routes_chat, "get_chat_session_by_db_id", return_value=sess2),
        patch.object(routes_chat, "get_session_messages_ordered", return_value=[]),
        patch.object(routes_chat, "history_for_ai_restore", return_value=[]),
    ):
        with pytest.raises(HTTPException) as e5:
            await routes_chat.resume_pdf_chat_session(
                req, "db2", current_user={"sub": "u1"}, db=MagicMock()
            )
    assert e5.value.status_code == 500


@pytest.mark.asyncio
async def test_general_start_and_message_paths() -> None:
    req = _request()
    with pytest.raises(HTTPException) as e1:
        await routes_chat.start_general_chat(req, {}, {}, MagicMock(), MagicMock())
    assert e1.value.status_code == 401

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(False, "local")),
    ):
        with pytest.raises(HTTPException) as e2:
            await routes_chat.start_general_chat(
                req, {}, {"sub": "u1"}, MagicMock(), MagicMock()
            )
    assert e2.value.status_code == 403

    bad = MagicMock(status_code=429)
    bad.json.return_value = {"detail": "busy"}
    _attach_client(req, bad)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "local")),
    ):
        with pytest.raises(HTTPException) as e3:
            await routes_chat.start_general_chat(
                req, {"llm_provider": "cloud"}, {"sub": "u1"}, MagicMock(), None
            )
    assert e3.value.status_code == 429

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=httpx.TimeoutException("t"))
    )
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e4:
            await routes_chat.start_general_chat(
                req, {}, {"sub": "u1"}, MagicMock(), MagicMock()
            )
    assert e4.value.status_code == 504

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(
            return_value=MagicMock(status_code=200, json=lambda: {"session_id": "ok"})
        )
    )
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "local")),
    ):
        out = await routes_chat.start_general_chat(
            req, {"mode": "pro"}, {"sub": "u1"}, MagicMock(), None
        )
    assert out["session_id"] == "ok"

    err = httpx.HTTPStatusError(
        "bad",
        request=httpx.Request("POST", "http://x"),
        response=httpx.Response(502, text="bad"),
    )
    req.app.state.ai_http_client = MagicMock(post=AsyncMock(side_effect=err))
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.start_general_chat(
                req, {}, {"sub": "u1"}, MagicMock(), MagicMock()
            )

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=RuntimeError("x"))
    )
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.start_general_chat(
                req, {}, {"sub": "u1"}, MagicMock(), MagicMock()
            )

    with pytest.raises(HTTPException) as e5:
        await routes_chat.send_general_chat_message(
            req, {}, {}, MagicMock(), MagicMock()
        )
    assert e5.value.status_code == 401

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(False, "cloud")),
    ):
        with pytest.raises(HTTPException) as e6:
            await routes_chat.send_general_chat_message(
                req,
                {"session_id": "s", "message": "m"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e6.value.status_code == 403

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e7:
            await routes_chat.send_general_chat_message(
                req, {"session_id": "s"}, {"sub": "u1"}, MagicMock(), MagicMock()
            )
    assert e7.value.status_code == 400

    q = MagicMock(status_code=429)
    q.json.return_value = {"detail": "quota exceeded gemini"}
    _attach_client(req, q)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e8:
            await routes_chat.send_general_chat_message(
                req,
                {"session_id": "s", "message": "m"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e8.value.status_code == 429

    q2 = MagicMock(status_code=429)
    q2.json.return_value = {"detail": "rate limit provider busy"}
    _attach_client(req, q2)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException):
            await routes_chat.send_general_chat_message(
                req,
                {"session_id": "s", "message": "m"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )

    n429 = MagicMock(status_code=500)
    n429.json.return_value = {"detail": "ai boom"}
    _attach_client(req, n429)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e8b:
            await routes_chat.send_general_chat_message(
                req,
                {"session_id": "s", "message": "m"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e8b.value.status_code == 500

    rt = MagicMock(post=AsyncMock(side_effect=httpx.ReadTimeout("rt")))
    req.app.state.ai_http_client = rt
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e9:
            await routes_chat.send_general_chat_message(
                req,
                {"session_id": "s", "message": "m"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e9.value.status_code == 504

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=RuntimeError("x"))
    )
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e10:
            await routes_chat.send_general_chat_message(
                req,
                {"session_id": "s", "message": "m"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e10.value.status_code == 500


@pytest.mark.asyncio
async def test_translate_paths() -> None:
    req = _request()
    with pytest.raises(HTTPException) as e1:
        await routes_chat.translate_chat_message(req, {}, {}, MagicMock(), MagicMock())
    assert e1.value.status_code == 401

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(False, "cloud")),
    ):
        with pytest.raises(HTTPException) as e2:
            await routes_chat.translate_chat_message(
                req, {"text": "a"}, {"sub": "u1"}, MagicMock(), MagicMock()
            )
    assert e2.value.status_code == 403

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e3:
            await routes_chat.translate_chat_message(
                req, {"text": " "}, {"sub": "u1"}, MagicMock(), MagicMock()
            )
    assert e3.value.status_code == 400

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e4:
            await routes_chat.translate_chat_message(
                req,
                {"text": "hello", "source_language": "de", "target_language": "en"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e4.value.status_code == 400

    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        out = await routes_chat.translate_chat_message(
            req,
            {"text": "same", "source_language": "en", "target_language": "en"},
            {"sub": "u1"},
            MagicMock(),
            MagicMock(),
        )
    assert out["translation"] == "same"

    non200 = MagicMock(status_code=500)
    non200.json.return_value = {"detail": "translate fail"}
    _attach_client(req, non200)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "local")),
    ):
        with pytest.raises(HTTPException) as e5:
            await routes_chat.translate_chat_message(
                req,
                {"text": "x", "source_language": "tr", "target_language": "en"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e5.value.status_code == 500

    non200b = MagicMock(status_code=400)
    non200b.json.return_value = {"detail": "bad req"}
    _attach_client(req, non200b)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e5b:
            await routes_chat.translate_chat_message(
                req,
                {"text": "x", "source_language": "tr", "target_language": "en"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e5b.value.status_code == 400

    req.app.state.ai_http_client = MagicMock(
        post=AsyncMock(side_effect=RuntimeError("x"))
    )
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        with pytest.raises(HTTPException) as e6:
            await routes_chat.translate_chat_message(
                req,
                {"text": "x", "source_language": "tr", "target_language": "en"},
                {"sub": "u1"},
                MagicMock(),
                MagicMock(),
            )
    assert e6.value.status_code == 500

    ok = MagicMock(status_code=200)
    ok.json.return_value = {"translation": "hello"}
    _attach_client(req, ok)
    with patch.object(
        routes_chat._legacy_module.user_repo,
        "get_user_role_and_llm_provider",
        AsyncMock(return_value=(True, "cloud")),
    ):
        out2 = await routes_chat.translate_chat_message(
            req,
            {"text": "merhaba", "source_language": "tr", "target_language": "en"},
            {"sub": "u1"},
            MagicMock(),
            MagicMock(),
        )
    assert out2["translation"] == "hello"
