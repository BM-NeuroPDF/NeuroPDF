"""
pytest-asyncio ile asenkron AI akışları: summarize-sync, chat/start, chat endpoint'leri.
LLM mock'lanır; gerçek API maliyeti yok.
"""
import pytest

pytestmark = [pytest.mark.async_ai]
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

# TestClient senkron; async endpoint'leri asyncio.to_thread ile çağırır, bu yüzden TestClient yeterli.
# Eğer tam async test istiyorsak httpx.AsyncClient kullanırız.
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def mock_summarize():
    """summarize_text'i mock'la (asyncio.to_thread ile çağrıldığı için senkron mock)."""
    with patch("app.routers.analysis.summarize_text") as m:
        m.return_value = "Mock özet metni."
        yield m


@pytest.fixture
def mock_pdf_extract():
    """PDF'ten metin çıkarma mock."""
    with patch("app.routers.analysis.pdf_service.extract_text_from_pdf_bytes") as m:
        m.return_value = "PDF'ten çıkarılan metin."
        yield m


@pytest.fixture
def mock_create_session():
    with patch("app.routers.analysis.ai_service.create_pdf_chat_session") as m:
        m.return_value = "test-session-id-123"
        yield m


@pytest.fixture
def mock_chat_over_pdf():
    with patch("app.routers.analysis.chat_over_pdf") as m:
        m.return_value = ("Mock chat cevabı.", [])
        yield m


@pytest.fixture
def mock_general_chat():
    with patch("app.routers.analysis.llm_general_chat") as m:
        m.return_value = ("Mock genel cevap.", [])
        yield m


VALID_API_KEY = "test-key-ai-service"


@pytest.fixture
def api_key_headers():
    return {"X-API-Key": VALID_API_KEY}


# API key: deps.verify_api_key import sırasında bağlandığı için settings'i mock'layıp geçerli key veriyoruz
@pytest.fixture(autouse=True)
def mock_api_key_settings():
    with patch("app.deps.settings") as mock_settings:
        mock_settings.AI_SERVICE_API_KEY = VALID_API_KEY
        yield mock_settings


@pytest.fixture
def inject_pdf_session():
    """Chat endpoint'inin session bulabilmesi için in-memory session ekle."""
    import app.services.ai_service as ai_service
    sid = "test-session-id-123"
    ai_service._PDF_CHAT_SESSIONS[sid] = {
        "text": "PDF içeriği.",
        "filename": "doc.pdf",
        "history": [],
        "created_at": __import__("time").time(),
        "llm_provider": "cloud",
        "mode": "flash",
    }
    yield sid
    ai_service._PDF_CHAT_SESSIONS.pop(sid, None)


# ==========================================
# Async: Summarize (sync endpoint ama asyncio.to_thread kullanıyor)
# ==========================================


class TestSummarizeSyncAsync:
    """POST /api/v1/ai/summarize-sync async çalışıyor, LLM mock'lu."""

    def test_summarize_sync_returns_200_and_format(self, mock_summarize, mock_pdf_extract, api_key_headers):
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/summarize-sync",
            files={"file": ("test.pdf", b"%PDF-1.4 fake content", "application/pdf")},
            params={"llm_provider": "cloud", "mode": "flash"},
            headers=api_key_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert "summary" in data
        assert data["summary"] == "Mock özet metni."
        assert data.get("method") == "synchronous"

    def test_summarize_sync_response_structure(self, mock_summarize, mock_pdf_extract, api_key_headers):
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/summarize-sync",
            files={"file": ("x.pdf", b"fake", "application/pdf")},
            headers=api_key_headers,
        )
        data = response.json()
        assert "pdf_text" in data
        assert "llm_provider" in data
        assert "summary" in data


# ==========================================
# Async: Chat start + chat message
# ==========================================


class TestChatFlowAsync:
    """Chat başlatma ve mesaj gönderme akışı."""

    def test_start_chat_from_text_returns_session_id(self, mock_create_session, api_key_headers):
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/chat/start-from-text",
            json={
                "pdf_text": "PDF içeriği burada.",
                "filename": "doc.pdf",
                "llm_provider": "cloud",
                "mode": "flash",
            },
            headers=api_key_headers,
        )
        assert response.status_code == 200
        assert response.json()["session_id"] == "test-session-id-123"

    def test_chat_returns_answer(self, inject_pdf_session, mock_chat_over_pdf, api_key_headers):
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/chat",
            json={"session_id": inject_pdf_session, "message": "Özetle."},
            headers=api_key_headers,
        )
        assert response.status_code == 200
        assert response.json()["answer"] == "Mock chat cevabı."


# ==========================================
# pytest-asyncio: gerçek async client ile (opsiyonel)
# ==========================================


@pytest.mark.asyncio
async def test_health_endpoint_async():
    """Async HTTP client ile health check."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        response = await ac.get("/api/v1/ai/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "endpoints" in data


@pytest.mark.asyncio
async def test_summarize_sync_async_client(
    mock_summarize, mock_pdf_extract, api_key_headers
):
    """AsyncClient ile summarize-sync (event loop üzerinden)."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        response = await ac.post(
            "/api/v1/ai/summarize-sync",
            files={"file": ("t.pdf", b"%PDF fake", "application/pdf")},
            params={"llm_provider": "cloud"},
            headers=api_key_headers,
        )
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
