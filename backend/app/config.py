import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import logging

# Sadece kritik hataları görmek için yapılandırma
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    # --- API Configuration ---
    API_NAME: str = os.getenv("API_NAME", "PDF Project API")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

    # --- JWT Configuration ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", "fallback_secret_change_this")
    JWT_EXPIRES_MIN: int = int(os.getenv("JWT_EXPIRES_MIN", "60"))

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # --- Supabase Configuration ---
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # --- Redis Configuration ---
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL")
    REDIS_HOST: str = os.getenv("REDIS_HOST", "redis_cache")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))

    # --- AI & Gemini Configuration ---
    AI_SERVICE_URL: str = os.getenv("AI_SERVICE_URL", "http://aiservice:8001")
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")

    # --- User & File Limits ---
    MAX_GUEST_USAGE: int = int(os.getenv("MAX_GUEST_USAGE", "3"))
    MAX_FILE_SIZE_GUEST_MB: int = int(os.getenv("MAX_FILE_SIZE_GUEST_MB", "5"))
    MAX_FILE_SIZE_USER_MB: int = int(os.getenv("MAX_FILE_SIZE_USER_MB", "7"))

    # --- Rate Limiting ---
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.REDIS_URL and self.REDIS_URL.startswith("redis://"):
            try:
                clean_url = self.REDIS_URL.replace("redis://", "")
                if ":" in clean_url:
                    host, port_part = clean_url.split(":", 1)
                    self.REDIS_HOST = host
                    self.REDIS_PORT = int(port_part.split("/")[0])
            except Exception:
                pass

    model_config = SettingsConfigDict(
        env_file=None,
        env_prefix="",
        case_sensitive=False,
        extra="ignore"
    )

settings = Settings()