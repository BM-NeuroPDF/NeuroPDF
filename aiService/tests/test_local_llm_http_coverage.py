"""LOCAL_LLM_URL OpenAI uyumlu yol: httpx mock (Ollama'a gerçek istek yok)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestOpenAICompatiblePath:
    @pytest.fixture(autouse=True)
    def _openai_base(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.local_llm_service._local_openai_base_url",
            lambda: "http://fake:11434/v1",
        )

    @patch("app.services.local_llm_service.httpx.Client")
    def test_openai_summarize_success(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "Özet metni"}}]
        }
        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.__exit__.return_value = None
        inst.post.return_value = mock_resp
        mock_client_cls.return_value = inst

        from app.services.local_llm_service import analyze_text_with_local_llm

        r = analyze_text_with_local_llm("Uzun metin.", task="summarize")
        assert r["summary"] == "Özet metni"

    @patch("app.services.local_llm_service.httpx.Client")
    def test_openai_chat_success(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": "Cevap"}}]}
        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.post.return_value = mock_resp
        mock_client_cls.return_value = inst

        from app.services.local_llm_service import analyze_text_with_local_llm

        r = analyze_text_with_local_llm(
            "Selam",
            task="chat",
            instruction="Yardım et",
            history=[{"role": "user", "content": "önceki"}],
        )
        assert r["answer"] == "Cevap"

    @patch("app.services.local_llm_service.httpx.Client")
    def test_openai_chat_invalid_role_branch(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": "x"}}]}
        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.post.return_value = mock_resp
        mock_client_cls.return_value = inst

        from app.services.local_llm_service import analyze_text_with_local_llm

        analyze_text_with_local_llm(
            "m",
            task="chat",
            history=[{"role": "not_valid_role", "content": "y"}],
        )
        msgs = inst.post.call_args[1]["json"]["messages"]
        roles = [m["role"] for m in msgs if m["role"] != "system"]
        assert "user" in roles

    @patch("app.services.local_llm_service.httpx.Client")
    def test_openai_summarize_http_error(self, mock_client_cls):
        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.post.side_effect = ValueError("boom")
        mock_client_cls.return_value = inst

        from app.services.local_llm_service import analyze_text_with_local_llm

        r = analyze_text_with_local_llm("Metin.", task="summarize")
        assert "hata" in r["summary"].lower() or "boom" in r["summary"]

    @patch("app.services.local_llm_service.httpx.Client")
    def test_openai_chat_http_error(self, mock_client_cls):
        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.post.side_effect = TimeoutError("timeout")
        mock_client_cls.return_value = inst

        from app.services.local_llm_service import analyze_text_with_local_llm

        r = analyze_text_with_local_llm("x", task="chat")
        assert "hatası" in r["answer"] or "timeout" in r["answer"].lower()

    @patch("app.services.local_llm_service.httpx.Client")
    def test_openai_summarize_truncates_long_text(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.post.return_value = mock_resp
        mock_client_cls.return_value = inst

        from app.services.local_llm_service import analyze_text_with_local_llm

        long_t = "W" * 15000
        analyze_text_with_local_llm(long_t, task="summarize")
        user_msg = inst.post.call_args[1]["json"]["messages"][-1]["content"]
        assert len(user_msg) < len(long_t)


def test_local_openai_url_from_settings(monkeypatch):
    monkeypatch.delenv("LOCAL_LLM_URL", raising=False)
    monkeypatch.setattr(
        "app.services.local_llm_service.settings",
        type("S", (), {"LOCAL_LLM_URL": "http://from-settings/v1"})(),
    )
    from app.services import local_llm_service as m

    assert m._local_openai_base_url() == "http://from-settings/v1"
