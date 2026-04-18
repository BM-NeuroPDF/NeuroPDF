# app/rate_limit.py
"""Simple rate limiting middleware using Redis"""

from fastapi import Request
from .redis_client import redis_client
from .config import settings


def check_rate_limit(request: Request, key: str, limit: int, window: int = 60) -> bool:
    """
    Rate limit kontrolü yapar.
    Returns: True if allowed, False if rate limit exceeded
    """
    if not settings.RATE_LIMIT_ENABLED or redis_client is None:
        return True  # Rate limiting kapalıysa veya Redis yoksa izin ver

    try:
        # IP adresini al
        client_ip = request.client.host if request.client else "unknown"
        redis_key = f"ratelimit:{key}:{client_ip}"

        # Mevcut sayıyı al
        current = redis_client.get(redis_key)

        if current is None:
            # İlk istek, sayacı başlat
            redis_client.setex(redis_key, window, 1)
            return True
        else:
            current_count = int(current)
            if current_count >= limit:
                # Rate limit aşıldı - log security event
                try:
                    from .security_logger import log_rate_limit_exceeded

                    log_rate_limit_exceeded(
                        ip_address=client_ip, endpoint=key, request=request
                    )
                except Exception:
                    pass  # Don't fail if logging fails
                return False
            else:
                # Sayacı artır
                redis_client.incr(redis_key)
                return True
    except Exception as e:
        # Redis hatası durumunda izin ver (fail-open)
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Rate limit check failed: {e}")
        return True


def _verify_2fa_fail_key(request: Request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"auth:verify2fa:fail:{client_ip}"


def is_2fa_verify_locked(request: Request) -> bool:
    """True when this client IP has reached max failed OTP attempts in the lockout window."""
    if not settings.RATE_LIMIT_ENABLED or redis_client is None:
        return False
    try:
        raw = redis_client.get(_verify_2fa_fail_key(request))
        if raw is None:
            return False
        return int(raw) >= settings.VERIFY_2FA_MAX_FAILS
    except Exception:
        return False


def record_2fa_verify_failure(request: Request) -> None:
    if not settings.RATE_LIMIT_ENABLED or redis_client is None:
        return
    try:
        key = _verify_2fa_fail_key(request)
        n = redis_client.incr(key)
        if n == 1:
            redis_client.expire(key, settings.VERIFY_2FA_LOCKOUT_SECONDS)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("2FA failure counter update failed: %s", e)


def clear_2fa_verify_failures(request: Request) -> None:
    if not settings.RATE_LIMIT_ENABLED or redis_client is None:
        return
    try:
        redis_client.delete(_verify_2fa_fail_key(request))
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("2FA failure counter clear failed: %s", e)
