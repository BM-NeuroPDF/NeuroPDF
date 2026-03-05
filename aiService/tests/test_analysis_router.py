"""
Integration tests for aiService analysis router endpoints.
FastAPI TestClient ile tüm endpointler simüle edilerek test edilir.
"""
import pytest
import io
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app

VALID_API_KEY = "test-secret-key-123"
HEADERS = {"X-API-Key": VALID_API_KEY}


@pytest.fixture(autouse=True)
def mock_api_key():
    """Tüm testlerde geçerli API key ile settings'i mock'la."""
    with patch("app.deps.settings") as mock_settings:
        mock_settings.AI_SERVICE_API_KEY = VALID_API_KEY
        yield mock_settings


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    """GET /api/v1/ai/health endpoint testleri"""

    def test_health_returns_200(self, client):
        """Health endpoint'i API Key olmadan bile 200 dönmeli."""
        response = client.get("/api/v1/ai/health")
        assert response.status_code == 200

    def test_health_response_structure(self, client):
        """Health yanıtı doğru yapıda olmalı."""
        response = client.get("/api/v1/ai/health")
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "ai_service"
        assert "endpoints" in data
        assert "llm" in data

    def test_health_lists_all_endpoints(self, client):
        """Health yanıtı tüm endpoint'leri listelemeli."""
        response = client.get("/api/v1/ai/health")
        endpoints = response.json()["endpoints"]
        assert "sync" in endpoints
        assert "async" in endpoints
        assert "chat_start" in endpoints
        assert "chat" in endpoints
        assert "tts" in endpoints


class TestApiKeyProtection:
    """Korunan endpoint'lerin API Key gerektirdiğini doğrula."""

    def test_summarize_sync_requires_api_key(self, client):
        """
        /summarize-sync API Key olmadan 401 dönmeli.
        """
        fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
        response = client.post(
            "/api/v1/ai/summarize-sync",
            files={"file": ("test.pdf", fake_pdf, "application/pdf")},
            # NO headers — no API key
        )
        assert response.status_code == 401

    def test_chat_requires_api_key(self, client):
        """
        /chat API Key olmadan 401 dönmeli.
        """
        response = client.post(
            "/api/v1/ai/chat",
            json={"session_id": "abc123", "message": "Hello"},
            # NO headers
        )
        assert response.status_code == 401

    def test_tts_requires_api_key(self, client):
        """
        /tts API Key olmadan 401 dönmeli.
        """
        response = client.post(
            "/api/v1/ai/tts",
            json={"text": "Hello world"},
            # NO headers
        )
        assert response.status_code == 401

    def test_summarize_async_requires_api_key(self, client):
        """/summarize-async API Key olmadan 401 dönmeli."""
        response = client.post(
            "/api/v1/ai/summarize-async",
            json={
                "pdf_id": 1,
                "storage_path": "path/to/file.pdf",
                "callback_url": "http://backend/callback",
            },
            # NO headers
        )
        assert response.status_code == 401


class TestChatEndpoint:
    """POST /api/v1/ai/chat endpoint testleri"""

    def test_chat_session_not_found(self, client):
        """
        Var olmayan session_id ile chat isteği 404 dönmeli.
        """
        response = client.post(
            "/api/v1/ai/chat",
            json={"session_id": "nonexistent-session", "message": "Merhaba"},
            headers=HEADERS,
        )
        assert response.status_code == 404

    def test_chat_with_valid_session(self, client):
        """
        Geçerli bir oturumla chat isteği başarılı olmalı.
        """
        mock_session = {
            "text": "This is the PDF content for testing.",
            "filename": "test.pdf",
            "history": [],
            "llm_provider": "cloud",
            "mode": "flash",
        }

        with patch("app.services.ai_service._PDF_CHAT_SESSIONS", {"valid-session-id": mock_session}), \
             patch("app.services.ai_service._cleanup_sessions"), \
             patch("app.routers.analysis.chat_over_pdf", return_value="Test AI response"):
            response = client.post(
                "/api/v1/ai/chat",
                json={"session_id": "valid-session-id", "message": "Özetle"},
                headers=HEADERS,
            )

        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert data["answer"] == "Test AI response"


class TestTTSEndpoint:
    """POST /api/v1/ai/tts endpoint testleri"""

    def test_tts_empty_text_raises_400(self, client):
        """Boş metin ile TTS isteği 400 dönmeli."""
        response = client.post(
            "/api/v1/ai/tts",
            json={"text": ""},
            headers=HEADERS,
        )
        assert response.status_code == 400

    def test_tts_service_failure_raises_500(self, client):
        """TTS servisi başarısız olursa 500 dönmeli."""
        with patch("app.routers.analysis.text_to_speech", return_value=None):
            response = client.post(
                "/api/v1/ai/tts",
                json={"text": "Merhaba dünya"},
                headers=HEADERS,
            )
        assert response.status_code == 500
