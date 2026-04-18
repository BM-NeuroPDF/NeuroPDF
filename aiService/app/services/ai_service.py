# app/services/ai_service.py
from __future__ import annotations

import os
import random
import time
import uuid
from fastapi import HTTPException

import google.generativeai as genai
from ..config import settings

flash_model = None
pro_model = None


def _load_gemini_models_if_configured() -> None:
    """API key varsa Gemini modellerini yükle (import + testler için tek giriş noktası)."""
    global flash_model, pro_model
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        return
    genai.configure(api_key=key)
    flash_model = genai.GenerativeModel("models/gemini-flash-latest")
    pro_model = genai.GenerativeModel("models/gemini-pro-latest")


_load_gemini_models_if_configured()


def _local_llm_configured() -> bool:
    return bool(
        (
            os.getenv("LOCAL_LLM_URL") or getattr(settings, "LOCAL_LLM_URL", None) or ""
        ).strip()
    )


def _gemini_via_local_openai(text_content: str, prompt_instruction: str) -> str:
    """Bulut Gemini yerine LOCAL_LLM_URL (Ollama /v1) üzerinden tek istek."""
    from .local_llm_service import analyze_text_with_local_llm

    r = analyze_text_with_local_llm(
        text_content,
        task="chat",
        instruction=prompt_instruction,
    )
    return (r.get("answer") or r.get("summary") or "").strip()


# ==========================================
# Session Store (PDF Sohbet Hafızası)
# ==========================================
_PDF_CHAT_SESSIONS = {}
_GENERAL_CHAT_SESSIONS = {}  # Genel chat için (PDF gerektirmez)
SESSION_TTL_SECONDS = 60 * 60  # 1 saat


def _require_cloud():
    if not flash_model or not pro_model:
        raise HTTPException(
            status_code=503, detail="Cloud LLM yapılandırılmadı (GEMINI_API_KEY yok)."
        )


def _cleanup_sessions():
    now = time.time()
    expired = [
        sid
        for sid, s in _PDF_CHAT_SESSIONS.items()
        if (now - s["created_at"]) > SESSION_TTL_SECONDS
    ]
    for sid in expired:
        del _PDF_CHAT_SESSIONS[sid]
    expired_general = [
        sid
        for sid, s in _GENERAL_CHAT_SESSIONS.items()
        if (now - s["created_at"]) > SESSION_TTL_SECONDS
    ]
    for sid in expired_general:
        del _GENERAL_CHAT_SESSIONS[sid]


def _is_quota_or_rate_limit_error(err: Exception) -> bool:
    msg = str(err)
    return ("429" in msg) or ("Quota exceeded" in msg) or ("rate limit" in msg.lower())


def _is_quota_exceeded_error(err: Exception) -> bool:
    """Check if error is permanent quota exceeded (not retryable)"""
    msg = str(err).lower()
    # Check for permanent quota exhaustion patterns
    return (
        ("quota exceeded" in msg)
        or ("limit: 0" in msg)
        or ("free_tier" in msg and "quota" in msg)
        or ("exceeded your current quota" in msg)
    )


def _generate_with_retry(model, prompt: str, attempts: int = 5):
    """
    API çağrısını yapar. 429 hatası alırsa bekleyip tekrar dener.
    Quota exceeded hatası için retry yapmaz, hemen hata döner.
    """
    last_err = None
    for i in range(attempts):
        try:
            return model.generate_content(prompt)
        except Exception as e:
            last_err = e
            # Quota exceeded is permanent - don't retry, fail immediately
            if _is_quota_exceeded_error(e):
                error_msg = str(e)
                print(
                    "❌ Gemini API quota aşıldı (retry yapılmıyor). Lütfen Local LLM kullanmayı deneyin."
                )
                raise HTTPException(
                    status_code=429, detail=f"Gemini API kotası aşıldı: {error_msg}"
                )

            # Temporary rate limit - retry with exponential backoff
            if _is_quota_or_rate_limit_error(e):
                # Üstel bekleme (Exponential Backoff) - daha uzun bekleme süreleri
                # İlk denemelerde kısa, son denemelerde daha uzun bekle
                base_delay = min(120, (2**i) * 5)  # 5s, 10s, 20s, 40s, 80s (max 120s)
                sleep_s = base_delay + random.random() * 2  # Rastgele 0-2s ekle
                print(
                    f"⚠️ Gemini Rate Limit ({i + 1}/{attempts}). {sleep_s:.2f}s bekleniyor..."
                )
                time.sleep(sleep_s)
                continue
            raise
    # Tüm denemeler başarısız oldu (temporary rate limits)
    error_msg = str(last_err) if last_err else "Unknown error"
    print("❌ Gemini Rate Limit: Tüm denemeler başarısız oldu.")
    raise last_err


# ==========================================
# Ana Servis Fonksiyonları
# ==========================================


def gemini_generate(
    text_content: str,
    prompt_instruction: str,
    mode: str = "flash",
    language: str = "tr",
) -> str:
    """
    Tek ve birleştirilmiş ana fonksiyon.
    Hem metin özetleme hem de sohbet için kullanılır.
    """
    if _local_llm_configured():
        if not text_content:
            raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")
        return _gemini_via_local_openai(text_content, prompt_instruction)

    _require_cloud()  # API Key kontrolü

    if not text_content:
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    MAX_TEXT_LENGTH = 50000
    if len(text_content) > MAX_TEXT_LENGTH:
        text_content = text_content[:MAX_TEXT_LENGTH]

    # Prompt'u oluştur
    text_label = "TEXT" if language == "en" else "METİN"
    full_prompt = f"{prompt_instruction}\n\n{text_label}:\n---\n{text_content}\n---"

    # Modeli seç
    # Eğer PRO istenmişse ve hata alınırsa FLASH'a düş (Fallback)
    if mode == "pro":
        try:
            # PRO ile sınırlı deneme
            response = _generate_with_retry(pro_model, full_prompt, attempts=2)
            if getattr(response, "candidates", None):
                return response.text
        except Exception as e:
            if not _is_quota_or_rate_limit_error(e):
                raise e
            print("⚠️ Gemini Pro kotası dolu, Flash modeline geçiliyor (Sohbet)...")
            mode = "flash"

    # Ana model (veya fallback sonrası flash) ile deneme
    model = flash_model if mode == "flash" else pro_model

    try:
        # Retry mekanizması ile çağır
        response = _generate_with_retry(model, full_prompt, attempts=5)

        if getattr(response, "candidates", None):
            return response.text

        raise HTTPException(
            status_code=400,
            detail="AI'dan geçerli bir yanıt alınamadı (içerik engellenmiş olabilir).",
        )
    except HTTPException:
        raise
    except Exception as e:
        if _is_quota_or_rate_limit_error(e):
            raise HTTPException(
                status_code=429, detail=f"Gemini servis yoğunluğu: {str(e)}"
            )
        raise HTTPException(status_code=500, detail=f"Gemini servisinde hata: {str(e)}")


def call_gemini_for_task(
    text_content: str, prompt_instruction: str, language: str = "tr"
) -> str:
    """
    Celery (Arka Plan) görevleri için kullanılır.
    Otomatik olarak Pro dener, olmazsa Flash'a düşer (Fallback).
    """
    if _local_llm_configured():
        if not text_content or not text_content.strip():
            raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")
        return _gemini_via_local_openai(text_content, prompt_instruction)

    _require_cloud()

    if not text_content or not text_content.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    MAX_TEXT_LENGTH = 50000
    if len(text_content) > MAX_TEXT_LENGTH:
        text_content = text_content[:MAX_TEXT_LENGTH]

    text_label = "TEXT" if language == "en" else "METİN"
    full_prompt = f"{prompt_instruction}\n\n{text_label}:\n---\n{text_content}\n---"

    # 1. Deneme: PRO Modeli
    try:
        resp = _generate_with_retry(pro_model, full_prompt, attempts=4)
        if getattr(resp, "candidates", None):
            return resp.text
    except Exception as e:
        if not _is_quota_or_rate_limit_error(e):
            raise e
        print("⚠️ Gemini Pro kotası dolu, Flash modeline geçiliyor...")

    # 2. Deneme (Fallback): FLASH Modeli
    try:
        resp = _generate_with_retry(flash_model, full_prompt, attempts=5)
        if getattr(resp, "candidates", None):
            return resp.text
        raise HTTPException(
            status_code=400, detail="AI yanıt üretmedi (flash fallback)."
        )
    except Exception as e:
        if _is_quota_or_rate_limit_error(e):
            raise HTTPException(
                status_code=429, detail=f"Gemini tamamen dolu: {str(e)}"
            )
        raise HTTPException(status_code=500, detail=f"Gemini task hatası: {str(e)}")


# ==========================================
# PDF Chat Fonksiyonları
# ==========================================


def create_pdf_chat_session(
    pdf_text: str,
    filename: str | None = None,
    llm_provider: str = "cloud",
    mode: str = "flash",
    pdf_id: str | None = None,
    user_id: str | None = None,
    language: str = "tr",
) -> str:
    """Yeni bir sohbet oturumu başlatır ve ID döner."""
    _cleanup_sessions()
    session_id = str(uuid.uuid4())
    _PDF_CHAT_SESSIONS[session_id] = {
        "text": pdf_text,
        "filename": filename or "uploaded.pdf",
        "history": [],
        "created_at": time.time(),
        "llm_provider": llm_provider,
        "mode": mode,
        "pdf_id": pdf_id,
        "user_id": user_id,
        "language": language,
    }
    return session_id


def restore_pdf_chat_session(
    session_id: str,
    pdf_text: str,
    filename: str | None = None,
    history: list | None = None,
    llm_provider: str = "cloud",
    mode: str = "flash",
    pdf_id: str | None = None,
    user_id: str | None = None,
    language: str = "tr",
) -> str:
    """
    Süresi dolmuş veya kaybolmuş oturumu bellekte yeniden kurar; TTL created_at ile sıfırlanır.
    """
    _cleanup_sessions()
    clean_history: list[dict] = []
    if history:
        for h in history:
            if not isinstance(h, dict):
                continue
            role = h.get("role")
            if role not in ("user", "assistant"):
                continue
            content = h.get("content")
            if content is None:
                continue
            clean_history.append({"role": role, "content": str(content)})
    _PDF_CHAT_SESSIONS[session_id] = {
        "text": pdf_text,
        "filename": filename or "document.pdf",
        "history": clean_history,
        "created_at": time.time(),
        "llm_provider": llm_provider,
        "mode": mode,
        "pdf_id": pdf_id,
        "user_id": user_id,
        "language": language,
    }
    return session_id


def create_general_chat_session(
    llm_provider: str = "cloud", mode: str = "flash"
) -> str:
    """Genel AI chat için yeni bir sohbet oturumu başlatır (PDF gerektirmez)."""
    _cleanup_sessions()
    session_id = str(uuid.uuid4())
    _GENERAL_CHAT_SESSIONS[session_id] = {
        "history": [],
        "created_at": time.time(),
        "llm_provider": llm_provider,
        "mode": mode,
    }
    return session_id
