import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
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
    USE_SUPABASE: bool = os.getenv("USE_SUPABASE", "false").lower() == "true"
    SUPABASE_DATABASE_URL: Optional[str] = os.getenv("SUPABASE_DATABASE_URL")
    LOCAL_DATABASE_URL: Optional[str] = os.getenv("LOCAL_DATABASE_URL")

    # --- Redis Configuration ---
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL")
    REDIS_HOST: str = os.getenv("REDIS_HOST", "redis_cache")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))

    # --- AI & Gemini & xAI Configuration ---
    AI_SERVICE_URL: str = os.getenv("AI_SERVICE_URL", "http://aiservice:8001")
    # Outgoing: backend -> AI Service (X-API-Key on summarize/chat/tts, etc.). Not for removed internal PDF routes.
    AI_SERVICE_API_KEY: Optional[str] = os.getenv("AI_SERVICE_API_KEY", "")
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    XAI_API_KEY: Optional[str] = os.getenv("XAI_API_KEY")
    HUGGINGFACE_API_KEY: Optional[str] = os.getenv(
        "HUGGINGFACE_API_KEY", ""
    )  # Opsiyonel, rate limit için önerilir

    # --- User & File Limits ---
    MAX_GUEST_USAGE: int = int(os.getenv("MAX_GUEST_USAGE", "3"))
    MAX_FILE_SIZE_GUEST_MB: int = int(os.getenv("MAX_FILE_SIZE_GUEST_MB", "5"))
    MAX_FILE_SIZE_USER_MB: int = int(os.getenv("MAX_FILE_SIZE_USER_MB", "7"))

    # --- Database Configuration ---
    DB_USER: Optional[str] = os.getenv("DB_USER")
    DB_PASSWORD: Optional[str] = os.getenv("DB_PASSWORD")
    DB_HOST: Optional[str] = os.getenv("DB_HOST")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_NAME: str = os.getenv("DB_NAME", "postgres")
    DB_SSLMODE: str = os.getenv("DB_SSLMODE", "require")
    DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")

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

    @model_validator(mode="after")
    def validate_production_settings(self):
        """Validate critical settings in production environment"""
        env = os.getenv("ENVIRONMENT", "development").lower()

        # JWT_SECRET validation
        if self.JWT_SECRET == "fallback_secret_change_this":
            if env in ["production", "prod"]:
                raise RuntimeError(
                    "JWT_SECRET must be set to a secure value in production! "
                    "Do not use the default fallback secret."
                )

        # Production environment variable validation
        if env in ["production", "prod"]:
            required_vars = [
                "JWT_SECRET",
                "SUPABASE_URL",
                "SUPABASE_KEY",
                "DB_USER",
                "DB_PASSWORD",
                "DB_HOST",
            ]
            missing = [var for var in required_vars if not os.getenv(var)]
            if missing:
                raise RuntimeError(
                    f"Missing required environment variables in production: {', '.join(missing)}"
                )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",  # Load .env file automatically
        env_file_encoding="utf-8",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
