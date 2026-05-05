# app/routers/files.py
from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    HTTPException,
    Depends,
    Body,
    Request,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pypdf import PdfReader, PdfWriter
import asyncio
import httpx
import hashlib
import time
import io
import json
import re
import os

# jwt import removed - using get_current_user dependency instead
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, PendingRollbackError

# --- Config & DB ---
from ...config import settings
from ...db import get_supabase, Client, get_db, SessionLocal
from ...storage import (
    get_pdf_from_db,
    save_pdf_to_db,
)
from ...chat_session_storage import (
    create_pdf_chat_session_record,
    append_chat_turn,
    truncate_context_text,
    list_user_chat_sessions,
    get_session_messages_ordered,
    history_for_ai_restore,
    get_chat_session_by_db_id,
)

# ✅ DÜZELTİLDİ: auth.py'den import edildi ve eski fonksiyon kaldırıldı
from ...deps import get_current_user
from ...repositories.stats_repo import StatsRepository
from ...repositories.user_repo import UserRepository
from ...services.files.chat_service import normalize_message_metadata
from ...observability.cache_logger import log_cache
from ...redis_client import (
    stats_cache_delete_keys,
    stats_cache_get_json,
    stats_cache_set_json,
)
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

router = APIRouter(tags=["files"])

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


# ==========================================
# CHAT Start
# ==========================================


@router.post("/chat/start-from-text")
async def start_chat_from_text(
    request: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    PDF text'ini direkt kullanarak chat session başlatır (dosya yüklemeden).
    Body: { "pdf_text": "...", "filename": "...", "llm_provider": "cloud|local" }
    """
    pdf_text = body.get("pdf_text")
    filename = body.get("filename", "document.pdf")

    try:
        # Kullanıcının LLM tercihini DB'den al (öncelik DB'deki tercih)
        user_id = current_user.get("sub")
        if db and user_id:
            try:
                llm_provider = await user_repo.get_llm_provider(
                    user_id=user_id,
                    db=db,
                    supabase=None,
                )
            except Exception as e:
                print(f"⚠️ LLM provider alınamadı, default kullanılıyor: {e}")
                llm_provider = "local"
        else:
            # Guest kullanıcılar için default local
            llm_provider = "local"
        print(f"📊 Kullanıcı LLM Tercihi (DB'den): {llm_provider}")

        # Mode belirleme: cloud ise pro, local ise flash (mode parametresi local için geçersiz)
        mode = body.get("mode", "pro" if llm_provider == "cloud" else "flash")
        if llm_provider == "local":
            mode = "flash"  # Local LLM için mode parametresi kullanılmaz ama tutarlılık için

        # Opsiyonel: istemciden gelen pdf_id (kullanıcıya ait olmalı) — extract tool için
        pdf_id_meta: str | None = None
        owned = None
        raw_pid = body.get("pdf_id")
        if raw_pid and user_id and db:
            owned = get_pdf_from_db(db, str(raw_pid), user_id)
            if not owned:
                raise HTTPException(
                    status_code=404, detail="PDF bulunamadı veya erişim yok."
                )
            pdf_id_meta = owned.id
            if not filename and getattr(owned, "filename", None):
                filename = owned.filename

        # İstemci text göndermediyse ve pdf_id verildiyse, metni DB'den üret.
        normalized_pdf_text = (pdf_text or "").strip()
        if not normalized_pdf_text and owned and owned.pdf_data:
            normalized_pdf_text = (
                await run_in_threadpool(_extract_text_from_pdf_bytes, owned.pdf_data)
            ).strip()
        if not normalized_pdf_text:
            raise HTTPException(status_code=400, detail="PDF text gereklidir.")

        # AI Service'e PDF text'ini gönder
        client = request.app.state.ai_http_client
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/start-from-text"
        payload = {
            "pdf_text": normalized_pdf_text,
            "filename": filename,
            "llm_provider": llm_provider,  # DB'den gelen değeri kullan (body override yok)
            "mode": mode,
        }
        if pdf_id_meta and user_id:
            payload["pdf_id"] = pdf_id_meta
            payload["user_id"] = user_id
        headers = get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=60.0
        )

        if response.status_code != 200:
            print(f"❌ AI Service Hatası: {response.text}")
            raise HTTPException(
                status_code=502, detail="Yapay zeka servisi başlatılamadı."
            )

        data = response.json()
        print(f"✅ Chat Oturumu Başladı (Text'ten): {data['session_id']}")

        out: dict = {"session_id": data["session_id"], "filename": filename}
        if pdf_id_meta:
            out["pdf_id"] = pdf_id_meta
        if user_id and db:
            ctx = None if pdf_id_meta else truncate_context_text(normalized_pdf_text)
            db_row = create_pdf_chat_session_record(
                db,
                user_id=user_id,
                ai_session_id=data["session_id"],
                filename=filename,
                llm_provider=llm_provider,
                mode=mode,
                pdf_id=pdf_id_meta,
                context_text=ctx,
            )
            out["db_session_id"] = db_row.id
            stats_cache_delete_keys(_chat_sessions_cache_key(str(user_id)))
        return out

    except (OperationalError, PendingRollbackError) as e:
        _raise_db_unavailable(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat Start From Text Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/chat/start")  # 👈 {file_id} kaldırıldı
async def start_chat_session(
    request: Request,
    file: UploadFile = File(...),  # 👈 Direkt dosyayı alıyoruz
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    language: str = Form("tr"),
):
    """
    PDF'i veritabanına kaydeder, metnini çıkarır ve AI Service sohbet oturumunu
    pdf_id / user_id ile başlatır (sayfa ayıklama aracı için).

    Legacy not (Supabase kodunu kaybetmemek için):
    Aşağıdaki eski akış tamamen silinmedi, yorumda korunuyor:
    # files = {"file": (file.filename, file_content, "application/pdf")}
    # target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/start"
    # params = {"llm_provider": llm_provider}
    # response = await client.post(target_url, files=files, params=params, headers=headers, timeout=60.0)
    """
    print(f"\n--- CHAT START (Dosya: {file.filename}) ---")

    # 1. Dosya geçerlilik kontrolü
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Sadece PDF dosyaları kabul edilir."
        )

    try:
        # 2. Dosyayı belleğe oku
        file_content = await file.read()

        # 3. Kullanıcının LLM tercihini DB'den al
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Oturum gerekli.")
        llm_provider = await user_repo.get_llm_provider(
            user_id=user_id,
            db=db,
            supabase=None,
        )
        mode = "pro" if llm_provider == "cloud" else "flash"
        print(f"📊 Kullanıcı LLM Tercihi: {llm_provider}")

        async def _extract_text_safe() -> str:
            try:
                return await run_in_threadpool(
                    _extract_text_from_pdf_bytes, file_content
                )
            except Exception as e:
                logger.warning(
                    "Chat start PDF text extract failed: %s", e, exc_info=True
                )
                return ""

        pdf_row, pdf_text = await asyncio.gather(
            run_in_threadpool(save_pdf_to_db, db, user_id, file_content, file.filename),
            _extract_text_safe(),
        )

        client = request.app.state.ai_http_client
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/start-from-text"
        payload = {
            "pdf_text": pdf_text or " ",
            "filename": file.filename,
            "llm_provider": llm_provider,
            "mode": mode,
            "pdf_id": pdf_row.id,
            "user_id": user_id,
            "language": language,
        }
        headers = get_ai_service_headers()
        print(
            f"📡 AI Service (start-from-text): {target_url} (llm_provider: {llm_provider})"
        )
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=60.0
        )

        if response.status_code != 200:
            print(f"❌ AI Service Hatası: {response.text}")
            raise HTTPException(
                status_code=502, detail="Yapay zeka servisi başlatılamadı."
            )

        data = response.json()
        print(f"✅ Chat Oturumu Başladı: {data['session_id']} (pdf_id={pdf_row.id})")

        db_row = create_pdf_chat_session_record(
            db,
            user_id=user_id,
            ai_session_id=data["session_id"],
            filename=file.filename or "document.pdf",
            llm_provider=llm_provider,
            mode=mode,
            pdf_id=pdf_row.id,
            context_text=None,
        )
        stats_cache_delete_keys(_chat_sessions_cache_key(str(user_id)))

        return {
            "session_id": data["session_id"],
            "filename": file.filename,
            "pdf_id": pdf_row.id,
            "db_session_id": db_row.id,
        }

    except (OperationalError, PendingRollbackError) as e:
        _raise_db_unavailable(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat start failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


# ==========================================
# CHAT Message
# ==========================================
@router.post("/chat/message")
async def send_chat_message(
    request: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Kullanıcının mesajını AI Service'e iletir.
    Body: { "session_id": "...", "message": "..." }
    """
    session_id = body.get("session_id")
    message = body.get("message")
    language = body.get("language", "tr")

    if not session_id or not message:
        raise HTTPException(status_code=400, detail="Session ID ve mesaj gereklidir.")

    try:
        # AI Service'e ilet (/chat)
        client = request.app.state.ai_http_client
        payload = {
            "session_id": session_id,
            "message": message,
            "language": language,
        }
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat"
        headers = get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=240.0
        )

        if response.status_code != 200:
            # Response'u parse etmeyi dene
            try:
                error_detail = response.json().get("detail", "AI hatası")
            except Exception:
                error_detail = (
                    response.text or f"AI Service hatası: {response.status_code}"
                )

            print(f"❌ AI Service Hatası ({response.status_code}): {error_detail}")

            # Gemini quota/rate limit hatası için daha kullanıcı dostu mesaj
            if response.status_code == 429:
                error_lower = error_detail.lower()
                if (
                    "quota" in error_lower
                    or "gemini" in error_lower
                    or "rate limit" in error_lower
                ):
                    # Quota aşıldıysa Local LLM öner
                    if "quota" in error_lower and "exceeded" in error_lower:
                        raise HTTPException(
                            status_code=429,
                            detail="Gemini API günlük kotası aşıldı. Lütfen profil sayfasından Local LLM'e geçin veya yarın tekrar deneyin.",
                        )
                    else:
                        # Rate limit (çok fazla istek) - kısa süre bekle
                        raise HTTPException(
                            status_code=429,
                            detail="Gemini API çok yoğun. Lütfen birkaç dakika sonra tekrar deneyin veya Local LLM kullanmayı deneyin.",
                        )
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        result = response.json()
        user_id = current_user.get("sub")
        if user_id and isinstance(result, dict) and result.get("answer"):
            try:
                user_meta = _normalize_message_metadata(
                    body.get("message_payload"),
                    fallback_content=str(message),
                    fallback_language=language,
                )
                assistant_meta = _normalize_message_metadata(
                    body.get("assistant_message_payload"),
                    fallback_content=str(result["answer"]),
                    fallback_language=language,
                )
                append_chat_turn(
                    db,
                    ai_session_id=session_id,
                    user_id=user_id,
                    user_message=message,
                    assistant_message=str(result["answer"]),
                    user_metadata=user_meta,
                    assistant_metadata=assistant_meta,
                )
                stats_cache_delete_keys(
                    _chat_messages_cache_key(str(user_id), str(session_id)),
                    _chat_sessions_cache_key(str(user_id)),
                )
            except Exception as persist_err:
                logger.warning(
                    "Chat mesajı kalıcı kayıt atlandı: %s",
                    persist_err,
                    exc_info=True,
                )
        return result

    except httpx.ReadTimeout:
        raise HTTPException(
            status_code=504,
            detail="AI yanıtı zaman aşımına uğradı. Lütfen tekrar deneyin veya Local LLM kullanın.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat message failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/chat/message/stream")
async def send_chat_message_stream(
    request: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    session_id = body.get("session_id")
    message = body.get("message")
    language = body.get("language", "tr")
    if not session_id or not message:
        raise HTTPException(status_code=400, detail="Session ID ve mesaj gereklidir.")

    payload = {"session_id": session_id, "message": message, "language": language}
    target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/stream"
    headers = get_ai_service_headers()

    async def _iter_sse():
        async with httpx.AsyncClient(timeout=240.0) as stream_client:
            async with stream_client.stream(
                "POST", target_url, json=payload, headers=headers
            ) as upstream:
                if upstream.status_code != 200:
                    detail = await upstream.aread()
                    payload_err = detail.decode("utf-8", errors="ignore")
                    yield f"data: {json.dumps({'type': 'error', 'detail': payload_err})}\n\n".encode()
                    return
                async for line in upstream.aiter_lines():
                    if await request.is_disconnected():
                        await upstream.aclose()
                        break
                    if line is None:
                        continue
                    yield f"{line}\n".encode("utf-8")

    return StreamingResponse(
        _iter_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==========================================
# PDF CHAT GEÇMİŞİ (sessions / messages / resume)
# ==========================================


@router.get("/chat/sessions")
async def list_pdf_chat_sessions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Oturum gerekli.")
        cache_key = _chat_sessions_cache_key(str(user_id))
        cached = stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            log_cache(
                "chat_sessions_redis",
                cache_key,
                True,
                ttl=CHAT_SESSIONS_CACHE_TTL_SEC,
                extra={"endpoint": "chat_sessions"},
            )
            return cached
        log_cache(
            "chat_sessions_redis",
            cache_key,
            False,
            ttl=CHAT_SESSIONS_CACHE_TTL_SEC,
            extra={"endpoint": "chat_sessions"},
        )
        rows = list_user_chat_sessions(db, user_id)
        payload = {
            "sessions": [
                {
                    "id": r.id,
                    "session_id": r.ai_session_id,
                    "pdf_name": r.filename,
                    "title": r.filename,
                    "pdf_id": r.pdf_id,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
                for r in rows
            ]
        }
        stats_cache_set_json(cache_key, payload, CHAT_SESSIONS_CACHE_TTL_SEC)
        return payload
    except (OperationalError, PendingRollbackError) as e:
        _raise_db_unavailable(e)


@router.get("/chat/sessions/{session_db_id}/messages")
async def get_pdf_chat_session_messages(
    session_db_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Oturum gerekli.")
        cache_key = _chat_messages_cache_key(str(user_id), session_db_id)
        cached = stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            log_cache(
                "chat_messages_redis",
                cache_key,
                True,
                ttl=CHAT_MESSAGES_CACHE_TTL_SEC,
                extra={"endpoint": "chat_session_messages"},
            )
            return cached
        log_cache(
            "chat_messages_redis",
            cache_key,
            False,
            ttl=CHAT_MESSAGES_CACHE_TTL_SEC,
            extra={"endpoint": "chat_session_messages"},
        )

        if isinstance(db, Session):
            bind = db.get_bind()

            def _session_row() -> object:
                sm = sessionmaker(bind=bind, expire_on_commit=False)
                s = sm()
                try:
                    return get_chat_session_by_db_id(s, session_db_id, user_id)
                finally:
                    s.close()

            def _session_messages() -> list:
                sm = sessionmaker(bind=bind, expire_on_commit=False)
                s = sm()
                try:
                    return get_session_messages_ordered(s, session_db_id, user_id)
                finally:
                    s.close()

            session, msgs = await asyncio.gather(
                run_in_threadpool(_session_row),
                run_in_threadpool(_session_messages),
            )
        else:
            session = get_chat_session_by_db_id(db, session_db_id, user_id)
            msgs = get_session_messages_ordered(db, session_db_id, user_id)

        if not session:
            raise HTTPException(status_code=404, detail="Oturum bulunamadı.")
        payload = {
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "id": (m.metadata_json or {}).get("id"),
                    "sourceLanguage": (m.metadata_json or {}).get("sourceLanguage"),
                    "translations": (m.metadata_json or {}).get("translations"),
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ],
        }
        stats_cache_set_json(cache_key, payload, CHAT_MESSAGES_CACHE_TTL_SEC)
        return payload
    except (OperationalError, PendingRollbackError) as e:
        _raise_db_unavailable(e)


@router.post("/chat/sessions/{session_db_id}/resume")
async def resume_pdf_chat_session(
    request: Request,
    session_db_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Oturum gerekli.")
        session = get_chat_session_by_db_id(db, session_db_id, user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Oturum bulunamadı.")

        pdf_text = ""
        if session.pdf_id:
            pdf_row = get_pdf_from_db(db, session.pdf_id, user_id)
            if pdf_row:
                pdf_text = await run_in_threadpool(
                    _extract_text_from_pdf_bytes, pdf_row.pdf_data
                )
        if not pdf_text.strip() and session.context_text:
            pdf_text = session.context_text or ""
        if not pdf_text.strip():
            raise HTTPException(
                status_code=410,
                detail="Bu oturum için PDF metni artık kullanılamıyor. Belge silinmiş veya metin saklanmamış olabilir.",
            )

        msgs = get_session_messages_ordered(db, session_db_id, user_id)
        history = history_for_ai_restore(msgs)

        payload = {
            "session_id": session.ai_session_id,
            "pdf_text": pdf_text,
            "filename": session.filename,
            "history": history,
            "llm_provider": session.llm_provider,
            "mode": session.mode,
            "pdf_id": session.pdf_id,
            "user_id": user_id,
        }

        client = request.app.state.ai_http_client
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/restore-session"
        headers = get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=60.0
        )
        if response.status_code != 200:
            detail = response.text
            try:
                detail = response.json().get("detail", detail)
            except Exception:
                pass
            raise HTTPException(
                status_code=502, detail=f"AI oturum yükleme hatası: {detail}"
            )
    except (OperationalError, PendingRollbackError) as e:
        _raise_db_unavailable(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("resume chat session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)

    return {
        "session_id": session.ai_session_id,
        "pdf_id": session.pdf_id,
        "db_session_id": session.id,
        "filename": session.filename,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "id": (m.metadata_json or {}).get("id"),
                "sourceLanguage": (m.metadata_json or {}).get("sourceLanguage"),
                "translations": (m.metadata_json or {}).get("translations"),
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ],
    }


# ==========================================
# GENEL CHAT (Pro Kullanıcılar İçin - PDF Gerektirmez)
# ==========================================


@router.post("/chat/general/start")
async def start_general_chat(
    request: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    """
    Pro kullanıcılar için genel AI chat oturumu başlatır (PDF gerektirmez).
    Body: { "llm_provider": "cloud" (opsiyonel), "mode": "flash" (opsiyonel) }
    """
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Kullanıcı kimliği bulunamadı.")

    is_pro, llm_provider = await user_repo.get_user_role_and_llm_provider(
        user_id=user_id,
        db=db,
        supabase=supabase if settings.USE_SUPABASE else None,
    )
    if not is_pro:
        raise HTTPException(
            status_code=403,
            detail="Bu özellik sadece Pro kullanıcılar için kullanılabilir.",
        )

    try:
        if not db:
            llm_provider = body.get("llm_provider", llm_provider)
        print(f"📊 Genel Chat - Kullanıcı LLM Tercihi (DB'den): {llm_provider}")

        # Mode belirleme: cloud ise flash/pro, local ise flash (mode parametresi local için geçersiz)
        mode = body.get("mode", "flash")
        if llm_provider == "local":
            mode = "flash"  # Local LLM için mode parametresi kullanılmaz ama tutarlılık için

        # AI Service'e ilet (query parameters olarak gönder)
        client = request.app.state.ai_http_client
        params = {"llm_provider": llm_provider, "mode": mode}
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/general/start"
        headers = get_ai_service_headers()
        response = await client.post(
            target_url, params=params, headers=headers, timeout=60.0
        )

        if response.status_code != 200:
            error_detail = response.json().get("detail", "AI hatası")
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        return response.json()  # {"session_id": "..."}

    except httpx.TimeoutException:
        logger.error(
            "AI Service timeout - genel chat start endpoint yanıt vermiyor",
            exc_info=True,
        )
        raise HTTPException(
            status_code=504,
            detail="AI servisi yanıt vermiyor. Lütfen daha sonra tekrar deneyin.",
        )
    except httpx.HTTPStatusError as e:
        logger.error(
            f"AI Service HTTP error: {e.response.status_code} - {e.response.text}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"AI servisi hatası: {e.response.text}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Genel Chat Start Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/chat/general/message")
async def send_general_chat_message(
    request: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    """
    Pro kullanıcılar için genel AI chat mesajı gönderir (PDF gerektirmez).
    Body: { "session_id": "...", "message": "..." }
    """
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Kullanıcı kimliği bulunamadı.")

    is_pro, _llm_unused = await user_repo.get_user_role_and_llm_provider(
        user_id=user_id,
        db=db,
        supabase=supabase if settings.USE_SUPABASE else None,
    )
    if not is_pro:
        raise HTTPException(
            status_code=403,
            detail="Bu özellik sadece Pro kullanıcılar için kullanılabilir.",
        )

    session_id = body.get("session_id")
    message = body.get("message")
    language = body.get("language", "tr")

    if not session_id or not message:
        raise HTTPException(status_code=400, detail="Session ID ve mesaj gereklidir.")

    try:
        # AI Service'e ilet
        client = request.app.state.ai_http_client
        payload = {
            "session_id": session_id,
            "message": message,
            "language": language,
        }
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/general"
        headers = get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=240.0
        )

        if response.status_code != 200:
            error_detail = response.json().get("detail", "AI hatası")
            # Gemini quota/rate limit hatası için daha kullanıcı dostu mesaj
            if response.status_code == 429:
                error_lower = error_detail.lower()
                if (
                    "quota" in error_lower
                    or "gemini" in error_lower
                    or "rate limit" in error_lower
                ):
                    # Quota aşıldıysa Local LLM öner
                    if "quota" in error_lower and "exceeded" in error_lower:
                        raise HTTPException(
                            status_code=429,
                            detail="Gemini API günlük kotası aşıldı. Lütfen profil sayfasından Local LLM'e geçin veya yarın tekrar deneyin.",
                        )
                    else:
                        # Rate limit (çok fazla istek) - kısa süre bekle
                        raise HTTPException(
                            status_code=429,
                            detail="Gemini API çok yoğun. Lütfen birkaç dakika sonra tekrar deneyin veya Local LLM kullanmayı deneyin.",
                        )
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        return (
            response.json()
        )  # {"answer": "...", "llm_provider": "...", "mode": "..."}

    except httpx.ReadTimeout:
        raise HTTPException(
            status_code=504,
            detail="AI yanıtı zaman aşımına uğradı. Lütfen tekrar deneyin veya Local LLM kullanın.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("General chat message failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/chat/translate-message")
async def translate_chat_message(
    request: Request,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    """
    Chat mesajını hedef dile çevirir (UI cache için stateless yardımcı endpoint).
    Body: { "text": "...", "source_language": "tr|en", "target_language": "tr|en" }
    """
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Kullanıcı kimliği bulunamadı.")

    is_pro, llm_provider = await user_repo.get_user_role_and_llm_provider(
        user_id=user_id,
        db=db,
        supabase=supabase if settings.USE_SUPABASE else None,
    )
    if not is_pro:
        raise HTTPException(
            status_code=403,
            detail="Bu özellik sadece Pro kullanıcılar için kullanılabilir.",
        )

    text_value = str(body.get("text") or "").strip()
    source_language = str(body.get("source_language") or "tr").lower()
    target_language = str(body.get("target_language") or "tr").lower()

    if not text_value:
        raise HTTPException(status_code=400, detail="Çevrilecek metin gereklidir.")
    if source_language not in {"tr", "en"} or target_language not in {"tr", "en"}:
        raise HTTPException(
            status_code=400, detail="Sadece 'tr' ve 'en' dilleri desteklenir."
        )
    if source_language == target_language:
        return {"translation": text_value}

    mode = str(body.get("mode") or "flash")
    if llm_provider == "local":
        mode = "flash"

    try:
        client = request.app.state.ai_http_client
        payload = {
            "text": text_value,
            "source_language": source_language,
            "target_language": target_language,
            "llm_provider": llm_provider,
            "mode": mode,
        }
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/translate-text"
        headers = get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=120.0
        )
        if response.status_code != 200:
            detail = response.json().get("detail", "Çeviri başarısız.")
            raise HTTPException(status_code=response.status_code, detail=detail)
        return response.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("translate-message failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)
