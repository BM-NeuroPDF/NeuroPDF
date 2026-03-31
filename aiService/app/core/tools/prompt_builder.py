"""Build tool-use instructions for LLM system prompts (text protocol only)."""
from __future__ import annotations

from . import registry


def build_tool_use_instruction() -> str:
    """
    Append to system / context. No Gemini native tools — model must emit
    <tool_call>{"name": "...", "args": {...}}</tool_call> when a tool is needed.
    """
    schemas = registry.schemas_for_prompt()
    return f"""
## Araçlar (Tooling)

Şu araçlara sahipsin (şema özeti JSON):
{schemas}

### Kullanım kuralları
- Kullanıcının isteğini **yalnızca bir araç** ile karşılayabiliyorsan, **normal doğal dil cevabı yazma**.
- Bunun yerine **yalnızca** şu biçimde tek bir blok üret:
  <tool_call>{{"name": "tool_name", "args": {{"param": "value"}}}}</tool_call>
- `name` kayıtlı araç adıyla birebir eşleşmeli; `args` şemadaki parametrelere uygun olmalı.
- **Araç gerekmiyorsa** doğrudan Türkçe, net bir cevap ver; `<tool_call>` kullanma.
- Araç çağrısından başka metin ekleme (açıklama, selamlama vb. yok).
""".strip()
