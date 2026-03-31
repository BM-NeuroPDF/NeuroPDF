"""Signal the browser to swap two PDF pages locally (pdf-lib on the client)."""
from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolRunResult


class SwapPagesTool(BaseTool):
    """Does not read PDF bytes on the server; client runs pdf-lib after SWAP_PAGES_LOCAL."""

    name = "swap_pages"
    description = (
        "Kullanıcının tarayıcısındaki açık PDF'te iki sayfanın yerini (belgedeki sırayı) "
        "değiştirmek için sinyal gönderir. Sunucu dosyayı değiştirmez; istemci pdf-lib ile uygular. "
        "Kullanıcı iki sayfanın yer değiştirmesini istediğinde kullan (1 tabanlı sayfa numaraları)."
    )
    parameters_schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "page_a": {
                "type": "integer",
                "minimum": 1,
                "description": "Birinci sayfa numarası (1 tabanlı)",
            },
            "page_b": {
                "type": "integer",
                "minimum": 1,
                "description": "İkinci sayfa numarası (1 tabanlı)",
            },
        },
        "required": ["page_a", "page_b"],
    }

    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        try:
            a = int(kwargs.get("page_a", 0))
            b = int(kwargs.get("page_b", 0))
        except (TypeError, ValueError):
            return "Hata: page_a ve page_b geçerli tam sayı olmalı."

        if a < 1 or b < 1:
            return "Hata: Sayfa numaraları 1 veya daha büyük olmalıdır."
        if a == b:
            return "Hata: Aynı sayfa seçilemez; farklı iki sayfa belirtin."

        msg = (
            "Kullanıcının tarayıcısına iki sayfanın yer değiştirmesi için sinyal gönderildi; "
            f"istemci {a}. ve {b}. sayfaları yer değiştirecek."
        )
        return ToolRunResult(
            message=msg,
            client_actions=[
                {
                    "type": "SWAP_PAGES_LOCAL",
                    "payload": {"page_a": a, "page_b": b},
                }
            ],
        )
