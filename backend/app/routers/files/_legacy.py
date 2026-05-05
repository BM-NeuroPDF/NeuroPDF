# app/routers/files.py
from fastapi import APIRouter, HTTPException, UploadFile
from typing import List, Optional
from pypdf import PdfReader, PdfWriter
import hashlib
import time
import io
import re
import os

from sqlalchemy.orm import Session
from sqlalchemy import text

from ...config import settings
from ...db import get_supabase, SessionLocal
from ...repositories.stats_repo import StatsRepository
from ...repositories.user_repo import UserRepository
from ...services.files.chat_service import normalize_message_metadata
from ...observability.cache_logger import log_cache
import logging

logger = logging.getLogger(__name__)
DB_UNAVAILABLE_DETAIL = "Database connection temporarily unavailable. Please try again."
SECURE_SERVER_ERROR_DETAIL = (
    "Sunucu tarafında beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin."
)
stats_repo = StatsRepository()
user_repo = UserRepository()
FILES_LIST_CACHE_TTL_SEC = 60
CHAT_SESSIONS_CACHE_TTL_SEC = 60
CHAT_MESSAGES_CACHE_TTL_SEC = 45


def _normalize_message_metadata(
    raw: object,
    *,
    fallback_content: str,
    fallback_language: str,
) -> dict:
    return normalize_message_metadata(
        raw,
        fallback_content=fallback_content,
        fallback_language=fallback_language,
    )


def _files_list_cache_key(user_id: str) -> str:
    return f"user:{user_id}:files:list:v1"


def _chat_sessions_cache_key(user_id: str) -> str:
    return f"user:{user_id}:chat:sessions:list:v1"


def _chat_messages_cache_key(user_id: str, session_db_id: str) -> str:
    return f"user:{user_id}:chat:session:{session_db_id}:messages:v1"


def _raise_db_unavailable(exc: Exception) -> None:
    logger.error("Database connection failure in files router: %s", exc, exc_info=True)
    raise HTTPException(status_code=503, detail=DB_UNAVAILABLE_DETAIL) from exc


# --- ReportLab (markdown-to-pdf worker + font kaydı; stiller routes_pdf_tools'ta) ---
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate

router = APIRouter()

# ==========================================
# FONT AYARLARI (Source Sans Pro)
# ==========================================

current_file_path = os.path.abspath(__file__)
routers_dir = os.path.dirname(current_file_path)
app_dir = os.path.dirname(routers_dir)
backend_dir = os.path.dirname(app_dir)
fonts_dir = os.path.join(backend_dir, "fonts", "Source_Sans_Pro")

regular_font_path = os.path.join(fonts_dir, "SourceSansPro-Regular.ttf")
bold_font_path = os.path.join(fonts_dir, "SourceSansPro-Bold.ttf")

FONT_NAME_REGULAR = "Helvetica"
FONT_NAME_BOLD = "Helvetica-Bold"

try:
    if os.path.exists(regular_font_path):
        pdfmetrics.registerFont(TTFont("SourceSansPro-Regular", regular_font_path))
        FONT_NAME_REGULAR = "SourceSansPro-Regular"
        logger.info(f"Normal Font Yüklendi: {regular_font_path}")

    if os.path.exists(bold_font_path):
        pdfmetrics.registerFont(TTFont("SourceSansPro-Bold", bold_font_path))
        FONT_NAME_BOLD = "SourceSansPro-Bold"
        logger.info(f"Kalın Font Yüklendi: {bold_font_path}")
    else:
        if FONT_NAME_REGULAR != "Helvetica":
            FONT_NAME_BOLD = FONT_NAME_REGULAR

except Exception as e:
    logger.warning(f"Font yükleme hatası: {e}", exc_info=True)


# ==========================================
# YARDIMCI FONKSİYONLAR
# ==========================================


async def validate_file_size(file: UploadFile, is_guest: bool):
    """Dosya boyutunu kontrol eder."""
    limit_mb = (
        settings.MAX_FILE_SIZE_GUEST_MB if is_guest else settings.MAX_FILE_SIZE_USER_MB
    )
    limit_bytes = limit_mb * 1024 * 1024

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > limit_bytes:
        user_type = "Misafir" if is_guest else "Kayıtlı Kullanıcı"
        raise HTTPException(
            status_code=413,
            detail=f"{user_type} limiti aşıldı! Maksimum {limit_mb} MB dosya yükleyebilirsiniz.",
        )


def get_ai_service_headers() -> dict:
    """AI Service'e yapılan istekler için header'ları hazırlar (API key dahil)."""
    headers = {}
    api_key = getattr(settings, "AI_SERVICE_API_KEY", None) or os.getenv(
        "AI_SERVICE_API_KEY", ""
    )
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


# --- GÜNCELLENMİŞ VE LOGLAYAN HELPER FONKSİYONU ---


async def increment_user_usage_task(user_id: str, operation_type: str) -> None:
    """
    İstatistik güncellemesi: USE_SUPABASE=true iken REST, değilken yeni DB oturumu.
    BackgroundTasks ile çağrıldığında güvenli (istek oturumu kapanmadan önce commit).
    """
    if not user_id or str(user_id).startswith("guest"):
        return
    if settings.USE_SUPABASE:
        sup = get_supabase()
        await stats_repo.increment_usage(
            user_id=user_id,
            operation_type=operation_type,
            db=None,
            supabase=sup,
        )
        return
    if SessionLocal is None:
        logger.error("increment_user_usage_task: SessionLocal is not configured")
        return
    db = SessionLocal()
    try:
        await stats_repo.increment_usage(
            user_id=user_id,
            operation_type=operation_type,
            db=db,
            supabase=None,
        )
    finally:
        db.close()


_LOCAL_ASYNC_SUMMARIZE_MSG = (
    "Async document flow requires USE_SUPABASE=true and the Supabase `documents` table. "
    "In local mode use POST /files/summarize (synchronous)."
)


def parse_page_ranges(range_str: str, max_pages: int) -> list[int]:
    """Sayfa aralığı stringini parse eder."""
    if not range_str:
        raise ValueError("Sayfa aralığı boş olamaz.")
    page_indices = set()
    parts = range_str.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if re.fullmatch(r"\d+", part):
            page_num = int(part)
            if 1 <= page_num <= max_pages:
                page_indices.add(page_num - 1)
        elif re.fullmatch(r"\d+-\d+", part):
            start_str, end_str = part.split("-")
            start, end = map(int, part.split("-"))
            for page_num in range(start, end + 1):
                if 1 <= page_num <= max_pages:
                    page_indices.add(page_num - 1)
    return sorted(list(page_indices))


def _extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        texts: list[str] = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                texts.append(page_text)
        return "\n".join(texts)
    except Exception as e:
        logger.warning("PDF text extract failed: %s", e, exc_info=True)
        return ""


def _extract_text_from_pdf_stream(file_obj) -> str:
    file_obj.seek(0)
    reader = PdfReader(file_obj)
    texts: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            texts.append(page_text)
    return "\n".join(texts)


def _extract_pages_to_buffer(file_obj, page_range: str) -> io.BytesIO:
    file_obj.seek(0)
    reader = PdfReader(file_obj)
    max_pages = len(reader.pages)
    indices = parse_page_ranges(page_range, max_pages)
    if not indices:
        raise HTTPException(status_code=400, detail="Geçersiz sayfa aralığı.")

    writer = PdfWriter()
    for idx in indices:
        writer.add_page(reader.pages[idx])

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return out


def _merge_pdfs_to_buffer(file_objects: List) -> io.BytesIO:
    writer = PdfWriter()
    for file_obj in file_objects:
        file_obj.seek(0)
        reader = PdfReader(file_obj)
        for page in reader.pages:
            writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return out


def _reorder_pdf_to_buffer(file_obj, page_numbers: str) -> io.BytesIO:
    file_obj.seek(0)
    reader = PdfReader(file_obj)
    if len(reader.pages) == 0:
        raise HTTPException(
            status_code=400, detail="PDF dosyası geçersiz veya sayfa içermiyor."
        )

    try:
        order = [int(x.strip()) - 1 for x in page_numbers.split(",") if x.strip()]
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="Sayfa numaraları geçersiz format."
        ) from exc

    if not order:
        raise HTTPException(status_code=400, detail="Sayfa numaraları boş.")
    if any(p < 0 or p >= len(reader.pages) for p in order):
        raise HTTPException(
            status_code=400,
            detail=f"Hatalı sayfa numarası. PDF'de {len(reader.pages)} sayfa var.",
        )

    writer = PdfWriter()
    for page_idx in order:
        writer.add_page(reader.pages[page_idx])

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return out


def _build_reportlab_document(doc: SimpleDocTemplate, story: list) -> None:
    doc.build(story)


# ==========================================
# PDF HASHLEME
# ==========================================
def generate_pdf_hash(pdf_bytes: bytes) -> str:
    """PDF içeriğini SHA-256 ile hashler."""
    sha256 = hashlib.sha256()
    sha256.update(pdf_bytes)
    return sha256.hexdigest()


async def check_summarize_cache(
    pdf_bytes: bytes, db: Session, llm_choice_id: int, user_id: Optional[str] = None
) -> Optional[str]:
    """PDF bytes'ından hash hesaplayarak cache kontrolü yapar."""
    pdf_hash = generate_pdf_hash(pdf_bytes)
    return await check_summarize_cache_by_hash(pdf_hash, db, llm_choice_id, user_id)


async def check_summarize_cache_by_hash(
    pdf_hash: str, db: Session, llm_choice_id: int, user_id: Optional[str] = None
) -> Optional[str]:
    """Hash'ten direkt cache kontrolü yapar (optimize edilmiş versiyon)."""
    t0 = time.perf_counter()
    cache_log_key = f"summary_cache|{pdf_hash}|{llm_choice_id}|{user_id or '-'}"

    # CLOUD → user_id dikkate alınmaz
    if llm_choice_id == 1:  # cloud llm
        query = text("""
            SELECT summary
            FROM summary_cache
            WHERE pdf_hash = :hash 
              AND llm_choice_id = :llm_choice_id
            LIMIT 1
        """)
        params = {"hash": pdf_hash, "llm_choice_id": llm_choice_id}
        cache_entry = db.execute(query, params).fetchone()

        if cache_entry:
            log_cache(
                "summary_cache",
                cache_log_key,
                True,
                extra={"llm_scope": "cloud"},
                latency_ms=(time.perf_counter() - t0) * 1000.0,
            )
            return cache_entry[0]

        log_cache(
            "summary_cache",
            cache_log_key,
            False,
            extra={"llm_scope": "cloud"},
            latency_ms=(time.perf_counter() - t0) * 1000.0,
        )
        return None

    # LOCAL → user_id dikkate alınır
    else:
        query = text("""
            SELECT summary
            FROM summary_cache
            WHERE pdf_hash = :hash 
              AND llm_choice_id = :llm_choice_id
              AND user_id = :user_id
            LIMIT 1
        """)
        params = {"hash": pdf_hash, "llm_choice_id": llm_choice_id, "user_id": user_id}
        cache_entry = db.execute(query, params).fetchone()

        if cache_entry:
            log_cache(
                "summary_cache",
                cache_log_key,
                True,
                extra={"llm_scope": "local"},
                latency_ms=(time.perf_counter() - t0) * 1000.0,
            )
            return cache_entry[0]

        log_cache(
            "summary_cache",
            cache_log_key,
            False,
            extra={"llm_scope": "local"},
            latency_ms=(time.perf_counter() - t0) * 1000.0,
        )
        return None


# ==========================================
# SUMMARIZE CACHE KAYDETME
# ==========================================
async def save_summarize_cache(
    pdf_bytes: bytes,
    summary: str,
    db: Session,
    llm_choice_id: int,
    user_id: Optional[str] = None,
):
    """PDF bytes'ından hash hesaplayarak cache kaydeder."""
    pdf_hash = generate_pdf_hash(pdf_bytes)
    await save_summarize_cache_by_hash(pdf_hash, summary, db, llm_choice_id, user_id)


async def save_summarize_cache_by_hash(
    pdf_hash: str,
    summary: str,
    db: Session,
    llm_choice_id: int,
    user_id: Optional[str] = None,
):
    """Hash'ten direkt cache kaydeder (optimize edilmiş versiyon)."""
    try:
        # Önce mevcut kaydı kontrol et
        if user_id:
            check_query = text("""
                SELECT id FROM summary_cache
                WHERE pdf_hash = :hash 
                  AND llm_choice_id = :llm_choice_id
                  AND user_id = :user_id
                LIMIT 1
            """)
            existing = db.execute(
                check_query,
                {"hash": pdf_hash, "llm_choice_id": llm_choice_id, "user_id": user_id},
            ).first()
        else:
            check_query = text("""
                SELECT id FROM summary_cache
                WHERE pdf_hash = :hash 
                  AND llm_choice_id = :llm_choice_id
                  AND user_id IS NULL
                LIMIT 1
            """)
            existing = db.execute(
                check_query, {"hash": pdf_hash, "llm_choice_id": llm_choice_id}
            ).first()

        if existing:
            # Güncelle
            if user_id:
                update_query = text("""
                    UPDATE summary_cache
                    SET summary = :summary, created_at = NOW()
                    WHERE pdf_hash = :hash 
                      AND llm_choice_id = :llm_choice_id
                      AND user_id = :user_id
                """)
                db.execute(
                    update_query,
                    {
                        "hash": pdf_hash,
                        "summary": summary,
                        "llm_choice_id": llm_choice_id,
                        "user_id": user_id,
                    },
                )
            else:
                update_query = text("""
                    UPDATE summary_cache
                    SET summary = :summary, created_at = NOW()
                    WHERE pdf_hash = :hash 
                      AND llm_choice_id = :llm_choice_id
                      AND user_id IS NULL
                """)
                db.execute(
                    update_query,
                    {
                        "hash": pdf_hash,
                        "summary": summary,
                        "llm_choice_id": llm_choice_id,
                    },
                )
        else:
            # Yeni kayıt ekle
            insert_query = text("""
                INSERT INTO summary_cache (pdf_hash, summary, llm_choice_id, user_id, created_at)
                VALUES (:hash, :summary, :llm_choice_id, :user_id, NOW())
            """)
            db.execute(
                insert_query,
                {
                    "hash": pdf_hash,
                    "summary": summary,
                    "llm_choice_id": llm_choice_id,
                    "user_id": user_id,
                },
            )

        db.commit()
        print(
            f"✅ Cache kaydedildi: Hash {pdf_hash}, LLM Choice ID {llm_choice_id}, User {user_id}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Cache kaydetme hatası: {e}", exc_info=True)
        # Hata olsa bile devam et, kritik değil


def save_summarize_cache_background(
    pdf_hash: str, summary: str, llm_choice_id: int, user_id: Optional[str] = None
):
    """Background task için sync versiyon - Yeni DB session oluşturur."""
    from ...db import SessionLocal

    db = SessionLocal()
    try:
        # Önce mevcut kaydı kontrol et
        if user_id:
            check_query = text("""
                SELECT id FROM summary_cache
                WHERE pdf_hash = :hash 
                  AND llm_choice_id = :llm_choice_id
                  AND user_id = :user_id
                LIMIT 1
            """)
            existing = db.execute(
                check_query,
                {"hash": pdf_hash, "llm_choice_id": llm_choice_id, "user_id": user_id},
            ).first()
        else:
            check_query = text("""
                SELECT id FROM summary_cache
                WHERE pdf_hash = :hash 
                  AND llm_choice_id = :llm_choice_id
                  AND user_id IS NULL
                LIMIT 1
            """)
            existing = db.execute(
                check_query, {"hash": pdf_hash, "llm_choice_id": llm_choice_id}
            ).first()

        if existing:
            # Güncelle
            if user_id:
                update_query = text("""
                    UPDATE summary_cache
                    SET summary = :summary, created_at = NOW()
                    WHERE pdf_hash = :hash 
                      AND llm_choice_id = :llm_choice_id
                      AND user_id = :user_id
                """)
                db.execute(
                    update_query,
                    {
                        "hash": pdf_hash,
                        "summary": summary,
                        "llm_choice_id": llm_choice_id,
                        "user_id": user_id,
                    },
                )
            else:
                update_query = text("""
                    UPDATE summary_cache
                    SET summary = :summary, created_at = NOW()
                    WHERE pdf_hash = :hash 
                      AND llm_choice_id = :llm_choice_id
                      AND user_id IS NULL
                """)
                db.execute(
                    update_query,
                    {
                        "hash": pdf_hash,
                        "summary": summary,
                        "llm_choice_id": llm_choice_id,
                    },
                )
        else:
            # Yeni kayıt ekle
            insert_query = text("""
                INSERT INTO summary_cache (pdf_hash, summary, llm_choice_id, user_id, created_at)
                VALUES (:hash, :summary, :llm_choice_id, :user_id, NOW())
            """)
            db.execute(
                insert_query,
                {
                    "hash": pdf_hash,
                    "summary": summary,
                    "llm_choice_id": llm_choice_id,
                    "user_id": user_id,
                },
            )

        db.commit()
        print(
            f"✅ Cache kaydedildi (background): Hash {pdf_hash}, LLM Choice ID {llm_choice_id}, User {user_id}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Cache kaydetme hatası (background): {e}", exc_info=True)
        # Hata olsa bile devam et, kritik değil
    finally:
        db.close()


# ==========================================
# USER LLM CHOICE ID ALMA
# ==========================================
def get_user_llm_choice(db: Session, user_id: str):
    query = text("""
        SELECT llm_choice_id 
        FROM users
        WHERE id = :user_id
        LIMIT 1
    """)
    result = db.execute(query, {"user_id": user_id}).fetchone()

    llm_choice_id = result[0] if result else 0  # default local llm

    # LLM adını çek
    query2 = text("""
        SELECT name
        FROM llm_choices
        WHERE id = :id
        LIMIT 1
    """)
    result2 = db.execute(query2, {"id": llm_choice_id}).fetchone()

    llm_name = result2[0] if result2 else "local"

    return llm_choice_id, llm_name
