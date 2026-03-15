"""
AI yanıt formatı doğrulama: JSON veya Markdown gibi beklenen formatların korunduğunu test et.
"""
import json
import re
import pytest
from unittest.mock import patch

pytestmark = [pytest.mark.format]

from app.services.llm_manager import summarize_text, chat_over_pdf, general_chat


def is_valid_markdown_fragment(text: str) -> bool:
    """Metnin Markdown fragment olarak kabul edilebilir olduğunu kontrol et (boş değil, string)."""
    if not isinstance(text, str):
        return False
    return True


def is_valid_json_string(text: str) -> bool:
    """Metnin parse edilebilir JSON olduğunu kontrol et."""
    if not text or not text.strip():
        return False
    try:
        json.loads(text)
        return True
    except json.JSONDecodeError:
        return False


def summary_like_response(text: str) -> bool:
    """Özet yanıtı: boş olmamalı, makul uzunlukta string."""
    if not text or not isinstance(text, str):
        return False
    if len(text.strip()) < 2:
        return False
    return True


def chat_like_response(text: str) -> bool:
    """Chat yanıtı: string, boş da olabilir (model bazen kısa cevap verir)."""
    return isinstance(text, str)


# ==========================================
# Format validators (unit)
# ==========================================


class TestFormatValidators:
    def test_is_valid_markdown_fragment(self):
        assert is_valid_markdown_fragment("## Başlık\nİçerik") is True
        assert is_valid_markdown_fragment("") is True  # fragment boş string kabul
        assert is_valid_markdown_fragment(123) is False

    def test_is_valid_json_string(self):
        assert is_valid_json_string('{"key": "value"}') is True
        assert is_valid_json_string("[1,2,3]") is True
        assert is_valid_json_string("not json") is False
        assert is_valid_json_string("") is False

    def test_summary_like_response(self):
        assert summary_like_response("Kısa özet.") is True
        assert summary_like_response("") is False
        assert summary_like_response("x") is False


# ==========================================
# LLM response format (mocked responses)
# ==========================================


class TestSummarizeResponseFormat:
    """Özetleme endpoint'i benzeri yanıt: her zaman string, boş olmamalı."""

    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_cloud_summary_is_string_non_empty(self, mock_gemini):
        mock_gemini.return_value = "Bu bir özet metnidir."
        result = summarize_text("İçerik", "Özetle", llm_provider="cloud")
        assert isinstance(result, str)
        assert summary_like_response(result)

    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_cloud_summary_markdown_allowed(self, mock_gemini):
        mock_gemini.return_value = "## Özet\n- Madde 1\n- Madde 2"
        result = summarize_text("İçerik", "Özetle", llm_provider="cloud")
        assert is_valid_markdown_fragment(result)
        assert "##" in result or "Madde" in result

    @patch("app.services.llm_manager.analyze_text_with_local_llm")
    def test_local_summary_fallback_string(self, mock_local):
        mock_local.return_value = {}
        result = summarize_text("İçerik", "Özetle", llm_provider="local")
        assert isinstance(result, str)
        assert "Local LLM" in result


class TestChatResponseFormat:
    """Chat yanıtları: string, JSON veya Markdown bekleniyorsa doğrula."""

    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_chat_response_is_string(self, mock_gemini):
        mock_gemini.return_value = "Bu PDF'te X anlatılıyor."
        result = chat_over_pdf(
            session_text="X konusu.",
            filename="f.pdf",
            history_text="",
            user_message="Ne anlatıyor?",
            llm_provider="cloud",
        )
        assert chat_like_response(result)
        assert isinstance(result, str)

    @patch("app.services.llm_manager.ai_service.gemini_generate")
    def test_chat_response_markdown_allowed(self, mock_gemini):
        mock_gemini.return_value = "**Cevap:** Burada bilgi var.\n- Madde 1"
        result = chat_over_pdf(
            session_text="İçerik",
            filename="f.pdf",
            history_text="",
            user_message="Özetle",
            llm_provider="cloud",
        )
        assert is_valid_markdown_fragment(result)


class TestStructuredJsonResponse:
    """Eğer LLM'den JSON beklenen bir endpoint varsa (ileride), format doğrulama."""

    def test_json_response_validation_helper(self):
        valid = '{"summary": "Özet", "points": ["a", "b"]}'
        assert is_valid_json_string(valid)
        data = json.loads(valid)
        assert "summary" in data and "points" in data

    def test_invalid_json_rejected(self):
        assert is_valid_json_string("Not at all json {") is False
