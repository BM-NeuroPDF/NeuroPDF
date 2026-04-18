import httpx
import logging

from ..services import pdf_service
from ..services.llm_manager import summarize_text
from .celery_worker import celery_app

log = logging.getLogger(__name__)

@celery_app.task(bind=True, name="tasks.async_summarize_pdf")
def async_summarize_pdf(self, pdf_id: int, storage_path: str, callback_url: str, llm_provider: str = "cloud", mode: str = "pro", language: str = "tr"):
    log.info(f"[CELERY TASK] Görev başladı: PDF ID {pdf_id} (Dil: {language})")

    try:
        text_content = pdf_service.extract_text_from_pdf_path(storage_path)

        if llm_provider == "cloud":
            if language == "en":
                prompt_instruction = (
                    "Summarize this PDF document in English in a clear and engaging way. "
                    "Please structure your response like a modern AI assistant with a professional yet friendly tone, "
                    "using appropriate emojis (📄✨). "
                    "Structure your answer as follows:\n"
                    "1. 🎯 **Main Idea**: Summarize the core purpose in 1-2 sentences.\n"
                    "2. 💡 **Key Points**: List arguments and details in readable bullet points.\n"
                    "3. 📊 **Conclusion/Summary**: Final takeaway or result.\n\n"
                    "Ensure it's not a wall of text; keep paragraphs short and headings clear."
                )
            else:
                prompt_instruction = (
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
            if language == "en":
                prompt_instruction = (
                    "Analyze the following text in detail. Summarize the main idea, "
                    "key arguments, and major takeaways in bullet points."
                )
            else:
                prompt_instruction = (
                    "Aşağıdaki metni detaylı bir şekilde analiz et. "
                    "Metnin ana fikrini, temel argümanlarını ve önemli çıkarımlarını "
                    "madde madde özetle."
                )

        summary = summarize_text(
            text_content,
            prompt_instruction,
            llm_provider=llm_provider,
            mode=mode,
            language=language,
        )

        success_payload = {"status": "completed", "summary": summary, "pdf_id": pdf_id, "llm_provider": llm_provider}
        with httpx.Client() as client:
            r = client.post(callback_url, json=success_payload, timeout=30)
            r.raise_for_status()

        return {"status": "success", "summary_length": len(summary)}

    except Exception as e:
        log.error(f"[CELERY TASK] HATA: PDF ID {pdf_id} | {str(e)}")
        error_payload = {"status": "failed", "error": str(e), "pdf_id": pdf_id, "llm_provider": llm_provider}

        try:
            with httpx.Client() as client:
                client.post(callback_url, json=error_payload, timeout=30)
        except Exception:
            pass

        raise
