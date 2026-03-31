# backend/app/services/llm_manager.py

from fastapi import HTTPException
from typing import Literal, Optional

from . import ai_service  # gemini tarafı
from .local_llm_service import analyze_text_with_local_llm  # yerel LLM tarafı

LLMProvider = Literal["cloud", "local"]
CloudMode = Literal["flash", "pro"]

def summarize_text(
    text: str,
    prompt_instruction: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "flash",
) -> str:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    if llm_provider == "cloud":
        return ai_service.gemini_generate(text, prompt_instruction, mode=mode)

    if llm_provider == "local":
        result = analyze_text_with_local_llm(text, task="summarize", instruction=prompt_instruction)
        return result.get("summary", "") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider. 'cloud' veya 'local' olmalı.")


def chat_over_pdf(
    session_text: str,
    filename: str,
    history_text: str,
    user_message: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "pro",
    history: Optional[list] = None,
) -> str:
    # 1. Prompt'u Hazırla (cloud için)
    full_prompt = _build_chat_prompt(session_text, filename, history_text, user_message)

    if llm_provider == "cloud":
        return ai_service.gemini_generate(
            text_content=full_prompt, 
            prompt_instruction=(
                "Aşağıdaki PDF bağlamına ve sohbet geçmişine göre yanıtla. "
                "Cevabını tıpkı modern bir yapay zeka asistanı gibi profesyonel, samimi, "
                "anlaşılır ve emojilerle (📄✨ vb.) zenginleştirilmiş Markdown formatında ver. "
                "Metin yığını yerine kısa paragraflar, kalın yazılar ve listeler kullan:"
            ), 
            mode=mode
        )

    if llm_provider == "local":
        # Local LLM için history array kullan ve PDF context'i instruction'a ekle
        pdf_context_instruction = f"""PDF asistanı gibi yanıt ver. Türkçe, net ve pratik ol.

DOSYA: {filename}

PDF İÇERİĞİ:
---
{session_text[:12000]}  # PDF context'i kırp (local LLM limiti için)
---

PDF içeriğine dayanarak cevap ver. Eğer PDF'te açıkça yoksa, bunu belirt."""
        
        result = analyze_text_with_local_llm(
            user_message,  # Sadece kullanıcı mesajı
            task="chat",
            instruction=pdf_context_instruction,
            history=history  # Tam history array'i geçir
        )
        return result.get("answer") or result.get("summary") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider.")


def _build_chat_prompt(pdf_context: str, filename: str, history_text: str, user_message: str) -> str:
    system_instruction = (
        "Sen bir PDF asistanısın. Kullanıcının yüklediği PDF'e dayanarak cevap ver.\n"
        "Eğer PDF'te açıkça yoksa, bunu belirt ve kullanıcıdan sayfa/başlık gibi ipucu iste.\n"
        "Cevaplarını Türkçe ver, net ve pratik ol.\n"
    )

    return f"""
{system_instruction}

DOSYA: {filename}

PDF İÇERİĞİ:
---
{pdf_context}
---

SOHBET GEÇMİŞİ:
---
{history_text}
---

KULLANICI SORUSU:
{user_message}
""".strip()


def general_chat(
    history_text: str,
    user_message: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "pro",
    history: Optional[list] = None,
) -> str:
    """Genel AI chat (PDF gerektirmez)."""
    system_instruction = (
        "Sen NeuroPDF'in AI asistanısın. Kullanıcılara yardımcı olmak için buradasın.\n"
        "PDF işlemleri, dosya yönetimi, genel sorular ve teknik konularda yardımcı olabilirsin.\n"
        "Cevaplarını Türkçe ver, net, pratik ve samimi ol.\n"
    )

    full_prompt = f"""
{system_instruction}

SOHBET GEÇMİŞİ:
---
{history_text if history_text else "Henüz sohbet başlamadı."}
---

KULLANICI SORUSU:
{user_message}
""".strip()

    if llm_provider == "cloud":
        return ai_service.gemini_generate(
            text_content=full_prompt,
            prompt_instruction=(
                "Yukarıdaki sohbet geçmişine göre kullanıcının sorusuna yanıt ver. "
                "Cevabını tıpkı modern bir yapay zeka asistanı gibi profesyonel, samimi, "
                "anlaşılır ve emojilerle (🤖💡 vb.) zenginleştirilmiş Markdown formatında ver. "
                "Metin yığını yerine kısa paragraflar, kalın yazılar ve listeler kullan:"
            ),
            mode=mode
        )

    if llm_provider == "local":
        # Local LLM için history array kullan
        result = analyze_text_with_local_llm(
            user_message,  # Sadece kullanıcı mesajı
            task="chat",
            instruction=system_instruction,
            history=history  # Tam history array'i geçir
        )
        return result.get("answer") or result.get("summary") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider.")
