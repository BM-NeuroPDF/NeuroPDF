# app/routers/files.py
from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    HTTPException,
    Depends,
    Header,
    Body,
    BackgroundTasks,
    Query,
    Request,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pypdf import PdfReader, PdfWriter
from pydantic import BaseModel
import asyncio
import httpx
import hashlib
import html
import io
import re
import os
import uuid

# jwt import removed - using get_current_user dependency instead
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, PendingRollbackError

# --- Config & DB ---
from ..config import settings
from ..db import get_supabase, Client, get_db, SessionLocal
from ..storage import (
    save_pdf_to_db,
    get_pdf_from_db,
    delete_pdf_from_db,
    list_user_pdfs,
)
from ..chat_session_storage import (
    create_pdf_chat_session_record,
    append_chat_turn,
    truncate_context_text,
    list_user_chat_sessions,
    get_session_messages_ordered,
    history_for_ai_restore,
    get_chat_session_by_db_id,
)

# ✅ DÜZELTİLDİ: auth.py'den import edildi ve eski fonksiyon kaldırıldı
from ..deps import get_current_user, get_current_user_optional
from ..models import UserStatsResponse, User
from ..repositories.stats_repo import StatsRepository
from ..repositories.user_repo import UserRepository
from ..rate_limit import check_rate_limit
from ..redis_client import (
    GLOBAL_STATS_CACHE_KEY,
    GLOBAL_STATS_CACHE_TTL_SEC,
    USER_STATS_CACHE_TTL_SEC,
    stats_cache_get_json,
    stats_cache_set_json,
    user_stats_cache_key,
)
import logging

logger = logging.getLogger(__name__)
DB_UNAVAILABLE_DETAIL = "Database connection temporarily unavailable. Please try again."
SECURE_SERVER_ERROR_DETAIL = (
    "Sunucu tarafında beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin."
)
stats_repo = StatsRepository()
user_repo = UserRepository()


def _normalize_message_metadata(
    raw: object,
    *,
    fallback_content: str,
    fallback_language: str,
) -> dict:
    metadata: dict = raw.copy() if isinstance(raw, dict) else {}
    message_id = str(metadata.get("id") or uuid.uuid4())
    source_language = str(
        metadata.get("sourceLanguage")
        or metadata.get("source_language")
        or fallback_language
        or "tr"
    ).lower()
    translations_raw = metadata.get("translations")
    translations = translations_raw if isinstance(translations_raw, dict) else {}
    if not translations.get(source_language):
        translations[source_language] = fallback_content
    metadata["id"] = message_id
    metadata["sourceLanguage"] = source_language
    metadata["translations"] = translations
    return metadata


def _raise_db_unavailable(exc: Exception) -> None:
    logger.error("Database connection failure in files router: %s", exc, exc_info=True)
    raise HTTPException(status_code=503, detail=DB_UNAVAILABLE_DETAIL) from exc


# --- ReportLab Importları (PDF Oluşturma İçin) ---
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

router = APIRouter(prefix="/files", tags=["files"])

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


# ==========================================
# USER SETTINGS (LLM CHOICE) - EKSİK OLAN KISIM
# ==========================================


class UpdateLlmChoiceRequest(BaseModel):
    provider: str  # "local" veya "cloud"


@router.get("/user/llm-choice")
async def get_llm_choice(
    current_user: dict = Depends(get_current_user),
    db: Optional[Session] = Depends(get_db),
):
    """
    Kullanıcının mevcut LLM tercihini döndürür.
    """
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if db is None:
            # DB bağlantısı yoksa default değeri döndür
            logger.warning(
                "Database connection unavailable, returning default LLM choice"
            )
            return {"provider": "local", "choice_id": 0}

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            # Kullanıcı bulunamazsa default değeri döndür
            return {"provider": "local", "choice_id": 0}

        # llm_choice_id: 0 = local llm, 1 = cloud llm (llm_choices seed migration)
        choice_id = getattr(user, "llm_choice_id", 0)
        provider = "cloud" if choice_id == 1 else "local"

        return {"provider": provider, "choice_id": choice_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM choice get error: {e}", exc_info=True)
        # Hata durumunda default değeri döndür
        return {"provider": "local", "choice_id": 0}


@router.post("/user/update-llm")
async def update_llm_choice(
    req: UpdateLlmChoiceRequest,
    current_user: dict = Depends(get_current_user),
    db: Optional[Session] = Depends(get_db),
):
    """
    Kullanıcının varsayılan LLM tercihini günceller.
    provider: 'local' -> 0
    provider: 'cloud' -> 1
    """
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if db is None:
            raise HTTPException(
                status_code=503,
                detail="Veritabanı bağlantısı şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
            )

        # Provider string'ini ID'ye çevir (llm_choices: 0=local, 1=cloud)
        choice_id = 1 if req.provider == "cloud" else 0

        # Kullanıcıyı bul ve güncelle
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.llm_choice_id = choice_id
        db.commit()

        return {"status": "success", "provider": req.provider, "choice_id": choice_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM update error: {e}", exc_info=True)
        if db:
            db.rollback()
        raise HTTPException(status_code=500, detail="Tercih güncellenemedi")


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
# SUMMARIZE GENEL
# ==========================================
@router.post("/summarize")
async def summarize_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    language: str = Query("tr"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    print("\n--- SUMMARIZE İSTEĞİ ---")

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Sadece PDF dosyaları kabul edilir."
        )

    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    print(f"✅ Token Çözüldü. User ID: {user_id}")

    await validate_file_size(file, is_guest=False)

    try:
        file_content = await file.read()

        # ==========================================
        # PDF HASH (Bir kez hesapla, tekrar kullan)
        # ==========================================
        pdf_hash = generate_pdf_hash(file_content)
        print(f"🔑 PDF Hash: {pdf_hash}")

        # ==========================================
        # LLM SEÇİMİ
        # ==========================================
        if db is None:
            # DB bağlantısı yoksa default değerleri kullan
            llm_choice_id = 0
            provider_string = "local"
        else:
            llm_choice_id, provider_string = get_user_llm_choice(db, user_id)

        # ==========================================
        # CACHE KONTROLÜ (Hash'i tekrar hesaplamadan kullan)
        # ==========================================
        cached_summary = None
        if db is not None:
            cached_summary = await check_summarize_cache_by_hash(
                pdf_hash, db, llm_choice_id=llm_choice_id, user_id=user_id
            )

        if cached_summary:
            # Cache'den özet geldiğinde PDF text'ini extract et
            try:
                pdf_text = await run_in_threadpool(
                    _extract_text_from_pdf_bytes, file_content
                )
            except Exception as e:
                logger.warning(
                    "Cached summary PDF text extraction failed: %s", e, exc_info=True
                )
                pdf_text = None

            return {
                "status": "success",
                "summary": cached_summary,
                "pdf_text": pdf_text,  # PDF text'ini de döndür (chat için)
                "pdf_hash": pdf_hash,
                "pdf_blob": None,
                "cached": True,
            }

        # ==========================================
        # AI SERVİS ÇAĞRISI
        # ==========================================
        files = {"file": ("upload.pdf", file_content, "application/pdf")}
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"

        print(
            f"📡 AI Service İstek: {ai_service_url} (llm_provider: {provider_string})"
        )

        # Local LLM için daha uzun timeout (gemma2:9b tek adımda ~7 dk sürebilir)
        timeout_duration = 600.0 if provider_string == "local" else 120.0
        client = request.app.state.ai_http_client
        headers = get_ai_service_headers()
        params = {
            "llm_provider": provider_string,
            "pdf_hash": pdf_hash,
            "language": language,
        }
        response = await client.post(
            ai_service_url,
            files=files,
            params=params,
            headers=headers,
            timeout=timeout_duration,
        )

        if response.status_code != 200:
            print(f"❌ AI Service Error: {response.text}")
            raise HTTPException(
                status_code=response.status_code, detail="AI Servisi hatası"
            )

        result = response.json()

        # ✅ OPTİMİZASYON: Kullanıcı istatistikleri ve cache kaydetme arka planda yapılsın
        # Response'u hemen döndür, kullanıcıyı bekletme

        # Kullanıcı istatistiklerini arka planda güncelle (non-blocking)
        background_tasks.add_task(increment_user_usage_task, user_id, "summary")

        # Cache'i arka planda kaydet (non-blocking)
        # Not: DB session'ı background task'ta kullanmak için yeni session oluşturulmalı
        if db is not None:
            summary_text = result.get("summary")
            # DB session'ı background task'ta kullanmak için yeni session oluştur
            background_tasks.add_task(
                save_summarize_cache_background,
                pdf_hash,
                summary_text,
                llm_choice_id,
                user_id,
            )

        # ✅ Response'u hemen döndür (kullanıcı bekletilmez)
        return {
            "status": "success",
            "summary": result.get("summary"),
            "pdf_text": result.get("pdf_text"),  # PDF text'ini de döndür (chat için)
            "pdf_hash": pdf_hash,
            "pdf_blob": None,
            "cached": False,
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="İşlem çok uzun sürdü.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Summarize endpoint failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


# ==========================================
# ÖZETLEME (MİSAFİR İÇİN)
# ==========================================


@router.post("/summarize-guest")
async def summarize_for_guest(
    request: Request,
    file: UploadFile = File(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    language: str = Query("tr"),
):
    """Misafir kullanıcılar için ANLIK özetleme."""
    if not check_rate_limit(
        request, "files:summarize-guest", settings.RATE_LIMIT_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir")

    await validate_file_size(file, is_guest=True)

    try:
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"
        file_content = await file.read()

        # Misafir kullanıcılar için default: local (KVKK için güvenli)
        llm_provider = "local"

        client = request.app.state.ai_http_client
        files = {"file": (file.filename, file_content, "application/pdf")}
        headers = get_ai_service_headers()
        params = {"llm_provider": llm_provider, "language": language}
        response = await client.post(
            ai_service_url,
            files=files,
            params=params,
            headers=headers,
            timeout=60.0,
        )
        response.raise_for_status()

        result = response.json()

        return {
            "status": "completed",
            "summary": result.get("summary"),
            "filename": file.filename,
            "method": "guest",
        }

    except Exception as e:
        logger.error(f"Özetleme hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/summarize-start/{file_id}")
async def trigger_summarize_task(
    request: Request,
    file_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
    language: str = Query("tr"),
):
    """Asenkron özetleme görevi başlatır."""
    print("\n--- SUMMARIZE-START İSTEĞİ ---")
    try:
        if not settings.USE_SUPABASE:
            raise HTTPException(status_code=501, detail=_LOCAL_ASYNC_SUMMARIZE_MSG)

        user_id = current_user.get("sub")
        print(f"✅ Token Çözüldü. User ID: {user_id}")

        response = (
            supabase.table("documents").select("*").eq("id", file_id).single().execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")

        file_data = response.data
        if file_data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Erişim yetkiniz yok")

        # Kullanıcının LLM tercihini DB'den al
        llm_provider = await user_repo.get_llm_provider(
            user_id=user_id,
            db=db,
            supabase=None,
        )

        supabase.table("documents").update({"status": "processing"}).eq(
            "id", file_id
        ).execute()

        callback_url = f"http://backend:8000/files/callback/{file_id}"
        task_data = {
            "pdf_id": file_id,
            "storage_path": file_data["storage_path"],
            "callback_url": callback_url,
            "llm_provider": llm_provider,
            "language": language,
        }

        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-async"

        client = request.app.state.ai_http_client
        headers = get_ai_service_headers()
        response = await client.post(
            ai_service_url, json=task_data, headers=headers, timeout=10
        )
        response.raise_for_status()

        # İSTATİSTİK (Async olduğu için burada sayıyoruz)
        await increment_user_usage_task(user_id, "summary")

        return {
            "status": "processing",
            "message": "Özetleme başlatıldı",
            "file_id": file_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Summarize task trigger failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


# ==========================================
# ASENKRON CALLBACK & SORGULAMA
# ==========================================


class SummaryCallbackData(BaseModel):
    pdf_id: int
    status: str
    summary: Optional[str] = None
    error: Optional[str] = None


@router.post("/callback/{pdf_id}")
async def handle_ai_callback(
    pdf_id: int, data: SummaryCallbackData, supabase: Client = Depends(get_supabase)
):
    if not settings.USE_SUPABASE:
        raise HTTPException(status_code=501, detail=_LOCAL_ASYNC_SUMMARIZE_MSG)

    if pdf_id != data.pdf_id:
        raise HTTPException(status_code=400, detail="ID mismatch")

    print(f"✅ Callback alındı: PDF ID {pdf_id}, Durum: {data.status}")

    try:
        update_data = {
            "status": data.status,
            "summary": data.summary if data.status == "completed" else None,
            "error": data.error if data.status == "failed" else None,
        }
        supabase.table("documents").update(update_data).eq("id", pdf_id).execute()
        return {"status": "callback_received"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("AI callback handling failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.get("/summary/{file_id}")
async def get_file_summary(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    if not settings.USE_SUPABASE:
        raise HTTPException(status_code=501, detail=_LOCAL_ASYNC_SUMMARIZE_MSG)

    try:
        user_id = current_user.get("sub")
        response = (
            supabase.table("documents").select("*").eq("id", file_id).single().execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")

        if response.data.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Yetkisiz erişim")

        return response.data

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Get file summary failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


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
            print(
                f"✅ Cloud Cache bulundu: Hash {pdf_hash}, LLM Choice ID {llm_choice_id}"
            )
            return cache_entry[0]

        print(
            f"⚠️ Cloud Cache bulunamadı: Hash {pdf_hash}, LLM Choice ID {llm_choice_id}"
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
            print(
                f"✅ Local Cache bulundu: Hash {pdf_hash}, LLM Choice ID {llm_choice_id}, User {user_id}"
            )
            return cache_entry[0]

        print(
            f"⚠️ Local Cache bulunamadı: Hash {pdf_hash}, LLM Choice ID {llm_choice_id}, User {user_id}"
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
    from ..db import SessionLocal

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
        rows = list_user_chat_sessions(db, user_id)
        return {
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
        return {
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


@router.get("/stored/{pdf_id}")
async def download_stored_pdf(
    pdf_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    pdf = get_pdf_from_db(db, pdf_id, user_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF bulunamadı.")
    fn = pdf.filename or "document.pdf"
    return StreamingResponse(
        io.BytesIO(pdf.pdf_data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fn}"'},
    )


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


# ==========================================
# MARKDOWN TO PDF (GELİŞMİŞ FORMATLAMA - TABLO DESTEKLİ)
# ==========================================

# ==========================================
# MARKDOWN TO PDF (Source Sans Pro Entegreli)
# ==========================================


class MarkdownToPdfRequest(BaseModel):
    markdown: str


@router.post("/markdown-to-pdf")
async def markdown_to_pdf(request: MarkdownToPdfRequest):
    try:
        buffer = io.BytesIO()
        # Kenar boşlukları
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40,
        )
        styles = getSampleStyleSheet()

        # --- 1. Stil Tanımları ---

        # DÜZELTME: Buradaki manuel "Helvetica" atamaları kaldırıldı.
        # Artık dosyanın en başındaki global FONT_NAME_REGULAR değişkenini kullanıyor.

        # Normal Metin
        style_normal = ParagraphStyle(
            "TrNormal",
            parent=styles["Normal"],
            fontName=FONT_NAME_REGULAR,  # <--- SourceSansPro buradan gelecek
            fontSize=10,
            leading=14,
            spaceAfter=6,
        )

        # Başlık 1 (#) - Koyu Lacivert
        style_heading_1 = ParagraphStyle(
            "TrHeading1",
            parent=styles["Heading1"],
            fontName=FONT_NAME_BOLD,  # <--- SourceSansPro-Bold
            fontSize=16,
            leading=20,
            spaceAfter=12,
            spaceBefore=12,
            textColor=colors.HexColor("#1a365d"),
        )

        # Başlık 2 (##) - Koyu Gri/Mavi
        style_heading_2 = ParagraphStyle(
            "TrHeading2",
            parent=styles["Heading2"],
            fontName=FONT_NAME_BOLD,
            fontSize=13,
            leading=16,
            spaceAfter=10,
            spaceBefore=6,
            textColor=colors.HexColor("#2c3e50"),
        )

        # Başlık 3 (### ve sonrası) - Daha küçük gri başlık
        style_heading_3 = ParagraphStyle(
            "TrHeading3",
            parent=styles["Heading3"],
            fontName=FONT_NAME_BOLD,
            fontSize=11,
            leading=14,
            spaceAfter=8,
            spaceBefore=4,
            textColor=colors.HexColor("#34495e"),
        )

        # Liste Maddesi
        style_bullet = ParagraphStyle(
            "TrBullet",
            parent=style_normal,
            leftIndent=20,
            bulletIndent=10,
            spaceAfter=4,
        )

        # Tablo Hücresi
        style_cell = ParagraphStyle(
            "TableCell",
            parent=style_normal,
            fontName=FONT_NAME_REGULAR,  # Tablo içi
            fontSize=9,
            leading=11,
            spaceAfter=0,
        )

        # Tablo Başlık Hücresi
        style_cell_header = ParagraphStyle(
            "TableCellHeader",
            parent=style_normal,
            fontName=FONT_NAME_BOLD,  # Tablo başlığı
            fontSize=9,
            leading=11,
            textColor=colors.white,
            spaceAfter=0,
        )

        story = []
        lines = request.markdown.split("\n")

        # --- 2. Yardımcı Fonksiyon: Inline Markdown ---
        def format_inline_markdown(text):
            if not text:
                return ""
            # HTML karakterlerini bozmamak için escape et
            text = html.escape(text)

            # Emojiler (ReportLab çökmelerini engellemek için BMP dışındaki unicode'ları temizle)
            # Standart metin ve basit sembolleri korur, yeni nesil emojileri siler.
            text = "".join(c for c in text if ord(c) < 0xFFFF)

            # Kod aralıklarını geçici olarak sakla (İçi Markdown etkilemesin)
            codes = []

            def code_repl(m):
                codes.append(m.group(1))
                return f"__CODE_BLOCK_{len(codes) - 1}__"

            text = re.sub(r"`(.*?)`", code_repl, text)

            # Bold: **text** -> <b>text</b>
            text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", text)

            # Italic: *text* -> <i>text</i>
            text = re.sub(r"\*(.*?)\*", r"<i>\1</i>", text)

            # Saklanan kod aralıklarını geri yerleştir
            for i, c in enumerate(codes):
                text = text.replace(
                    f"__CODE_BLOCK_{i}__",
                    f'<font face="Courier" color="#e74c3c">{c}</font>',
                )

            return text

        # --- 3. Ana İşleme Döngüsü ---
        table_buffer = []
        in_table = False

        for line in lines:
            original_line = line.strip()

            # --- A) TABLO İŞLEME ---
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
                                    # Tablo Fontları
                                    ("FONTNAME", (0, 0), (-1, -1), FONT_NAME_REGULAR),
                                    ("FONTNAME", (0, 0), (-1, 0), FONT_NAME_BOLD),
                                ]
                            )
                        )
                        story.append(t)
                        story.append(Spacer(1, 12))

                    table_buffer = []
                    in_table = False

            if not original_line:
                continue

            # --- B) METİN VE BAŞLIK İŞLEME ---

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

        # --- C) DOSYA SONU KONTROLÜ ---
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
                        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME_REGULAR),
                        ("FONTNAME", (0, 0), (-1, 0), FONT_NAME_BOLD),
                    ]
                )
            )
            story.append(t)

        await run_in_threadpool(_build_reportlab_document, doc, story)
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="ozet.pdf"'},
        )

    except Exception as e:
        logger.error("Markdown to PDF failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


class TTSRequest(BaseModel):
    text: str


def clean_markdown_for_tts(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[*`_~]", "", text)
    text = re.sub(r"#{1,6}\s*", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^\s*[-+*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"-{2,}", "", text)
    text = re.sub(r"\n+", ". ", text)
    return text.strip()


@router.post("/listen-summary")
async def listen_summary(
    request: TTSRequest,
    current_user: dict = Depends(get_current_user),
):
    print("\n--- LISTEN (TTS) İSTEĞİ ---")
    if not request.text:
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    # USER ID ÇÖZÜMLEME
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    print(f"✅ Token Çözüldü. User ID: {user_id}")

    cleaned_text = clean_markdown_for_tts(request.text)
    ai_tts_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/tts"

    async def iter_audio():
        client = None
        try:
            client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
            headers = get_ai_service_headers()
            async with client.stream(
                "POST", ai_tts_url, json={"text": cleaned_text}, headers=headers
            ) as response:
                if response.status_code != 200:
                    return
                async for chunk in response.aiter_bytes():
                    yield chunk
        except Exception as e:
            print(f"TTS Error: {e}")
        finally:
            if client:
                # İSTATİSTİK GÜNCELLEME
                if user_id:
                    await increment_user_usage_task(user_id, "summary")
                await client.aclose()

    return StreamingResponse(iter_audio(), media_type="audio/mpeg")


# ==========================================
# FILE OPERATIONS (Upload, Delete, List)
# ==========================================


@router.post("/upload")
async def upload_pdf(
    request: Request,
    file: UploadFile = File(...),
    current_user: Optional[dict] = Depends(get_current_user_optional),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(
        request, "files:upload", settings.RATE_LIMIT_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")

    user_id = current_user.get("sub") if current_user else None

    if not user_id:
        user_id = x_guest_id or "guest"

    is_guest_user = str(user_id).startswith("guest")
    await validate_file_size(file, is_guest=is_guest_user)

    try:
        # PDF'i oku
        pdf_content = await file.read()
        filename = file.filename or "document.pdf"

        # Sadece kayıtlı kullanıcılar için DB'ye kaydet
        if not is_guest_user:
            pdf_record = save_pdf_to_db(db, user_id, pdf_content, filename)
            return {
                "file_id": pdf_record.id,
                "filename": pdf_record.filename or filename,
                "file_size": pdf_record.file_size,
            }

        # Misafir kullanıcılar için sadece filename döndür (DB'ye kaydetmiyoruz)
        return {"filename": filename, "message": "Guest upload - not saved to database"}

    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.get("/my-files")
async def get_my_files(
    current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        pdfs = list_user_pdfs(db, user_id)
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
        return {"files": files, "total": len(files)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get files error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


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

        # Önce PDF'in kullanıcıya ait olduğunu kontrol et
        pdf = get_pdf_from_db(db, file_id, user_id)
        if not pdf:
            raise HTTPException(
                status_code=404, detail="PDF bulunamadı veya yetkiniz yok"
            )

        # PDF'i sil
        delete_pdf_from_db(db, file_id, user_id)
        return {"message": "Silindi", "file_id": file_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete file error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


# ==========================================
# TOOLS (Convert, Extract, Merge, Reorder)
# ==========================================


@router.post("/convert-text")
async def convert_text_from_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """PDF'den metin çıkarır."""
    print("\n--- CONVERT-TEXT İSTEĞİ ---")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF gerekli")

    # USER ID ÇÖZÜMLEME
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    print(f"✅ Token Çözüldü. User ID: {user_id}")

    try:
        text = await run_in_threadpool(_extract_text_from_pdf_stream, file.file)

        base_filename = (
            file.filename.replace(".pdf", "") if file.filename else "document"
        )

        # İSTATİSTİK
        await increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            io.BytesIO(text.encode("utf-8")),
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{base_filename}.txt"'
            },
        )
    except Exception as e:
        logger.error("Convert text failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/extract-pages")
async def extract_pdf_pages(
    request: Request,
    file: UploadFile = File(...),
    page_range: str = Form(...),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Sayfa ayıklama."""
    if not check_rate_limit(
        request, "files:extract-pages", settings.RATE_LIMIT_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    logger.debug("EXTRACT-PAGES İSTEĞİ alındı")

    # USER ID ÇÖZÜMLEME
    user_id = current_user.get("sub") if current_user else None
    if user_id:
        logger.debug(f"Token çözüldü. User ID: {user_id}")

    try:
        out = await run_in_threadpool(_extract_pages_to_buffer, file.file, page_range)

        # İSTATİSTİK
        if user_id:
            await increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            out,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="extracted.pdf"'},
        )
    except Exception as e:
        logger.error(f"Extract pages hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/merge-pdfs")
async def merge_pdfs(
    request: Request,
    files: List[UploadFile] = File(...),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """PDF Birleştirme."""
    if not check_rate_limit(
        request, "files:merge-pdfs", settings.RATE_LIMIT_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    print("\n--- MERGE-PDFS İSTEĞİ ---")
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="En az 2 PDF gerekli.")

    # USER ID ÇÖZÜMLEME
    user_id = current_user.get("sub") if current_user else None
    if user_id:
        print(f"✅ Token Çözüldü. User ID: {user_id}")

    try:
        file_streams = [f.file for f in files]
        out = await run_in_threadpool(_merge_pdfs_to_buffer, file_streams)

        # İSTATİSTİK
        if user_id:
            await increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            out,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="merged.pdf"'},
        )
    except Exception as e:
        logger.error("Merge PDFs failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


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

        # PDF'i oku
        pdf_content = await file.read()

        # DB'ye kaydet
        pdf_record = save_pdf_to_db(db, user_id, pdf_content, filename)

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
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


@router.post("/reorder")
async def reorder_pdf(
    file: UploadFile = File(...),
    page_numbers: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Sayfa Sıralama."""
    print("\n--- REORDER-PDF İSTEĞİ ---")

    # USER ID ÇÖZÜMLEME
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    print(f"✅ Token Çözüldü. User ID: {user_id}")

    try:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Dosya boş veya okunamadı.")

        out = await run_in_threadpool(_reorder_pdf_to_buffer, file.file, page_numbers)

        # Dosya boyutunu kontrol et (seek(0, 2) ile dosyanın sonuna git)
        out.seek(0, 2)  # End of file
        pdf_size = out.tell()
        out.seek(0)  # Başa dön

        if pdf_size == 0:
            raise HTTPException(status_code=500, detail="PDF oluşturulamadı.")

        # İSTATİSTİK
        await increment_user_usage_task(user_id, "tool")

        return StreamingResponse(
            out,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="reordered.pdf"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Reorder PDF Error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=SECURE_SERVER_ERROR_DETAIL)


# ==========================================
# USER STATS (GET)
# ==========================================


@router.get("/user/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    """Giriş yapmış kullanıcının istatistiklerini ve rolünü (Standart, Pro, Admin) getirir."""
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        cache_key = user_stats_cache_key(user_id)
        cached = stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            try:
                logger.info(
                    "user_stats cache hit user_id=%s key=%s",
                    user_id,
                    cache_key,
                )
                return UserStatsResponse(
                    summary_count=int(cached.get("summary_count", 0)),
                    tools_count=int(cached.get("tools_count", 0)),
                    role=str(cached.get("role", "Standart")),
                )
            except Exception:
                logger.debug("user_stats cache parse failed, refetching", exc_info=True)

        user_stats = await stats_repo.get_user_stats(
            user_id=user_id,
            db=db,
            supabase=supabase,
        )

        # Veritabanındaki rol adını frontend'e uygun formata çevir
        role_name_lower = (
            user_stats.role_name_db.lower() if user_stats.role_name_db else ""
        )
        if "pro" in role_name_lower:
            role_name = "Pro"
        elif "admin" in role_name_lower:
            role_name = "Admin"
        else:
            role_name = "Standart"

        body = UserStatsResponse(
            summary_count=user_stats.summary_count,
            tools_count=user_stats.tools_count,
            role=role_name,  # Admin, Pro veya Standart dönecek
        )
        stats_cache_set_json(
            cache_key,
            {
                "summary_count": body.summary_count,
                "tools_count": body.tools_count,
                "role": body.role,
            },
            USER_STATS_CACHE_TTL_SEC,
        )
        return body

    except Exception as e:
        print(f"❌ İstatistik hatası: {str(e)}")
        # Genel hatada frontend bozulmasın
        return UserStatsResponse(summary_count=0, tools_count=0, role="Standart")


# ==========================================
# GLOBAL STATS (LANDING PAGE)
# ==========================================


@router.get("/global-stats")
async def get_global_stats(
    supabase: Client = Depends(get_supabase), db: Session = Depends(get_db)
):
    """
    Ana sayfa için tüm kullanıcıların toplam istatistiklerini döner.
    Auth gerektirmez (Public).
    """
    try:
        cached = stats_cache_get_json(GLOBAL_STATS_CACHE_KEY)
        if cached is not None and isinstance(cached, dict):
            logger.info("global_stats cache hit key=%s", GLOBAL_STATS_CACHE_KEY)
            return {
                "total_users": int(cached.get("total_users", 0)),
                "total_processed": int(cached.get("total_processed", 0)),
                "total_ai_summaries": int(cached.get("total_ai_summaries", 0)),
            }

        global_stats = await stats_repo.get_global_stats(db=db, supabase=supabase)

        payload = {
            "total_users": global_stats.total_users,
            "total_processed": global_stats.total_processed,
            "total_ai_summaries": global_stats.total_ai_summaries,
        }
        stats_cache_set_json(
            GLOBAL_STATS_CACHE_KEY, payload, GLOBAL_STATS_CACHE_TTL_SEC
        )
        return payload

    except Exception as e:
        print(f"❌ Global stats error: {str(e)}")
        # Hata olsa bile frontend bozulmasın diye 0 dön
        return {"total_users": 0, "total_processed": 0, "total_ai_summaries": 0}
