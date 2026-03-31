"""Signal the browser to extract pages locally (pdf-lib on the client)."""
from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolRunResult


class ExtractPagesTool(BaseTool):
    """Does not read PDF bytes on the server; client runs pdf-lib after EXTRACT_PAGES_LOCAL."""

    name = "extract_pages"
    description = (
        "Kullanıcının tarayıcısındaki açık PDF'ten belirtilen sayfa aralığını (1 tabanlı, dahil) "
        "ayırmak için sinyal gönderir. Sunucu dosyayı kesmez; istemci işlemi yapar. "
        "Kullanıcı açıkça sayfa aralığı istediğinde kullan."
    )
    parameters_schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "start_page": {
                "type": "integer",
                "minimum": 1,
                "description": "İlk sayfa (1 tabanlı)",
            },
            "end_page": {
                "type": "integer",
                "minimum": 1,
                "description": "Son sayfa (dahil, 1 tabanlı)",
            },
        },
        "required": ["start_page", "end_page"],
    }

    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        try:
            start = int(kwargs.get("start_page", 0))
            end = int(kwargs.get("end_page", 0))
        except (TypeError, ValueError):
            return "Hata: start_page ve end_page geçerli tam sayı olmalı."

        if start < 1 or end < 1:
            return "Hata: Belirtilen sayfa aralığı geçersiz (sayfa numaraları 1 veya daha büyük olmalı)."
        if end < start:
            return "Hata: Belirtilen sayfa aralığı geçersiz (bitiş sayfası başlangıçtan küçük olamaz)."

        msg = (
            "Kullanıcının tarayıcısına sayfaları kesmesi için sinyal gönderildi; "
            f"istemci {start}–{end} aralığını uygulayacak."
        )
        return ToolRunResult(
            message=msg,
            client_actions=[
                {
                    "type": "EXTRACT_PAGES_LOCAL",
                    "payload": {"start_page": start, "end_page": end},
                }
            ],
        )
