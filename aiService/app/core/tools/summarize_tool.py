"""Summarize PDF session text in-process (no client_actions); uses llm_manager generators."""
from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolRunResult


class SummarizePdfTool(BaseTool):
    """Uses full_text from tool_context (PDF chat session); returns plain summary string for agent loop."""

    name = "summarize_pdf"
    description = (
        "Yüklü PDF oturumundaki metni, kullanıcının istediği formatta özetler. "
        "Örn. format: '3 maddelik', 'kısa paragraf', 'detaylı', 'İngilizce'. "
        "Belirtilmezse genel özet üretir."
    )
    parameters_schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "format": {
                "type": "string",
                "description": (
                    "Özetin formatı. Örn: '3 maddelik', 'kısa paragraf', 'detaylı', 'İngilizce'. "
                    "Belirtilmemişse 'genel'."
                ),
            },
        },
        "additionalProperties": False,
        "required": [],
    }

    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        # Local import: avoid circular import with llm_manager <-> tools
        from app.services.llm_manager import (
            CloudMode,
            _cloud_generate,
            _local_chat_generate,
        )

        ctx = kwargs.get("_tool_context") or {}
        if not isinstance(ctx, dict):
            ctx = {}

        fmt = kwargs.get("format", "genel")
        if fmt is None or (isinstance(fmt, str) and not fmt.strip()):
            fmt = "genel"
        if not isinstance(fmt, str):
            fmt = "genel"

        full_text = ctx.get("full_text")
        if full_text is None or not str(full_text).strip():
            return "Hata: PDF metni bulunamadı"

        text_content = str(full_text)[:20000]
        prompt_instruction = (
            f"Lütfen aşağıdaki metni '{fmt}' formatına tam uygun olacak şekilde özetle. "
            "Sadece özeti ver."
        )

        provider = ctx.get("llm_provider", "cloud")
        mode_raw = ctx.get("mode", "flash")
        cloud_mode: CloudMode = "pro" if mode_raw == "pro" else "flash"

        if provider == "cloud":
            return _cloud_generate(text_content, prompt_instruction, cloud_mode)
        if provider == "local":
            return _local_chat_generate(text_content, prompt_instruction, None)

        return "Hata: Geçersiz llm_provider."
