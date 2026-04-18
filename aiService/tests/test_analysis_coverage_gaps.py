"""analysis router: ek hata yolları ve dallar (mock)."""

from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

VALID_API_KEY = "test-secret-key-123"
HEADERS = {"X-API-Key": VALID_API_KEY}


@pytest.fixture(autouse=True)
def mock_api_key():
    with patch("app.deps.settings") as mock_settings:
        mock_settings.AI_SERVICE_API_KEY = VALID_API_KEY
        yield mock_settings


@pytest.fixture
def client():
    return TestClient(app)


class TestSummarizeSyncLocalBranch:
    @patch("app.routers.analysis.summarize_text", return_value="loc özet")
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes",
        return_value="txt",
    )
    def test_summarize_local_provider(self, _ext, _sum, client):
        pdf = io.BytesIO(b"%PDF-1.4 minimal")
        r = client.post(
            "/api/v1/ai/summarize-sync?llm_provider=local&mode=flash",
            files={"file": ("a.pdf", pdf, "application/pdf")},
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert r.json()["summary"] == "loc özet"


class TestSummarizeSyncEnglishPromptBranches:
    """analysis.summarize_synchronous: cloud/local + language=en prompt paths."""

    @patch("app.routers.analysis.summarize_text", return_value="en cloud")
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes",
        return_value="raw",
    )
    def test_summarize_sync_cloud_language_en(self, _ext, _sum, client):
        pdf = io.BytesIO(b"%PDF-1.4")
        r = client.post(
            "/api/v1/ai/summarize-sync?llm_provider=cloud&mode=flash&language=en",
            files={"file": ("b.pdf", pdf, "application/pdf")},
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert r.json()["summary"] == "en cloud"
        args, kwargs = _sum.call_args
        assert kwargs.get("language") == "en"
        pinst = kwargs.get("prompt_instruction", "")
        assert "Summarize this PDF document in English" in pinst

    @patch("app.routers.analysis.summarize_text", return_value="en local")
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes",
        return_value="raw",
    )
    def test_summarize_sync_local_language_en(self, _ext, _sum, client):
        pdf = io.BytesIO(b"%PDF-1.4")
        r = client.post(
            "/api/v1/ai/summarize-sync?llm_provider=local&mode=flash&language=en",
            files={"file": ("c.pdf", pdf, "application/pdf")},
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert r.json()["summary"] == "en local"
        _args, kwargs = _sum.call_args
        pinst = kwargs.get("prompt_instruction", "")
        assert "Specify the main topics and important points" in pinst


class TestSummarizeAsync:
    @patch("app.routers.analysis.pdf_tasks.async_summarize_pdf")
    def test_async_enqueues(self, mock_delay, client):
        r = client.post(
            "/api/v1/ai/summarize-async",
            json={
                "pdf_id": 9,
                "storage_path": "/p.pdf",
                "callback_url": "http://cb",
                "llm_provider": "local",
            },
            headers=HEADERS,
        )
        assert r.status_code == 200
        mock_delay.delay.assert_called_once()


class TestStartChatUpload:
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes",
        return_value="big",
    )
    def test_chat_start_upload(self, _ext, client):
        pdf = io.BytesIO(b"%PDF-1.4 x")
        r = client.post(
            "/api/v1/ai/chat/start?llm_provider=cloud&mode=pro",
            files={"file": ("d.pdf", pdf, "application/pdf")},
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert "session_id" in r.json()


class TestGeneralChatStart:
    def test_general_start_query(self, client):
        r = client.post(
            "/api/v1/ai/chat/general/start?llm_provider=local&mode=flash",
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert "session_id" in r.json()


class TestTtsSuccess:
    @patch("app.routers.analysis.text_to_speech", return_value=io.BytesIO(b"mp3"))
    def test_tts_returns_audio(self, _tts, client):
        r = client.post(
            "/api/v1/ai/tts",
            json={"text": "Merhaba"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("audio")


class TestSummarizeSyncHttpReraise:
    @patch(
        "app.routers.analysis.summarize_text",
        side_effect=__import__("fastapi").HTTPException(
            status_code=418, detail="teapot"
        ),
    )
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes", return_value="t"
    )
    def test_http_exception_reraises(self, _ext, _sum, client):
        pdf = io.BytesIO(b"%PDF-1.4")
        r = client.post(
            "/api/v1/ai/summarize-sync",
            files={"file": ("a.pdf", pdf, "application/pdf")},
            headers=HEADERS,
        )
        assert r.status_code == 418


class TestSummarizeSyncErrors:
    @patch("app.routers.analysis.summarize_text", side_effect=RuntimeError("LLM down"))
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes",
        return_value="txt",
    )
    def test_summarize_sync_500(self, _ext, _sum, client):
        pdf = io.BytesIO(b"%PDF-1.4 minimal")
        r = client.post(
            "/api/v1/ai/summarize-sync",
            files={"file": ("a.pdf", pdf, "application/pdf")},
            headers=HEADERS,
        )
        assert r.status_code == 500


class TestStartChatVariants:
    @patch(
        "app.routers.analysis.pdf_service.extract_text_from_pdf_bytes",
        return_value="body",
    )
    def test_start_chat_from_text(self, _ext, client):
        r = client.post(
            "/api/v1/ai/chat/start-from-text",
            json={
                "pdf_text": "hello",
                "filename": "x.pdf",
                "llm_provider": "local",
                "pdf_id": "pid",
                "user_id": "uid",
            },
            headers=HEADERS,
        )
        assert r.status_code == 200
        assert "session_id" in r.json()

    @patch(
        "app.services.ai_service.restore_pdf_chat_session",
        side_effect=RuntimeError("fail"),
    )
    def test_restore_session_500(self, _rs, client):
        r = client.post(
            "/api/v1/ai/chat/restore-session",
            json={"session_id": "s1", "pdf_text": "x"},
            headers=HEADERS,
        )
        assert r.status_code == 500


class TestGeneralChatNotFound:
    def test_session_missing_404(self, client):
        r = client.post(
            "/api/v1/ai/chat/general",
            json={"session_id": "no-such-general-session", "message": "hi"},
            headers=HEADERS,
        )
        assert r.status_code == 404


class TestGeneralChatSuccess:
    @patch("app.routers.analysis.llm_general_chat", return_value=("gen cevap", []))
    def test_general_with_history(self, _lc, client):
        import time

        sid = "gsess"
        sess = {
            "history": [{"role": "user", "content": "a"}],
            "llm_provider": "cloud",
            "mode": "flash",
            "created_at": time.time(),
        }
        with patch.dict(
            "app.services.ai_service._GENERAL_CHAT_SESSIONS", {sid: sess}, clear=False
        ):
            r = client.post(
                "/api/v1/ai/chat/general",
                json={"session_id": sid, "message": "devam"},
                headers=HEADERS,
            )
        assert r.status_code == 200
        assert r.json()["answer"] == "gen cevap"


class TestGeneralChatHttpReraise:
    @patch(
        "app.routers.analysis.llm_general_chat",
        side_effect=__import__("fastapi").HTTPException(status_code=422, detail="bad"),
    )
    def test_reraises_http(self, _lc, client):
        import time

        sid = "g2"
        sess = {
            "history": [],
            "llm_provider": "cloud",
            "mode": "flash",
            "created_at": time.time(),
        }
        with patch.dict(
            "app.services.ai_service._GENERAL_CHAT_SESSIONS", {sid: sess}, clear=False
        ):
            r = client.post(
                "/api/v1/ai/chat/general",
                json={"session_id": sid, "message": "x"},
                headers=HEADERS,
            )
        assert r.status_code == 422


class TestGeneralChat:
    @patch("app.routers.analysis.llm_general_chat", side_effect=ValueError("bad"))
    def test_general_chat_500(self, _gc, client):
        with patch.dict(
            "app.services.ai_service._GENERAL_CHAT_SESSIONS",
            {
                "g1": {
                    "history": [],
                    "llm_provider": "cloud",
                    "mode": "flash",
                    "created_at": __import__("time").time(),
                }
            },
            clear=False,
        ):
            r = client.post(
                "/api/v1/ai/chat/general",
                json={"session_id": "g1", "message": "hi"},
                headers=HEADERS,
            )
        assert r.status_code == 500


class TestChatPdfWithHistory:
    @patch("app.routers.analysis.chat_over_pdf", return_value=("ans", []))
    def test_history_turns_in_prompt(self, _co, client):
        sess = {
            "text": "pdf",
            "filename": "f.pdf",
            "history": [{"role": "user", "content": "önceki"}],
            "llm_provider": "cloud",
            "mode": "flash",
            "created_at": __import__("time").time(),
        }
        with patch.dict(
            "app.services.ai_service._PDF_CHAT_SESSIONS", {"h1": sess}, clear=False
        ):
            r = client.post(
                "/api/v1/ai/chat",
                json={"session_id": "h1", "message": "devam"},
                headers=HEADERS,
            )
        assert r.status_code == 200


class TestChatPdfLongContext:
    @patch(
        "app.routers.analysis.chat_over_pdf", return_value=("ok", [{"type": "noop"}])
    )
    def test_tool_context_pdf_user_ids(self, _co, client):
        big = "A" * 50000
        sess = {
            "text": big,
            "filename": "f.pdf",
            "history": [],
            "llm_provider": "cloud",
            "mode": "flash",
            "pdf_id": "p1",
            "user_id": "u1",
            "created_at": __import__("time").time(),
        }
        with patch.dict(
            "app.services.ai_service._PDF_CHAT_SESSIONS", {"sid": sess}, clear=False
        ):
            r = client.post(
                "/api/v1/ai/chat",
                json={"session_id": "sid", "message": "q"},
                headers=HEADERS,
            )
        assert r.status_code == 200
        assert r.json().get("client_actions")


class TestChatPdfHttp500:
    @patch("app.routers.analysis.chat_over_pdf", side_effect=OSError("net"))
    def test_chat_500_branch(self, _co, client):
        sess = {
            "text": "t",
            "filename": "f.pdf",
            "history": [],
            "llm_provider": "cloud",
            "mode": "flash",
            "created_at": __import__("time").time(),
        }
        with patch.dict(
            "app.services.ai_service._PDF_CHAT_SESSIONS", {"sid2": sess}, clear=False
        ):
            r = client.post(
                "/api/v1/ai/chat",
                json={"session_id": "sid2", "message": "q"},
                headers=HEADERS,
            )
        assert r.status_code == 500
