"""Ollama (ollama.Client) dalları — OPENAI tabanı kapalı; client mock."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def force_ollama_not_openai(monkeypatch):
    monkeypatch.setattr(
        "app.services.local_llm_service._local_openai_base_url",
        lambda: "",
    )


@patch("app.services.local_llm_service.ollama.Client")
def test_summarize_ollama_exception(mock_client_cls):
    client = MagicMock()
    client.chat.side_effect = RuntimeError("ollama down")
    mock_client_cls.return_value = client

    from app.services.local_llm_service import analyze_text_with_local_llm

    r = analyze_text_with_local_llm("Metin.", task="summarize")
    assert "hata" in r["summary"].lower() or "ollama" in r["summary"].lower()


@patch("app.services.local_llm_service.ollama.Client")
def test_chat_invalid_role_normalized(mock_client_cls):
    client = MagicMock()
    client.chat.return_value = {"message": {"content": "ok"}}
    mock_client_cls.return_value = client

    from app.services.local_llm_service import analyze_text_with_local_llm

    analyze_text_with_local_llm(
        "m",
        task="chat",
        history=[{"role": "bogus", "content": "x"}],
    )
    msgs = client.chat.call_args[1]["messages"]
    assert any(m.get("role") == "user" for m in msgs)


@patch("app.services.local_llm_service.ollama.Client")
def test_chat_exception_returns_message(mock_client_cls):
    client = MagicMock()
    client.chat.side_effect = Exception("fail")
    mock_client_cls.return_value = client

    from app.services.local_llm_service import analyze_text_with_local_llm

    r = analyze_text_with_local_llm("x", task="chat")
    assert "hatası" in r["answer"] or "fail" in r["answer"].lower()
