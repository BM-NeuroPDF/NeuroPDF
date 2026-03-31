"""Translate PDF session text in-process (no client_actions); uses llm_manager generators."""
from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolRunResult


class TranslatePdfTool(BaseTool):
    """Uses full_text from tool_context (PDF chat session); returns plain translation string for agent loop."""

    name = "translate_pdf"
    description = (
        "Yüklü PDF oturumundaki metni belirtilen hedef dile profesyonel ve akıcı şekilde çevirir. "
        "Örn. target_language: 'İngilizce', 'Almanca', 'Fransızca'."
    )
    parameters_schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "target_language": {
                "type": "string",
                "description": (
                    "Metnin çevrileceği hedef dil. Örn: 'İngilizce', 'Almanca', 'Fransızca'."
                ),
            },
        },
        "required": ["target_language"],
        "additionalProperties": False,
    }

    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        from app.services.llm_manager import (
            CloudMode,
            _cloud_generate,
            _local_chat_generate,
        )

        ctx = kwargs.get("_tool_context") or {}
        if not isinstance(ctx, dict):
            ctx = {}

        lang = kwargs.get("target_language")
        if lang is None or (isinstance(lang, str) and not lang.strip()):
            return "Hata: Hedef dil (target_language) belirtilmedi."
        if not isinstance(lang, str):
            lang = str(lang)

        full_text = ctx.get("full_text")
        if full_text is None or not str(full_text).strip():
            return "Hata: PDF metni bulunamadı"

        text_content = str(full_text)[:20000]
        prompt_instruction = (
            f"Lütfen aşağıdaki metni '{lang}' diline profesyonel ve akıcı bir şekilde çevir. "
            "Sadece çeviriyi ver."
        )

        provider = ctx.get("llm_provider", "cloud")
        mode_raw = ctx.get("mode", "flash")
        cloud_mode: CloudMode = "pro" if mode_raw == "pro" else "flash"

        if provider == "cloud":
            return _cloud_generate(text_content, prompt_instruction, cloud_mode)
        if provider == "local":
            return _local_chat_generate(text_content, prompt_instruction, None)

        return "Hata: Geçersiz llm_provider."
