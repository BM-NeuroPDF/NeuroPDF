"""Signal the browser to merge all loaded PDFs locally (pdf-lib on the client)."""
from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolRunResult


class MergePdfTool(BaseTool):
    """No server-side merge; client merges PdfContext pdfList after MERGE_PDFS_LOCAL."""

    name = "merge_pdfs"
    description = (
        "Kullanıcının tarayıcısında yüklü olan tüm PDF dosyalarını (yan panel listesi) "
        "tek bir PDF olarak birleştirmek için sinyal gönderir. Sunucu birleştirmez; "
        "istemci pdf-lib ile işlemi yapar. Kullanıcı birden fazla PDF'i birleştirmek istediğinde kullan."
    )
    parameters_schema: dict[str, Any] = {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    }

    def execute(self, **kwargs: Any) -> str | ToolRunResult:
        _ = kwargs  # no args; dispatcher may pass _tool_context
        msg = (
            "Kullanıcının tarayıcısına yüklü tüm PDF'leri birleştirmesi için sinyal gönderildi; "
            "istemci birleştirmeyi uygulayacak."
        )
        return ToolRunResult(
            message=msg,
            client_actions=[
                {
                    "type": "MERGE_PDFS_LOCAL",
                    "payload": {},
                }
            ],
        )
