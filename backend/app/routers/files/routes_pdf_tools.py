"""PDF upload, listing, storage download, and client PDF tool routes under /files."""

import html
import io
import logging
import re
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from ...config import settings
from ...db import get_db
from ...deps import get_current_user, get_current_user_optional
from ...observability.cache_logger import log_cache

from . import _legacy as _legacy_module

logger = logging.getLogger(__name__)
router = APIRouter(tags=["files"])


class MarkdownToPdfRequest(BaseModel):
    markdown: str

    @field_validator("markdown")
    @classmethod
    def check_size(cls, v: str) -> str:
        if len(v.encode()) > 100 * 1000:
            raise HTTPException(status_code=413, detail="Payload too large")
        return v


@router.post("/markdown-to-pdf")
async def markdown_to_pdf(request: MarkdownToPdfRequest):
    try:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40,
        )
        styles = getSampleStyleSheet()

        style_normal = ParagraphStyle(
            "TrNormal",
            parent=styles["Normal"],
            fontName=_legacy_module.FONT_NAME_REGULAR,
            fontSize=10,
            leading=14,
            spaceAfter=6,
        )

        style_heading_1 = ParagraphStyle(
            "TrHeading1",
            parent=styles["Heading1"],
            fontName=_legacy_module.FONT_NAME_BOLD,
            fontSize=16,
            leading=20,
            spaceAfter=12,
            spaceBefore=12,
            textColor=colors.HexColor("#1a365d"),
        )

        style_heading_2 = ParagraphStyle(
            "TrHeading2",
            parent=styles["Heading2"],
            fontName=_legacy_module.FONT_NAME_BOLD,
            fontSize=13,
            leading=16,
            spaceAfter=10,
            spaceBefore=6,
            textColor=colors.HexColor("#2c3e50"),
        )

        style_heading_3 = ParagraphStyle(
            "TrHeading3",
            parent=styles["Heading3"],
            fontName=_legacy_module.FONT_NAME_BOLD,
            fontSize=11,
            leading=14,
            spaceAfter=8,
            spaceBefore=4,
            textColor=colors.HexColor("#34495e"),
        )

        style_bullet = ParagraphStyle(
            "TrBullet",
            parent=style_normal,
            leftIndent=20,
            bulletIndent=10,
            spaceAfter=4,
        )

        style_cell = ParagraphStyle(
            "TableCell",
            parent=style_normal,
            fontName=_legacy_module.FONT_NAME_REGULAR,
            fontSize=9,
            leading=11,
            spaceAfter=0,
        )

        style_cell_header = ParagraphStyle(
            "TableCellHeader",
            parent=style_normal,
            fontName=_legacy_module.FONT_NAME_BOLD,
            fontSize=9,
            leading=11,
            textColor=colors.white,
            spaceAfter=0,
        )

        story = []
        lines = request.markdown.split("\n")

        def format_inline_markdown(text):
            if not text:
                return ""
            text = html.escape(text)
            text = "".join(c for c in text if ord(c) < 0xFFFF)
            codes = []

            def code_repl(m):
                codes.append(m.group(1))
                return f"__CODE_BLOCK_{len(codes) - 1}__"

            text = re.sub(r"`(.*?)`", code_repl, text)
            text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", text)
            text = re.sub(r"\*(.*?)\*", r"<i>\1</i>", text)
            for i, c in enumerate(codes):
                text = text.replace(
                    f"__CODE_BLOCK_{i}__",
                    f'<font face="Courier" color="#e74c3c">{c}</font>',
                )
            return text

        table_buffer = []
        in_table = False

        for line in lines:
            original_line = line.strip()

            if original_line.startswith("|"):
                in_table = True
                cells = [c.strip() for c in original_line.split("|")]

                if len(cells) > 1 and cells[0] == "":
                    cells.pop(0)
                if len(cells) > 0 and cells[-1] == "":
                    cells.pop(-1)

                is_separator = all(re.match(r"^[\s\-:]+$", c) for c in cells)

                if not is_separator and cells:
                    row_data = []
                    is_header_row = len(table_buffer) == 0

                    for cell in cells:
                        formatted_cell = format_inline_markdown(cell)
                        current_style = (
                            style_cell_header if is_header_row else style_cell
                        )
                        row_data.append(Paragraph(formatted_cell, current_style))

                    table_buffer.append(row_data)
                continue

            else:
                if in_table and table_buffer:
                    col_count = max(len(row) for row in table_buffer)
                    if col_count > 0:
                        avail_width = A4[0] - 80
                        col_width = avail_width / col_count

                        t = Table(table_buffer, colWidths=[col_width] * col_count)
                        t.setStyle(
                            TableStyle(
                                [
                                    (
                                        "BACKGROUND",
                                        (0, 0),
                                        (-1, 0),
                                        colors.HexColor("#1a365d"),
                                    ),
                                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                                    (
                                        "ROWBACKGROUNDS",
                                        (0, 1),
                                        (-1, -1),
                                        [colors.white, colors.HexColor("#f8f9fa")],
                                    ),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                                    (
                                        "FONTNAME",
                                        (0, 0),
                                        (-1, -1),
                                        _legacy_module.FONT_NAME_REGULAR,
                                    ),
                                    (
                                        "FONTNAME",
                                        (0, 0),
                                        (-1, 0),
                                        _legacy_module.FONT_NAME_BOLD,
                                    ),
                                ]
                            )
                        )
                        story.append(t)
                        story.append(Spacer(1, 12))

                    table_buffer = []
                    in_table = False

            if not original_line:
                continue

            header_match = re.match(r"^(#{1,6})\s+(.*)", original_line)

            if header_match:
                level = len(header_match.group(1))
                raw_text = header_match.group(2)
                clean_text = format_inline_markdown(raw_text)

                if level == 1:
                    story.append(Paragraph(clean_text, style_heading_1))
                elif level == 2:
                    story.append(Paragraph(clean_text, style_heading_2))
                else:
                    story.append(Paragraph(clean_text, style_heading_3))

            elif re.match(r"^[IVX]+\.", original_line):
                formatted_text = format_inline_markdown(original_line)
                story.append(Paragraph(formatted_text, style_heading_1))

            elif re.match(r"^[A-Z]\.", original_line):
                formatted_text = format_inline_markdown(original_line)
                story.append(Paragraph(formatted_text, style_heading_2))

            elif original_line.startswith(("-", "*", "•")):
                clean_raw = re.sub(r"^[\-\*\•]\s*", "", original_line)
                formatted_text = format_inline_markdown(clean_raw)
                story.append(Paragraph(f"• {formatted_text}", style_bullet))

            else:
                formatted_text = format_inline_markdown(original_line)
                story.append(Paragraph(formatted_text, style_normal))

        if in_table and table_buffer:
            col_count = max(len(row) for row in table_buffer)
            avail_width = A4[0] - 80
            col_width = avail_width / col_count
            t = Table(table_buffer, colWidths=[col_width] * col_count)
            t.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a365d")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        (
                            "ROWBACKGROUNDS",
                            (0, 1),
                            (-1, -1),
                            [colors.white, colors.HexColor("#f8f9fa")],
                        ),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        (
                            "FONTNAME",
                            (0, 0),
                            (-1, -1),
                            _legacy_module.FONT_NAME_REGULAR,
                        ),
                        (
                            "FONTNAME",
                            (0, 0),
                            (-1, 0),
                            _legacy_module.FONT_NAME_BOLD,
                        ),
                    ]
                )
            )
            story.append(t)

        await run_in_threadpool(_legacy_module._build_reportlab_document, doc, story)
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="ozet.pdf"'},
        )

    except Exception as e:
        logger.error("Markdown to PDF failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/upload")
async def upload_pdf(
    request: Request,
    file: UploadFile = File(...),
    current_user: Optional[dict] = Depends(get_current_user_optional),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    db: Session = Depends(get_db),
):
    if not _legacy_module.check_rate_limit(
        request, "files:upload", settings.RATE_LIMIT_PER_MINUTE, 60, "default"
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")

    user_id = current_user.get("sub") if current_user else None

    if not user_id:
        user_id = x_guest_id or "guest"

    is_guest_user = str(user_id).startswith("guest")
    await _legacy_module.validate_file_size(file, is_guest=is_guest_user)

    try:
        pdf_content = await file.read()
        filename = file.filename or "document.pdf"

        if not is_guest_user:
            pdf_record = _legacy_module.save_pdf_to_db(
                db, user_id, pdf_content, filename
            )
            _legacy_module.stats_cache_delete_keys(
                _legacy_module._files_list_cache_key(str(user_id))
            )
            return {
                "file_id": pdf_record.id,
                "filename": pdf_record.filename or filename,
                "file_size": pdf_record.file_size,
            }

        return {"filename": filename, "message": "Guest upload - not saved to database"}

    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.get("/my-files")
async def get_my_files(
    current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        cache_key = _legacy_module._files_list_cache_key(str(user_id))
        cached = _legacy_module.stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            log_cache(
                "my_files_redis",
                cache_key,
                True,
                ttl=_legacy_module.FILES_LIST_CACHE_TTL_SEC,
                extra={"endpoint": "my_files"},
            )
            return cached
        log_cache(
            "my_files_redis",
            cache_key,
            False,
            ttl=_legacy_module.FILES_LIST_CACHE_TTL_SEC,
            extra={"endpoint": "my_files"},
        )

        pdfs = _legacy_module.list_user_pdfs(db, user_id)
        files = []
        for pdf in pdfs:
            files.append(
                {
                    "id": pdf.id,
                    "filename": pdf.filename,
                    "file_size": pdf.file_size,
                    "created_at": pdf.created_at.isoformat()
                    if pdf.created_at
                    else None,
                    "page_count": pdf.page_count,
                }
            )
        payload = {"files": files, "total": len(files)}
        _legacy_module.stats_cache_set_json(
            cache_key, payload, _legacy_module.FILES_LIST_CACHE_TTL_SEC
        )
        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get files error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        pdf = _legacy_module.get_pdf_from_db(db, file_id, user_id)
        if not pdf:
            raise HTTPException(
                status_code=404, detail="PDF bulunamadı veya yetkiniz yok"
            )

        _legacy_module.delete_pdf_from_db(db, file_id, user_id)
        _legacy_module.stats_cache_delete_keys(
            _legacy_module._files_list_cache_key(str(user_id))
        )
        return {"message": "Silindi", "file_id": file_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete file error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.get("/stored/{pdf_id}")
async def download_stored_pdf(
    pdf_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    pdf = _legacy_module.get_pdf_from_db(db, pdf_id, user_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF bulunamadı.")
    fn = pdf.filename or "document.pdf"
    return StreamingResponse(
        io.BytesIO(pdf.pdf_data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fn}"'},
    )


@router.post("/convert-text")
async def convert_text_from_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """PDF'den metin çıkarır."""
    logger.debug("--- CONVERT-TEXT İSTEĞİ ---")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF gerekli")

    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    logger.debug("Token çözüldü. User ID: %s", user_id)

    try:
        text = await run_in_threadpool(
            _legacy_module._extract_text_from_pdf_stream, file.file
        )

        base_filename = (
            file.filename.replace(".pdf", "") if file.filename else "document"
        )

        await _legacy_module.increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            io.BytesIO(text.encode("utf-8")),
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{base_filename}.txt"'
            },
        )
    except Exception as e:
        logger.error("Convert text failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/extract-pages")
async def extract_pdf_pages(
    request: Request,
    file: UploadFile = File(...),
    page_range: str = Form(...),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Sayfa ayıklama."""
    if not _legacy_module.check_rate_limit(
        request, "files:extract-pages", settings.RATE_LIMIT_PER_MINUTE, 60, "default"
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    logger.debug("EXTRACT-PAGES İSTEĞİ alındı")

    user_id = current_user.get("sub") if current_user else None
    if user_id:
        logger.debug(f"Token çözüldü. User ID: {user_id}")

    try:
        out = await run_in_threadpool(
            _legacy_module._extract_pages_to_buffer, file.file, page_range
        )

        if user_id:
            await _legacy_module.increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            out,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="extracted.pdf"'},
        )
    except Exception as e:
        logger.error(f"Extract pages hatası: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/merge-pdfs")
async def merge_pdfs(
    request: Request,
    files: List[UploadFile] = File(...),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """PDF Birleştirme."""
    if not _legacy_module.check_rate_limit(
        request, "files:merge-pdfs", settings.RATE_LIMIT_PER_MINUTE, 60, "default"
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    logger.debug("--- MERGE-PDFS İSTEĞİ ---")
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="En az 2 PDF gerekli.")

    user_id = current_user.get("sub") if current_user else None
    if user_id:
        logger.debug("Token çözüldü. User ID: %s", user_id)

    try:
        file_streams = [f.file for f in files]
        out = await run_in_threadpool(
            _legacy_module._merge_pdfs_to_buffer, file_streams
        )

        if user_id:
            await _legacy_module.increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            out,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="merged.pdf"'},
        )
    except Exception as e:
        logger.error("Merge PDFs failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/save-processed")
async def save_processed_pdf(
    file: UploadFile = File(...),
    filename: str = Form(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        pdf_content = await file.read()

        pdf_record = _legacy_module.save_pdf_to_db(db, user_id, pdf_content, filename)
        _legacy_module.stats_cache_delete_keys(
            _legacy_module._files_list_cache_key(str(user_id))
        )

        return {
            "file_id": pdf_record.id,
            "filename": pdf_record.filename or filename,
            "size_kb": round(pdf_record.file_size / 1024, 2)
            if pdf_record.file_size
            else 0,
            "message": "File saved successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Save processed error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/reorder")
async def reorder_pdf(
    file: UploadFile = File(...),
    page_numbers: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Sayfa Sıralama."""
    logger.debug("--- REORDER-PDF İSTEĞİ ---")

    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    logger.debug("Token çözüldü. User ID: %s", user_id)

    try:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Dosya boş veya okunamadı.")

        out = await run_in_threadpool(
            _legacy_module._reorder_pdf_to_buffer, file.file, page_numbers
        )

        out.seek(0, 2)
        pdf_size = out.tell()
        out.seek(0)

        if pdf_size == 0:
            raise HTTPException(status_code=500, detail="PDF oluşturulamadı.")

        await _legacy_module.increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            out,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="reordered.pdf"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Reorder PDF Error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )
