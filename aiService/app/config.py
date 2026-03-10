import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import Optional

class Settings(BaseSettings):
    # --- Zorunlu Alanlar ---
    # Gemini (Özetleme ve Chat için şart)
    GEMINI_API_KEY: str
    
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
        extra="ignore" 
    )
    
    @model_validator(mode='after')
    def validate_production_settings(self):
        """Validate critical settings in production environment"""
        env = os.getenv("ENVIRONMENT", "development").lower()
        
        if env in ["production", "prod"]:
            if not self.GEMINI_API_KEY:
                raise RuntimeError("GEMINI_API_KEY is required in production")
        
        return self

settings = Settings()