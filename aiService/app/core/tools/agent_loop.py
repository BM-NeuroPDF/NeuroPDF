"""Parse <tool_call> JSON from LLM text; dispatch registry; second-turn answer."""
from __future__ import annotations

import json
import re
from typing import Any, Literal, Optional

from .base import ToolRunResult
from . import registry
from .prompt_builder import build_tool_use_instruction

_TOOL_CALL_PATTERN = re.compile(
    r"<tool_call>\s*([\s\S]*?)\s*</tool_call>",
    re.IGNORECASE,
)


def parse_tool_calls(text: str) -> list[dict[str, Any]]:
    """Extract JSON objects from <tool_call>...</tool_call>. Returns list (may be empty)."""
    out: list[dict[str, Any]] = []
    for m in _TOOL_CALL_PATTERN.finditer(text or ""):
        raw = m.group(1).strip()
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                out.append(obj)
        except json.JSONDecodeError:
            continue
    return out


def _normalize_tool_output(raw: str | ToolRunResult) -> tuple[str, list[dict[str, Any]]]:
    if isinstance(raw, ToolRunResult):
        return raw.message, list(raw.client_actions)
    return (raw or "").strip(), []


def _dispatch_one(call: dict[str, Any], tool_context: Optional[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    name = call.get("name")
    if not name or not isinstance(name, str):
        return "Hata: tool_call içinde geçerli 'name' yok.", []
    args = call.get("args") or call.get("arguments") or {}
    if not isinstance(args, dict):
        return "Hata: 'args' bir nesne (object) olmalı.", []
    args = {k: v for k, v in args.items() if k != "_tool_context"}
    tool = registry.get(name)
    if tool is None:
        return f"Hata: bilinmeyen araç: {name}", []
    ctx = dict(tool_context or {})
    try:
        raw = tool.execute(**args, _tool_context=ctx)
        return _normalize_tool_output(raw)
    except TypeError as e:
        return f"Hata: araç argümanları geçersiz: {e}", []
    except Exception as e:
        return f"Hata: araç çalıştırılamadı: {e}", []


def run_with_tools(
    *,
    llm_provider: Literal["cloud", "local"],
    mode: str,
    cloud_prompt: str,
    local_instruction: str,
    local_user_message: str,
    local_history: Optional[list],
    tool_context: Optional[dict[str, Any]] = None,
    cloud_generate,
    local_generate,
) -> tuple[str, list[dict[str, Any]]]:
    """
    One tool round max: first LLM -> optional tool -> second LLM for natural answer.

    cloud_generate: (text_content: str, prompt_instruction: str, mode: str) -> str
    local_generate: (user_message: str, instruction: str, history: list | None) -> str

    Returns (answer, client_actions) from the tool round (if any).
    """
    tool_block = build_tool_use_instruction()

    if llm_provider == "cloud":
        first_input = f"{cloud_prompt}\n\n{tool_block}"
        raw = cloud_generate(
            first_input,
            "Yukarıdaki bağlam ve araç kurallarına uy.",
            mode,
        )
    else:
        inst = f"{local_instruction}\n\n{tool_block}"
        raw = local_generate(local_user_message, inst, local_history)

    calls = parse_tool_calls(raw)
    if not calls:
        return (raw or "").strip(), []

    tool_result, client_actions = _dispatch_one(calls[0], tool_context)

    if llm_provider == "cloud":
        follow = f"""{cloud_prompt}

[ÖNCEKİ_MODEL_ÇIKTISI]
{raw}

[ARAÇ_SONUCU]
{tool_result}

Yukarıdaki araç sonucunu kullanarak kullanıcıya Türkçe, net nihai cevabı yaz.
<tool_call> kullanma; sadece kullanıcıya yönelik metin yaz."""
        final = cloud_generate(
            follow,
            "Nihai kullanıcı cevabını üret.",
            mode,
        ).strip()
        return final, client_actions

    follow_user = (
        f"Orijinal kullanıcı mesajı: {local_user_message}\n\n"
        f"Modelin ilk ham çıktısı: {raw}\n\n"
        f"Araç sonucu: {tool_result}\n\n"
        "Araç sonucuna göre kullanıcıya Türkçe nihai cevabı yaz. "
        "<tool_call> kullanma."
    )
    second = local_generate(
        follow_user,
        "Sen NeuroPDF asistanısın. Sadece nihai kullanıcı cevabını ver.",
        local_history,
    )
    return (second or "").strip(), client_actions
