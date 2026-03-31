# aiservice/app/routers/analysis.py

import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..tasks import pdf_tasks
from ..services import ai_service, pdf_service
from ..services.tts_manager import text_to_speech
from ..services.llm_manager import CloudMode, LLMProvider, summarize_text, chat_over_pdf, general_chat as llm_general_chat
from ..deps import verify_api_key

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["AI Analysis"],
)

@router.post("/summarize-sync")
async def summarize_synchronous(
    file: UploadFile = File(...),
    llm_provider: LLMProvider = Query("cloud"),
    mode: CloudMode = Query("flash"),
    _: bool = Depends(verify_api_key),
):
    try:
        pdf_bytes = await file.read()
        text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)

        if llm_provider == "cloud":
            prompt = (
                "Bu PDF belgesini Türkçe olarak, anlaşılır ve ilgi çekici bir şekilde özetle. "
                "Lütfen yanıtını tıpkı modern bir yapay zeka asistanı gibi profesyonel ama samimi bir tonda, "
                "aralara uygun emojiler (📄✨) serpiştirerek yapılandır. "
                "Aşağıdaki formatı kullanmaya özen göster:\n"
                "1. 🎯 **Ana Fikir**: Belgenin temel amacını 1-2 cümleyle özetle.\n"
                "2. 💡 **Önemli Noktalar**: Öne çıkan argümanları ve detayları okunabilir kısa maddeler halinde listele.\n"
                "3. 📊 **Sonuç/Kısa Değerlendirme**: Belgenin ulaştığı sonucu veya genel çıkarımı yaz.\n\n"
                "Yanıtın sıkıcı ve uzun bir metin yığını (wall of text) olmasın; "
                "paragraflar kısa, başlıklar belirgin ve okuması çok keyifli olsun."
            )
        else:
            prompt = (
                "Bu PDF belgesini Türkçe olarak özetle. "
                "Ana konuları ve önemli noktaları madde madde belirt."
            )

        # Blocking LLM çağrısını thread pool'da çalıştır (event loop'u bloklamaz)
        summary = await asyncio.to_thread(
            summarize_text, text, prompt, llm_provider=llm_provider, mode=mode
        )

        return {
            "status": "completed",
            "summary": summary,
            "pdf_text": text,  # PDF text'ini de döndür (chat için)
            "llm_provider": llm_provider,
            "mode": mode if llm_provider == "cloud" else None,
            "method": "synchronous",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Özetleme işlemi başarısız: {str(e)}")


class AsyncTaskRequest(BaseModel):
    pdf_id: int
    storage_path: str
    callback_url: str
    llm_provider: str = "cloud"
    mode: str = "pro"


@router.post("/summarize-async")
async def summarize_asynchronous(
    task_request: AsyncTaskRequest,
    _: bool = Depends(verify_api_key),
):
    pdf_tasks.async_summarize_pdf.delay(
        pdf_id=task_request.pdf_id,
        storage_path=task_request.storage_path,
        callback_url=task_request.callback_url,
        llm_provider=task_request.llm_provider,
        mode=task_request.mode,
    )
    return {
        "status": "processing",
        "pdf_id": task_request.pdf_id,
        "llm_provider": task_request.llm_provider,
        "mode": task_request.mode if task_request.llm_provider == "cloud" else None,
    }


class StartChatResponse(BaseModel):
    session_id: str


@router.post("/chat/start", response_model=StartChatResponse)
async def start_chat(
    file: UploadFile = File(...),
    llm_provider: LLMProvider = Query("cloud"),
    mode: CloudMode = Query("flash"),
    _: bool = Depends(verify_api_key),
):
    pdf_bytes = await file.read()
    text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)

    # DÜZELTME: Artık hem llm_provider hem mode gönderiyoruz, servis bunu karşılayacak.
    session_id = ai_service.create_pdf_chat_session(
        text,
        filename=file.filename,
        llm_provider=llm_provider,
        mode=mode,
    )
    return {"session_id": session_id}


class StartChatFromTextRequest(BaseModel):
    pdf_text: str
    filename: str = "document.pdf"
    llm_provider: LLMProvider = "cloud"
    mode: CloudMode = "flash"


@router.post("/chat/start-from-text", response_model=StartChatResponse)
async def start_chat_from_text(
    req: StartChatFromTextRequest,
    _: bool = Depends(verify_api_key),
):
    """PDF text'ini direkt kullanarak chat session başlatır (dosya yüklemeden)."""
    session_id = ai_service.create_pdf_chat_session(
        req.pdf_text,
        filename=req.filename,
        llm_provider=req.llm_provider,
        mode=req.mode,
    )
    return {"session_id": session_id}


class ChatRequest(BaseModel):
    session_id: str
    message: str
    llm_provider: str | None = None
    mode: str | None = None


@router.post("/chat")
async def chat_about_pdf(
    req: ChatRequest,
    _: bool = Depends(verify_api_key),
):
    try:
        ai_service._cleanup_sessions()
        session = ai_service._PDF_CHAT_SESSIONS.get(req.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sohbet oturumu bulunamadı veya süresi dolmuş.")

        pdf_text = session["text"]
        filename = session["filename"]
        history = session["history"]

        MAX_CONTEXT_CHARS = 45000
        pdf_context = pdf_text[:MAX_CONTEXT_CHARS] if len(pdf_text) > MAX_CONTEXT_CHARS else pdf_text

        history_text = ""
        for turn in history[-10:]:
            history_text += f"{turn['role'].upper()}: {turn['content']}\n"

        # Session'daki tercihi kullan, yoksa request'ten geleni, o da yoksa varsayılanı.
        llm_provider = req.llm_provider or session.get("llm_provider", "cloud")
        mode = req.mode or session.get("mode", "pro")

        # Blocking LLM çağrısını thread pool'da çalıştır (event loop'u bloklamaz)
        # History array'i geçir (local LLM için), history_text string'i de geçir (cloud için)
        answer = await asyncio.to_thread(
            chat_over_pdf,
            session_text=pdf_context,
            filename=filename,
            history_text=history_text,
            user_message=req.message,
            llm_provider=llm_provider,
            mode=mode,
            history=history[-10:] if history else None,  # Son 10 mesajı geçir (context window için)
        )

        history.append({"role": "user", "content": req.message})
        history.append({"role": "assistant", "content": answer})

        return {
            "answer": answer,
            "llm_provider": llm_provider,
            "mode": mode if llm_provider == "cloud" else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e) if e else "Bilinmeyen hata"
        print(f"❌ Chat About PDF Error: {error_msg}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Sohbet hatası: {error_msg}")


class TTSRequest(BaseModel):
    text: str


@router.post("/tts")
async def generate_speech(
    request: TTSRequest,
    _: bool = Depends(verify_api_key),
):
    if not request.text:
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    # Blocking TTS çağrısını thread pool'da çalıştır
    audio_buffer = await asyncio.to_thread(text_to_speech, request.text)
    if not audio_buffer:
        raise HTTPException(status_code=500, detail="Ses oluşturulamadı.")

    return StreamingResponse(audio_buffer, media_type="audio/mpeg")


# ==========================================
# GENEL CHAT (PDF Gerektirmez - Pro Kullanıcılar İçin)
# ==========================================

@router.post("/chat/general/start", response_model=StartChatResponse)
async def start_general_chat(
    llm_provider: LLMProvider = Query("cloud"),
    mode: CloudMode = Query("flash"),
    _: bool = Depends(verify_api_key),
):
    """Pro kullanıcılar için genel AI chat oturumu başlatır (PDF gerektirmez)."""
    session_id = ai_service.create_general_chat_session(
        llm_provider=llm_provider,
        mode=mode,
    )
    return {"session_id": session_id}


class GeneralChatRequest(BaseModel):
    session_id: str
    message: str
    llm_provider: str | None = None
    mode: str | None = None


@router.post("/chat/general")
async def general_chat(
    req: GeneralChatRequest,
    _: bool = Depends(verify_api_key),
):
    """Pro kullanıcılar için genel AI chat (PDF gerektirmez)."""
    try:
        ai_service._cleanup_sessions()
        session = ai_service._GENERAL_CHAT_SESSIONS.get(req.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sohbet oturumu bulunamadı veya süresi dolmuş.")

        history = session["history"]

        history_text = ""
        for turn in history[-10:]:
            history_text += f"{turn['role'].upper()}: {turn['content']}\n"

        # Session'daki tercihi kullan, yoksa request'ten geleni, o da yoksa varsayılanı.
        llm_provider = req.llm_provider or session.get("llm_provider", "cloud")
        mode = req.mode or session.get("mode", "pro")

        # Blocking LLM çağrısını thread pool'da çalıştır (event loop'u bloklamaz)
        # History array'i geçir (local LLM için), history_text string'i de geçir (cloud için)
        answer = await asyncio.to_thread(
            llm_general_chat,
            history_text=history_text,
            user_message=req.message,
            llm_provider=llm_provider,
            mode=mode,
            history=history[-10:] if history else None,  # Son 10 mesajı geçir (context window için)
        )

        history.append({"role": "user", "content": req.message})
        history.append({"role": "assistant", "content": answer})

        return {
            "answer": answer,
            "llm_provider": llm_provider,
            "mode": mode if llm_provider == "cloud" else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ General Chat Error: {str(e)}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Genel sohbet hatası: {str(e)}")


@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai_service",
        "endpoints": {
            "sync": "/api/v1/ai/summarize-sync",
            "async": "/api/v1/ai/summarize-async",
            "chat_start": "/api/v1/ai/chat/start",
            "chat": "/api/v1/ai/chat",
            "tts": "/api/v1/ai/tts",
        },
        "llm": {
            "providers": ["cloud", "local"],
            "cloud_modes": ["flash", "pro"],
        },
    }
