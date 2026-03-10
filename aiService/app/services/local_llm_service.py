import os
import json
import re
import ollama


OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")

# Metin uzunluk limitleri (token taşmasını önlemek için)
MAX_INPUT_CHARS = 12000  # ~3000 token, num_ctx=8192 ile güvenli alan bırakır


def _truncate_text(text: str, max_chars: int = MAX_INPUT_CHARS) -> str:
    """Metni güvenli uzunluğa kırpar."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[... metin kırpıldı ...]"


def analyze_text_with_local_llm(text: str, task: str = "summarize", instruction: str = "", history: list = None) -> dict:
    """
    task:
      - summarize: tek adımda düzelt + özetle (optimize edilmiş)
      - chat: gelen prompt'u direkt cevapla (PDF chat gibi)
    
    history: Chat geçmişi (list of dicts with "role" and "content" keys)
             Örnek: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    """
    client = ollama.Client(host=OLLAMA_HOST)

    if task == "chat":
        # Chat için history desteği ile
        system_prompt = instruction or "Türkçe cevap ver."
        messages = [{"role": "system", "content": system_prompt}]
        
        # History varsa ekle (son 10 mesajı al, context window'u aşmamak için)
        if history:
            # Son 10 mesajı al (context window limiti için)
            recent_history = history[-10:] if len(history) > 10 else history
            for turn in recent_history:
                # Ollama için role'leri kontrol et (user, assistant, system)
                role = turn.get("role", "user")
                if role not in ["user", "assistant", "system"]:
                    role = "user"  # Geçersiz role'ler için default
                messages.append({"role": role, "content": turn.get("content", "")})
        
        # Mevcut kullanıcı mesajını ekle
        # Metni kırpma - history ile birlikte gönderiyoruz, truncation yukarıda yapıldı
        user_message = text if len(text) <= MAX_INPUT_CHARS else _truncate_text(text)
        messages.append({"role": "user", "content": user_message})
        
        try:
            resp = client.chat(
                model=OLLAMA_MODEL,
                messages=messages,
                options={"temperature": 0.3, "num_ctx": 8192},
            )
            answer = resp["message"]["content"]
            return {"answer": answer}
        except Exception as e:
            return {"answer": f"Local LLM hatası: {str(e)}"}
    
    # Metni güvenli uzunluğa kırp (summarize için)
    text = _truncate_text(text)

    # ==========================================
    # SUMMARIZE: Tek adımda düzelt + özetle (2 adımdan optimize edildi)
    # Eskiden 2 ayrı LLM çağrısı yapılıyordu (düzeltme + özet = ~14 dk)
    # Artık tek çağrı ile hem düzeltme hem özet yapılıyor (~7 dk)
    # ==========================================

    system_prompt = """Sen yetenekli bir Türkçe dil uzmanı ve özetleme asistanısın.
Görevin iki aşamalı:
1. Metindeki yazım hatalarını düzelt (örn: 'şeuler' -> 'şeyler', 'gidiyom' -> 'gidiyorum')
2. Düzeltilmiş metni akıcı ve anlamlı bir İstanbul Türkçesi ile özetle.

Sadece özeti yaz. Başka açıklama yapma."""

    user_prompt = f"""Aşağıdaki metni önce yazım hatalarını düzelterek, ardından güzel bir Türkçe ile özetle.
Sadece özet metnini döndür, başka bir şey yazma.

METİN:
{text}"""

    try:
        resp = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            options={"temperature": 0.3, "num_ctx": 8192},
        )

        final_summary = resp["message"]["content"]
        return {"summary": final_summary, "corrections": []}

    except Exception as e:
        return {"summary": f"Analiz sırasında hata oluştu: {str(e)}", "corrections": []}
