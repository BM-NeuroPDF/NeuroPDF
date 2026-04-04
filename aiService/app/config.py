import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import Optional


class Settings(BaseSettings):
    # Gemini (bulut LLM; LOCAL_LLM_URL ile Ollama/OpenAI uyumlu uç kullanılıyorsa boş olabilir)
    GEMINI_API_KEY: str = ""

    # Ollama OpenAI uyumlu API tabanı (örn. http://localhost:11434/v1). Ayarlıysa GEMINI zorunlu değil.
    LOCAL_LLM_URL: Optional[str] = None

    # Redis (Celery kuyruğu için şart - Docker'da "redis://redis_cache:6379" olur)
    REDIS_URL: str = "redis://localhost:6379"

    # --- Opsiyonel Alanlar (Boş bırakılabilir) ---

    # ElevenLabs (Eğer TTS kullanılacaksa gerekli, yoksa boş kalabilir)
    ELEVENLABS_API_KEY: Optional[str] = None

    # Dahili Servis Güvenliği (Backend -> AI Service iletişimi için)
    # Development'ta boş olabilir, production'da set edilmeli
    AI_SERVICE_API_KEY: str = ""

    # --- Pydantic Ayarları ---
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # .env dosyasında fazladan değişken varsa hata verme, görmezden gel.
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_production_settings(self):
        """Validate critical settings in production environment"""
        env = os.getenv("ENVIRONMENT", "development").lower()

        if env in ["production", "prod"]:
            has_cloud = bool((self.GEMINI_API_KEY or "").strip())
            has_local = bool((self.LOCAL_LLM_URL or "").strip())
            if not has_cloud and not has_local:
                raise RuntimeError(
                    "Production requires GEMINI_API_KEY and/or LOCAL_LLM_URL (Ollama OpenAI-compatible)."
                )

        return self


settings = Settings()
