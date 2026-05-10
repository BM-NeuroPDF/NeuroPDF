import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import Optional
import logging

# Sadece kritik hataları görmek için yapılandırma
logger = logging.getLogger(__name__)

_JWT_INSECURE_DEFAULT = "fallback_secret_change_this"


def _parse_csv_list(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _environment_name() -> str:
    return (os.getenv("ENVIRONMENT") or os.getenv("ENV", "development")).lower()


def _allows_insecure_secret_defaults() -> bool:
    """DEBUG=true veya geliştirme/test ortamlarında zayıf varsayılan secret'lara izin verilir."""
    if os.getenv("DEBUG", "").lower() == "true":
        return True
    return _environment_name() in ("development", "dev", "local", "test")


def _is_production_environment() -> bool:
    return _environment_name() in ("production", "prod")


class Settings(BaseSettings):
    # --- API Configuration ---
    API_NAME: str = os.getenv("API_NAME", "PDF Project API")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    CORS_ALLOWED_ORIGINS_RAW: str = os.getenv(
        "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
    )
    CORS_ALLOWED_METHODS_RAW: str = os.getenv(
        "CORS_ALLOWED_METHODS", "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    )
    CORS_ALLOWED_HEADERS_RAW: str = os.getenv(
        "CORS_ALLOWED_HEADERS", "Authorization,Content-Type,X-Request-Id"
    )
    CORS_ALLOW_CREDENTIALS: bool = (
        os.getenv("CORS_ALLOW_CREDENTIALS", "true").lower() == "true"
    )
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
    SENTRY_ENV: str = os.getenv("SENTRY_ENV", os.getenv("ENVIRONMENT", "development"))
    SENTRY_TRACES_SAMPLE_RATE: str = os.getenv("SENTRY_TRACES_SAMPLE_RATE", "")
    GIT_SHA: str = os.getenv("GIT_SHA", "dev")
    METRICS_TOKEN: str = os.getenv("METRICS_TOKEN", "")
    METRICS_ALLOW_INSECURE_LOCAL: bool = (
        os.getenv("METRICS_ALLOW_INSECURE_LOCAL", "true").lower() == "true"
    )

    # --- JWT Configuration ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", _JWT_INSECURE_DEFAULT)
    ACCESS_TOKEN_EXPIRES_MIN: int = int(os.getenv("ACCESS_TOKEN_EXPIRES_MIN", "15"))
    REFRESH_TOKENS_ENABLED: bool = (
        os.getenv("REFRESH_TOKENS_ENABLED", "false").lower() == "true"
    )
    REFRESH_TOKEN_EXPIRES_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRES_DAYS", "14"))
    REFRESH_COOKIE_NAME: str = os.getenv("REFRESH_COOKIE_NAME", "refresh_token")
    REFRESH_COOKIE_SECURE: bool = (
        os.getenv("REFRESH_COOKIE_SECURE", "false").lower() == "true"
    )
    REFRESH_COOKIE_SAMESITE: str = os.getenv("REFRESH_COOKIE_SAMESITE", "lax")
    CALLBACK_SECRET: str = os.getenv(
        "CALLBACK_SECRET", os.getenv("INTERNAL_CALLBACK_SECRET", "")
    )
    INTERNAL_CALLBACK_SECRET: str = os.getenv(
        "INTERNAL_CALLBACK_SECRET", os.getenv("CALLBACK_SECRET", "")
    )
    CALLBACK_TIMESTAMP_SKEW_SEC: int = int(
        os.getenv("CALLBACK_TIMESTAMP_SKEW_SEC", "300")
    )
    CALLBACK_ALLOWED_CIDRS_RAW: str = os.getenv("CALLBACK_ALLOWED_CIDRS", "")
    JWT_EXPIRES_MIN: int = int(os.getenv("JWT_EXPIRES_MIN", "60"))

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

    # --- Supabase Configuration ---
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    USE_SUPABASE: bool = os.getenv("USE_SUPABASE", "false").lower() == "true"
    SUPABASE_DATABASE_URL: Optional[str] = os.getenv("SUPABASE_DATABASE_URL")
    LOCAL_DATABASE_URL: Optional[str] = os.getenv("LOCAL_DATABASE_URL")
    # USE_SUPABASE=false: avatar PNG'leri diskte saklanır (boşsa backend/static/avatars)
    LOCAL_AVATAR_STORAGE_ROOT: str = os.getenv("LOCAL_AVATAR_STORAGE_ROOT", "")

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
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    TRUSTED_PROXY_HOPS: int = int(os.getenv("TRUSTED_PROXY_HOPS", "0"))
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10

    # --- Email (SMTP, e.g. Gmail) & 2FA ---
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    OTP_EMAIL_TTL_SECONDS: int = 180
    VERIFY_2FA_MAX_FAILS: int = 3
    VERIFY_2FA_LOCKOUT_SECONDS: int = 180
    # Opt-in only: fixed OTP for local/E2E (never enable in production).
    E2E_MAGIC_OTP_ENABLED: bool = (
        os.getenv("E2E_MAGIC_OTP_ENABLED", "").lower() == "true"
    )
    E2E_MAGIC_OTP_EMAIL: Optional[str] = os.getenv("E2E_MAGIC_OTP_EMAIL")
    # CI: allow 123456 for every email when E2E_MAGIC_OTP_ENABLED=true (multi-user specs).
    E2E_MAGIC_OTP_ALL_USERS: bool = (
        os.getenv("E2E_MAGIC_OTP_ALL_USERS", "").lower() == "true"
    )

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

    def _effective_callback_secret(self) -> str:
        return (self.CALLBACK_SECRET or "").strip() or (
            self.INTERNAL_CALLBACK_SECRET or ""
        ).strip()

    def _has_database_configuration(self) -> bool:
        if self.DATABASE_URL and self.DATABASE_URL.strip():
            return True
        if self.USE_SUPABASE:
            if self.SUPABASE_DATABASE_URL and self.SUPABASE_DATABASE_URL.strip():
                return True
        else:
            if self.LOCAL_DATABASE_URL and self.LOCAL_DATABASE_URL.strip():
                return True
        return bool(self.DB_USER and self.DB_PASSWORD and self.DB_HOST)

    @model_validator(mode="after")
    def validate_critical_secrets(self):
        dev_relaxed = _allows_insecure_secret_defaults()

        # JWT_SECRET
        jwt_weak = (not self.JWT_SECRET.strip()) or (
            self.JWT_SECRET == _JWT_INSECURE_DEFAULT
        )
        if dev_relaxed:
            if jwt_weak:
                logger.warning(
                    "JWT_SECRET is unset or using the insecure development default; "
                    "set a strong secret in production-like environments."
                )
        else:
            if jwt_weak:
                raise ValueError(
                    "JWT_SECRET must be set to a secure non-default value when "
                    "DEBUG is not true and ENVIRONMENT is not development/dev/local/test."
                )

        # Callback HMAC (async summarize / AI callback)
        if dev_relaxed:
            if not self._effective_callback_secret():
                logger.warning(
                    "CALLBACK_SECRET / INTERNAL_CALLBACK_SECRET are unset; "
                    "signed AI callbacks will reject requests."
                )
        else:
            if not self._effective_callback_secret():
                raise ValueError(
                    "CALLBACK_SECRET or INTERNAL_CALLBACK_SECRET must be set to a "
                    "non-empty value outside development/debug environments."
                )

        # Redis URL (rate limiting, OTP, cache; prod/staging should not rely on implicit defaults)
        if dev_relaxed:
            if not (self.REDIS_URL and self.REDIS_URL.strip()):
                logger.warning(
                    "REDIS_URL is unset; Redis-backed features may be unavailable."
                )
        else:
            if not (self.REDIS_URL and self.REDIS_URL.strip()):
                raise ValueError(
                    "REDIS_URL must be set to a non-empty value when DEBUG is not "
                    "true and ENVIRONMENT is not development/dev/local/test."
                )

        # Database connectivity (SQLAlchemy / build_db_url)
        if dev_relaxed:
            if not self._has_database_configuration():
                logger.warning(
                    "No DATABASE_URL, LOCAL_DATABASE_URL / SUPABASE_DATABASE_URL, "
                    "or DB_USER+DB_PASSWORD+DB_HOST; database connection may fail."
                )
        else:
            if not self._has_database_configuration():
                raise ValueError(
                    "Database must be configured: set DATABASE_URL, or "
                    "LOCAL_DATABASE_URL (USE_SUPABASE=false), or SUPABASE_DATABASE_URL "
                    "(USE_SUPABASE=true), or DB_USER/DB_PASSWORD/DB_HOST."
                )

        # Ek üretim kontrolleri (ENVIRONMENT=production|prod)
        if _is_production_environment():
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
                raise ValueError(
                    "Missing required environment variables in production: "
                    + ", ".join(missing)
                )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",  # Load .env file automatically
        env_file_encoding="utf-8",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def CORS_ALLOWED_ORIGINS(self) -> list[str]:
        origins = _parse_csv_list(self.CORS_ALLOWED_ORIGINS_RAW)
        if origins:
            return origins
        return [self.FRONTEND_ORIGIN]

    @property
    def CORS_ALLOWED_METHODS(self) -> list[str]:
        methods = _parse_csv_list(self.CORS_ALLOWED_METHODS_RAW)
        return methods or ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

    @property
    def CORS_ALLOWED_HEADERS(self) -> list[str]:
        headers = _parse_csv_list(self.CORS_ALLOWED_HEADERS_RAW)
        return headers or ["Authorization", "Content-Type", "X-Request-Id"]

    @property
    def CALLBACK_ALLOWED_CIDRS(self) -> list[str]:
        return _parse_csv_list(self.CALLBACK_ALLOWED_CIDRS_RAW)


settings = Settings()
