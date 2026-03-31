"""Signal the browser to clear all loaded PDFs from PdfContext (client-side UI/state)."""
from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolRunResult


class ClearPdfsTool(BaseTool):
    """No server-side file delete; client clears pdfList / active PDF via CLEAR_ALL_PDFS."""

    name = "clear_pdfs"
    description = (
        "Kullanıcının tarayıcısındaki yüklü tüm PDF dosyalarını ve ilgili PDF sohbet durumunu "
        "temizlemek için sinyal gönderir. Kullanıcı ekrandaki PDF'leri kaldırmak, listeyi sıfırlamak "
        "veya 'temizle' / 'kapat' gibi ifadeler kullandığında uygun araçtır."
    )
    parameters_schema: dict[str, Any] = {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    }

    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        _ = kwargs
        msg = (
            "Kullanıcının tarayıcısına yüklü tüm PDF'leri ve panel durumunu temizlemesi için "
            "sinyal gönderildi; istemci uygulayacak."
        )
        return ToolRunResult(
            message=msg,
            client_actions=[
                {
                    "type": "CLEAR_ALL_PDFS",
                    "payload": {},
                }
            ],
        )
