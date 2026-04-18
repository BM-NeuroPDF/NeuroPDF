# aiService/app/services/llm_manager.py

from fastapi import HTTPException
from typing import Any, Literal, Optional

from app.core.tools.agent_loop import run_with_tools

from . import ai_service  # gemini tarafı
from .local_llm_service import analyze_text_with_local_llm  # yerel LLM tarafı

LLMProvider = Literal["cloud", "local"]
CloudMode = Literal["flash", "pro"]

def summarize_text(
    text: str,
    prompt_instruction: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "flash",
    language: str = "tr",
) -> str:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    if llm_provider == "cloud":
        return ai_service.gemini_generate(text, prompt_instruction, mode=mode, language=language)

    if llm_provider == "local":
        result = analyze_text_with_local_llm(text, task="summarize", instruction=prompt_instruction)
        return result.get("summary", "") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider. 'cloud' veya 'local' olmalı.")


def _cloud_generate(text_content: str, prompt_instruction: str, mode: CloudMode, language: str = "tr") -> str:
    return ai_service.gemini_generate(
        text_content=text_content,
        prompt_instruction=prompt_instruction,
        mode=mode,
        language=language,
    )


def _local_chat_generate(user_message: str, instruction: str, history: Optional[list]) -> str:
    result = analyze_text_with_local_llm(
        user_message,
        task="chat",
        instruction=instruction,
        history=history,
    )
    return result.get("answer") or result.get("summary") or "Local LLM yanıt üretmedi."


def chat_over_pdf(
    session_text: str,
    filename: str,
    history_text: str,
    user_message: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "pro",
    history: Optional[list] = None,
    tool_context: Optional[dict[str, Any]] = None,
    language: str = "tr",
) -> tuple[str, list[dict[str, Any]]]:
    full_prompt = _build_chat_prompt(session_text, filename, history_text, user_message, language)

    prefix_instr = 'Türkçe, net ve pratik ol.' if language == 'tr' else 'Always reply in English. Be clear and practical.'
    context_instr = ("PDF içeriğine dayanarak cevap ver. Eğer PDF'te açıkça yoksa, bunu belirt." 
                     if language == 'tr' else 
                     "Reply based on the PDF content. If not explicitly in the PDF, state so.")

    pdf_context_instruction = (
        f"PDF asistanı gibi yanıt ver. {prefix_instr}\n\n"
        f"DOSYA: {filename}\n\nPDF İÇERİĞİ:\n---\n{session_text[:12000]}\n---\n"
        f"{context_instr}"
    )

    ctx = dict(tool_context or {})
    ctx.setdefault("filename", filename)
    ctx.setdefault("full_text", session_text)
    ctx.setdefault("llm_provider", llm_provider)
    ctx.setdefault("mode", mode)

    if llm_provider == "cloud":
        return run_with_tools(
            llm_provider="cloud",
            mode=mode,
            cloud_prompt=full_prompt,
            local_instruction=pdf_context_instruction,
            local_user_message=user_message,
            local_history=history,
            tool_context=ctx,
            cloud_generate=_cloud_generate,
            local_generate=_local_chat_generate,
        )

    if llm_provider == "local":
        return run_with_tools(
            llm_provider="local",
            mode=mode,
            cloud_prompt=full_prompt,
            local_instruction=pdf_context_instruction,
            local_user_message=user_message,
            local_history=history,
            tool_context=ctx,
            cloud_generate=_cloud_generate,
            local_generate=_local_chat_generate,
        )

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider.")


def _build_chat_prompt(pdf_context: str, filename: str, history_text: str, user_message: str, language: str = "tr") -> str:
    if language == "en":
        system_instruction = (
            "You are a PDF assistant. Reply based on the PDF uploaded by the user.\n"
            "If it's not explicitly in the PDF, state so and ask the user for hints like page/title.\n"
            "Always reply in English. Be clear and practical.\n"
        )
    else:
        system_instruction = (
            "Sen bir PDF asistanısın. Kullanıcının yüklediği PDF'e dayanarak cevap ver.\n"
            "Eğer PDF'te açıkça yoksa, bunu belirt ve kullanıcıdan sayfa/başlık gibi ipucu iste.\n"
            "Cevaplarını Türkçe ver, net ve pratik ol.\n"
        )

    history_label = "CHAT HISTORY" if language == "en" else "SOHBET GEÇMİŞİ"
    user_label = "USER QUESTION" if language == "en" else "KULLANICI SORUSU"
    file_label = "FILE" if language == "en" else "DOSYA"
    content_label = "PDF CONTENT" if language == "en" else "PDF İÇERİĞİ"

    return f"""
{system_instruction}

{file_label}: {filename}

{content_label}:
---
{pdf_context}
---

{history_label}:
---
{history_text}
---

{user_label}:
{user_message}
""".strip()


def general_chat(
    history_text: str,
    user_message: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "pro",
    history: Optional[list] = None,
    tool_context: Optional[dict[str, Any]] = None,
    language: str = "tr",
) -> tuple[str, list[dict[str, Any]]]:
    """Genel AI chat (PDF gerektirmez)."""
    if language == "en":
        system_instruction = (
            "You are NeuroPDF's AI assistant. You are here to help users.\n"
            "You can help with PDF operations, file management, general questions, and technical topics.\n"
            "Always reply in English. Be clear, practical, and friendly.\n"
        )
    else:
        system_instruction = (
            "Sen NeuroPDF'in AI asistanısın. Kullanıcılara yardımcı olmak için buradasın.\n"
            "PDF işlemleri, dosya yönetimi, genel sorular ve teknik konularda yardımcı olabilirsin.\n"
            "Cevaplarını Türkçe ver, net, pratik ve samimi ol.\n"
        )

    history_label = "CHAT HISTORY" if language == "en" else "SOHBET GEÇMİŞİ"
    user_label = "USER QUESTION" if language == "en" else "KULLANICI SORUSU"
    no_history = "No previous conversation yet." if language == "en" else "Henüz sohbet başlamadı."

    full_prompt = f"""
{system_instruction}

{history_label}:
---
{history_text if history_text else no_history}
---

{user_label}:
{user_message}
""".strip()

    if llm_provider == "cloud":
        return run_with_tools(
            llm_provider="cloud",
            mode=mode,
            cloud_prompt=full_prompt,
            local_instruction=system_instruction,
            local_user_message=user_message,
            local_history=history,
            tool_context=tool_context,
            cloud_generate=_cloud_generate,
            local_generate=_local_chat_generate,
            language=language, # Dili geçir
        )

    if llm_provider == "local":
        return run_with_tools(
            llm_provider="local",
            mode=mode,
            cloud_prompt=full_prompt,
            local_instruction=system_instruction,
            local_user_message=user_message,
            local_history=history,
            tool_context=tool_context,
            cloud_generate=_cloud_generate,
            local_generate=_local_chat_generate,
            language=language, # Dili geçir
        )

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider.")
