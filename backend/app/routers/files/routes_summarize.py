"""Summarize, async callback, summary fetch, and TTS routes under /files."""

import json
import logging
import re
from typing import Optional

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...callback_security import verify_callback_signature
from ...config import settings
from ...db import Client, get_db, get_supabase
from ...deps import get_current_user
from ...rate_limit import check_rate_limit

from . import _legacy as _legacy_module

logger = logging.getLogger(__name__)
router = APIRouter(tags=["files"])


class SummaryCallbackData(BaseModel):
    pdf_id: int
    status: str
    summary: Optional[str] = None
    error: Optional[str] = None


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


@router.post("/summarize")
async def summarize_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    language: str = Query("tr"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    logger.debug("--- SUMMARIZE İSTEĞİ ---")

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Sadece PDF dosyaları kabul edilir."
        )

    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    logger.debug("Token çözüldü. User ID: %s", user_id)

    await _legacy_module.validate_file_size(file, is_guest=False)

    try:
        file_content = await file.read()

        pdf_hash = _legacy_module.generate_pdf_hash(file_content)
        logger.debug("PDF Hash: %s", pdf_hash)

        if db is None:
            llm_choice_id = 0
            provider_string = "local"
        else:
            llm_choice_id, provider_string = _legacy_module.get_user_llm_choice(
                db, user_id
            )

        cached_summary = None
        if db is not None:
            cached_summary = await _legacy_module.check_summarize_cache_by_hash(
                pdf_hash, db, llm_choice_id=llm_choice_id, user_id=user_id
            )

        if cached_summary:
            try:
                pdf_text = await run_in_threadpool(
                    _legacy_module._extract_text_from_pdf_bytes, file_content
                )
            except Exception as e:
                logger.warning(
                    "Cached summary PDF text extraction failed: %s", e, exc_info=True
                )
                pdf_text = None

            return {
                "status": "success",
                "summary": cached_summary,
                "pdf_text": pdf_text,
                "pdf_hash": pdf_hash,
                "pdf_blob": None,
                "cached": True,
            }

        files = {"file": ("upload.pdf", file_content, "application/pdf")}
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"

        logger.debug(
            "AI Service istek: %s (llm_provider: %s)", ai_service_url, provider_string
        )

        timeout_duration = 600.0 if provider_string == "local" else 120.0
        client = request.app.state.ai_http_client
        headers = _legacy_module.get_ai_service_headers()
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
            logger.error("AI Service error: %s", response.text)
            raise HTTPException(
                status_code=response.status_code, detail="AI Servisi hatası"
            )

        result = response.json()

        background_tasks.add_task(
            _legacy_module.increment_user_usage_task, user_id, "summary"
        )

        if db is not None:
            summary_text = result.get("summary")
            background_tasks.add_task(
                _legacy_module.save_summarize_cache_background,
                pdf_hash,
                summary_text,
                llm_choice_id,
                user_id,
            )

        return {
            "status": "success",
            "summary": result.get("summary"),
            "pdf_text": result.get("pdf_text"),
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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/summarize-guest")
async def summarize_for_guest(
    request: Request,
    file: UploadFile = File(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    language: str = Query("tr"),
):
    """Misafir kullanıcılar için ANLIK özetleme."""
    from app.routers.files import PUBLIC_LIMITS

    for rule in PUBLIC_LIMITS.get("summarize_guest", []):
        if not check_rate_limit(
            request, rule.key, rule.limit, rule.window_seconds, rule.category
        ):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(rule.window_seconds)},
            )

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir")

    await _legacy_module.validate_file_size(file, is_guest=True)

    try:
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"
        file_content = await file.read()

        llm_provider = "local"

        client = request.app.state.ai_http_client
        files = {"file": (file.filename, file_content, "application/pdf")}
        headers = _legacy_module.get_ai_service_headers()
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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/summarize/stream")
async def summarize_file_stream(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    language: str = Query("tr"),
):
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Sadece PDF dosyaları kabul edilir."
        )
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    await _legacy_module.validate_file_size(file, is_guest=False)
    file_content = await file.read()
    llm_choice_id, provider_string = (
        _legacy_module.get_user_llm_choice(db, user_id) if db else (0, "local")
    )
    ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync/stream"
    headers = _legacy_module.get_ai_service_headers()
    params = {"llm_provider": provider_string, "language": language}
    files = {"file": ("upload.pdf", file_content, "application/pdf")}
    timeout_duration = 600.0 if provider_string == "local" else 120.0

    async def _iter_sse():
        async with httpx.AsyncClient(timeout=timeout_duration) as stream_client:
            async with stream_client.stream(
                "POST",
                ai_service_url,
                headers=headers,
                params=params,
                files=files,
            ) as upstream:
                if upstream.status_code != 200:
                    detail = await upstream.aread()
                    payload = detail.decode("utf-8", errors="ignore")
                    yield f"data: {json.dumps({'type': 'error', 'detail': payload})}\n\n".encode()
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
    logger.debug("--- SUMMARIZE-START İSTEĞİ ---")
    try:
        if not settings.USE_SUPABASE:
            raise HTTPException(
                status_code=501, detail=_legacy_module._LOCAL_ASYNC_SUMMARIZE_MSG
            )

        user_id = current_user.get("sub")
        logger.debug("Token çözüldü. User ID: %s", user_id)

        response = (
            supabase.table("documents").select("*").eq("id", file_id).single().execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")

        file_data = response.data
        if file_data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Erişim yetkiniz yok")

        llm_provider = await _legacy_module.user_repo.get_llm_provider(
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
        headers = _legacy_module.get_ai_service_headers()
        response = await client.post(
            ai_service_url, json=task_data, headers=headers, timeout=10
        )
        response.raise_for_status()

        await _legacy_module.increment_user_usage_task(user_id, "summary")

        return {
            "status": "processing",
            "message": "Özetleme başlatıldı",
            "file_id": file_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Summarize task trigger failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/callback/{pdf_id}")
async def handle_ai_callback(
    request: Request,
    pdf_id: int,
    data: SummaryCallbackData,
    supabase: Client = Depends(get_supabase),
    _verified: None = Depends(verify_callback_signature),
):
    from app.routers.files import PUBLIC_LIMITS

    for rule in PUBLIC_LIMITS.get("callback", []):
        if not check_rate_limit(
            request, rule.key, rule.limit, rule.window_seconds, rule.category
        ):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(rule.window_seconds)},
            )
    if not settings.USE_SUPABASE:
        raise HTTPException(
            status_code=501, detail=_legacy_module._LOCAL_ASYNC_SUMMARIZE_MSG
        )

    if pdf_id != data.pdf_id:
        raise HTTPException(status_code=400, detail="ID mismatch")

    logger.debug("Callback alındı: PDF ID %s, Durum: %s", pdf_id, data.status)

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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.get("/summary/{file_id}")
async def get_file_summary(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    if not settings.USE_SUPABASE:
        raise HTTPException(
            status_code=501, detail=_legacy_module._LOCAL_ASYNC_SUMMARIZE_MSG
        )

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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/listen-summary")
async def listen_summary(
    request: TTSRequest,
    current_user: dict = Depends(get_current_user),
):
    logger.debug("--- LISTEN (TTS) İSTEĞİ ---")
    if not request.text:
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Oturum gerekli.")
    logger.debug("Token çözüldü. User ID: %s", user_id)

    cleaned_text = clean_markdown_for_tts(request.text)
    ai_tts_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/tts"

    async def iter_audio():
        client = None
        try:
            client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
            headers = _legacy_module.get_ai_service_headers()
            async with client.stream(
                "POST", ai_tts_url, json={"text": cleaned_text}, headers=headers
            ) as response:
                if response.status_code != 200:
                    return
                async for chunk in response.aiter_bytes():
                    yield chunk
        except Exception as e:
            logger.error("TTS error: %s", e, exc_info=True)
        finally:
            if client:
                if user_id:
                    await _legacy_module.increment_user_usage_task(user_id, "summary")
                await client.aclose()

    return StreamingResponse(iter_audio(), media_type="audio/mpeg")
