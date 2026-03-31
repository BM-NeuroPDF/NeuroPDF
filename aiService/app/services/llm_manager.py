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
) -> str:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    if llm_provider == "cloud":
        return ai_service.gemini_generate(text, prompt_instruction, mode=mode)

    if llm_provider == "local":
        result = analyze_text_with_local_llm(text, task="summarize", instruction=prompt_instruction)
        return result.get("summary", "") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider. 'cloud' veya 'local' olmalı.")


def _cloud_generate(text_content: str, prompt_instruction: str, mode: CloudMode) -> str:
    return ai_service.gemini_generate(
        text_content=text_content,
        prompt_instruction=prompt_instruction,
        mode=mode,
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
) -> tuple[str, list[dict[str, Any]]]:
    full_prompt = _build_chat_prompt(session_text, filename, history_text, user_message)

    pdf_context_instruction = f"""PDF asistanı gibi yanıt ver. Türkçe, net ve pratik ol.

DOSYA: {filename}

PDF İÇERİĞİ:
---
{session_text[:12000]}  # PDF context'i kırp (local LLM limiti için)
---

PDF içeriğine dayanarak cevap ver. Eğer PDF'te açıkça yoksa, bunu belirt."""

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
    tool_context: Optional[dict[str, Any]] = None,
) -> tuple[str, list[dict[str, Any]]]:
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
        )

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider.")
