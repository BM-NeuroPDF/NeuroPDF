"""PDF and general chat routes under /files/chat."""

import asyncio
import json
import logging

import httpx
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import OperationalError, PendingRollbackError
from sqlalchemy.orm import Session, sessionmaker

from ...chat_session_storage import (
    append_chat_turn,
    create_pdf_chat_session_record,
    get_chat_session_by_db_id,
    get_session_messages_ordered,
    history_for_ai_restore,
    list_user_chat_sessions,
    truncate_context_text,
)
from ...config import settings
from ...db import Client, get_db, get_supabase
from ...deps import get_current_user
from ...observability.cache_logger import log_cache
from ...storage import get_pdf_from_db, save_pdf_to_db

from . import _legacy as _legacy_module

logger = logging.getLogger(__name__)
router = APIRouter(tags=["files"])


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
        user_id = current_user.get("sub")
        if db and user_id:
            try:
                llm_provider = await _legacy_module.user_repo.get_llm_provider(
                    user_id=user_id,
                    db=db,
                    supabase=None,
                )
            except Exception as e:
                print(f"⚠️ LLM provider alınamadı, default kullanılıyor: {e}")
                llm_provider = "local"
        else:
            llm_provider = "local"
        print(f"📊 Kullanıcı LLM Tercihi (DB'den): {llm_provider}")

        mode = body.get("mode", "pro" if llm_provider == "cloud" else "flash")
        if llm_provider == "local":
            mode = "flash"

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

        normalized_pdf_text = (pdf_text or "").strip()
        if not normalized_pdf_text and owned and owned.pdf_data:
            normalized_pdf_text = (
                await run_in_threadpool(
                    _legacy_module._extract_text_from_pdf_bytes, owned.pdf_data
                )
            ).strip()
        if not normalized_pdf_text:
            raise HTTPException(status_code=400, detail="PDF text gereklidir.")

        client = request.app.state.ai_http_client
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/start-from-text"
        payload = {
            "pdf_text": normalized_pdf_text,
            "filename": filename,
            "llm_provider": llm_provider,
            "mode": mode,
        }
        if pdf_id_meta and user_id:
            payload["pdf_id"] = pdf_id_meta
            payload["user_id"] = user_id
        headers = _legacy_module.get_ai_service_headers()
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
            _legacy_module.stats_cache_delete_keys(
                _legacy_module._chat_sessions_cache_key(str(user_id))
            )
        return out

    except (OperationalError, PendingRollbackError) as e:
        _legacy_module._raise_db_unavailable(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat Start From Text Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/chat/start")
async def start_chat_session(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    language: str = Form("tr"),
):
    """
    PDF'i veritabanına kaydeder, metnini çıkarır ve AI Service sohbet oturumunu
    pdf_id / user_id ile başlatır (sayfa ayıklama aracı için).
    """
    print(f"\n--- CHAT START (Dosya: {file.filename}) ---")

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Sadece PDF dosyaları kabul edilir."
        )

    try:
        file_content = await file.read()

        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Oturum gerekli.")
        llm_provider = await _legacy_module.user_repo.get_llm_provider(
            user_id=user_id,
            db=db,
            supabase=None,
        )
        mode = "pro" if llm_provider == "cloud" else "flash"
        print(f"📊 Kullanıcı LLM Tercihi: {llm_provider}")

        async def _extract_text_safe() -> str:
            try:
                return await run_in_threadpool(
                    _legacy_module._extract_text_from_pdf_bytes, file_content
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
        headers = _legacy_module.get_ai_service_headers()
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
        _legacy_module.stats_cache_delete_keys(
            _legacy_module._chat_sessions_cache_key(str(user_id))
        )

        return {
            "session_id": data["session_id"],
            "filename": file.filename,
            "pdf_id": pdf_row.id,
            "db_session_id": db_row.id,
        }

    except (OperationalError, PendingRollbackError) as e:
        _legacy_module._raise_db_unavailable(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat start failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


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
        client = request.app.state.ai_http_client
        payload = {
            "session_id": session_id,
            "message": message,
            "language": language,
        }
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat"
        headers = _legacy_module.get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=240.0
        )

        if response.status_code != 200:
            try:
                error_detail = response.json().get("detail", "AI hatası")
            except Exception:
                error_detail = (
                    response.text or f"AI Service hatası: {response.status_code}"
                )

            print(f"❌ AI Service Hatası ({response.status_code}): {error_detail}")

            if response.status_code == 429:
                error_lower = error_detail.lower()
                if (
                    "quota" in error_lower
                    or "gemini" in error_lower
                    or "rate limit" in error_lower
                ):
                    if "quota" in error_lower and "exceeded" in error_lower:
                        raise HTTPException(
                            status_code=429,
                            detail="Gemini API günlük kotası aşıldı. Lütfen profil sayfasından Local LLM'e geçin veya yarın tekrar deneyin.",
                        )
                    raise HTTPException(
                        status_code=429,
                        detail="Gemini API çok yoğun. Lütfen birkaç dakika sonra tekrar deneyin veya Local LLM kullanmayı deneyin.",
                    )
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        result = response.json()
        user_id = current_user.get("sub")
        if user_id and isinstance(result, dict) and result.get("answer"):
            try:
                user_meta = _legacy_module._normalize_message_metadata(
                    body.get("message_payload"),
                    fallback_content=str(message),
                    fallback_language=language,
                )
                assistant_meta = _legacy_module._normalize_message_metadata(
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
                _legacy_module.stats_cache_delete_keys(
                    _legacy_module._chat_messages_cache_key(
                        str(user_id), str(session_id)
                    ),
                    _legacy_module._chat_sessions_cache_key(str(user_id)),
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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


@router.post("/chat/message/stream")
async def send_chat_message_stream(
    request: Request,
    body: dict = Body(...),
    _current_user: dict = Depends(get_current_user),
):
    session_id = body.get("session_id")
    message = body.get("message")
    language = body.get("language", "tr")
    if not session_id or not message:
        raise HTTPException(status_code=400, detail="Session ID ve mesaj gereklidir.")

    payload = {"session_id": session_id, "message": message, "language": language}
    target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/stream"
    headers = _legacy_module.get_ai_service_headers()

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


@router.get("/chat/sessions")
async def list_pdf_chat_sessions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Oturum gerekli.")
        cache_key = _legacy_module._chat_sessions_cache_key(str(user_id))
        cached = _legacy_module.stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            log_cache(
                "chat_sessions_redis",
                cache_key,
                True,
                ttl=_legacy_module.CHAT_SESSIONS_CACHE_TTL_SEC,
                extra={"endpoint": "chat_sessions"},
            )
            return cached
        log_cache(
            "chat_sessions_redis",
            cache_key,
            False,
            ttl=_legacy_module.CHAT_SESSIONS_CACHE_TTL_SEC,
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
        _legacy_module.stats_cache_set_json(
            cache_key, payload, _legacy_module.CHAT_SESSIONS_CACHE_TTL_SEC
        )
        return payload
    except (OperationalError, PendingRollbackError) as e:
        _legacy_module._raise_db_unavailable(e)


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
        cache_key = _legacy_module._chat_messages_cache_key(str(user_id), session_db_id)
        cached = _legacy_module.stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            log_cache(
                "chat_messages_redis",
                cache_key,
                True,
                ttl=_legacy_module.CHAT_MESSAGES_CACHE_TTL_SEC,
                extra={"endpoint": "chat_session_messages"},
            )
            return cached
        log_cache(
            "chat_messages_redis",
            cache_key,
            False,
            ttl=_legacy_module.CHAT_MESSAGES_CACHE_TTL_SEC,
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
        _legacy_module.stats_cache_set_json(
            cache_key, payload, _legacy_module.CHAT_MESSAGES_CACHE_TTL_SEC
        )
        return payload
    except (OperationalError, PendingRollbackError) as e:
        _legacy_module._raise_db_unavailable(e)


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
                    _legacy_module._extract_text_from_pdf_bytes, pdf_row.pdf_data
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
        headers = _legacy_module.get_ai_service_headers()
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
        _legacy_module._raise_db_unavailable(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("resume chat session: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )

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

    (
        is_pro,
        llm_provider,
    ) = await _legacy_module.user_repo.get_user_role_and_llm_provider(
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

        mode = body.get("mode", "flash")
        if llm_provider == "local":
            mode = "flash"

        client = request.app.state.ai_http_client
        params = {"llm_provider": llm_provider, "mode": mode}
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/general/start"
        headers = _legacy_module.get_ai_service_headers()
        response = await client.post(
            target_url, params=params, headers=headers, timeout=60.0
        )

        if response.status_code != 200:
            error_detail = response.json().get("detail", "AI hatası")
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        return response.json()

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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


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

    is_pro, _llm_unused = await _legacy_module.user_repo.get_user_role_and_llm_provider(
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
        client = request.app.state.ai_http_client
        payload = {
            "session_id": session_id,
            "message": message,
            "language": language,
        }
        target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/general"
        headers = _legacy_module.get_ai_service_headers()
        response = await client.post(
            target_url, json=payload, headers=headers, timeout=240.0
        )

        if response.status_code != 200:
            error_detail = response.json().get("detail", "AI hatası")
            if response.status_code == 429:
                error_lower = error_detail.lower()
                if (
                    "quota" in error_lower
                    or "gemini" in error_lower
                    or "rate limit" in error_lower
                ):
                    if "quota" in error_lower and "exceeded" in error_lower:
                        raise HTTPException(
                            status_code=429,
                            detail="Gemini API günlük kotası aşıldı. Lütfen profil sayfasından Local LLM'e geçin veya yarın tekrar deneyin.",
                        )
                    raise HTTPException(
                        status_code=429,
                        detail="Gemini API çok yoğun. Lütfen birkaç dakika sonra tekrar deneyin veya Local LLM kullanmayı deneyin.",
                    )
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        return response.json()

    except httpx.ReadTimeout:
        raise HTTPException(
            status_code=504,
            detail="AI yanıtı zaman aşımına uğradı. Lütfen tekrar deneyin veya Local LLM kullanın.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("General chat message failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )


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

    (
        is_pro,
        llm_provider,
    ) = await _legacy_module.user_repo.get_user_role_and_llm_provider(
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
        headers = _legacy_module.get_ai_service_headers()
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
        raise HTTPException(
            status_code=500, detail=_legacy_module.SECURE_SERVER_ERROR_DETAIL
        )
