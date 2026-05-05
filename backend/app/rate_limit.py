# app/rate_limit.py
"""Rate limiting with Redis + degraded fallback policies."""

from dataclasses import dataclass
from collections import OrderedDict
from threading import Lock
import math
import os
import time

from fastapi import HTTPException, Request
from .redis_client import redis_client
from .config import settings
from .observability.cache_logger import log_cache, log_cache_backend_error
from .observability.metrics import observe_rate_limit_decision, set_redis_up

RateLimitCategory = str  # "critical" | "default" | "low"

_LOCAL_DEGRADED_LOCK = Lock()
_LOCAL_DEGRADED_MAX_KEYS = int(os.getenv("RATE_LIMIT_LOCAL_MAX_KEYS", "4096"))
_LOCAL_DEGRADED: "OrderedDict[str, tuple[int, float]]" = OrderedDict()

_REDIS_BREAKER_LOCK = Lock()
_REDIS_FAIL_COUNT = 0
_REDIS_BREAKER_OPEN_UNTIL = 0.0
_REDIS_BREAKER_THRESHOLD = int(os.getenv("RATE_LIMIT_REDIS_BREAKER_FAILS", "3"))
_REDIS_BREAKER_OPEN_SECONDS = int(os.getenv("RATE_LIMIT_REDIS_BREAKER_SECONDS", "30"))


@dataclass
class RateLimitRule:
    key: str
    limit: int
    window_seconds: int = 60
    category: RateLimitCategory = "default"


def _now() -> float:
    return time.time()


def _redis_breaker_is_open(now: float) -> bool:
    with _REDIS_BREAKER_LOCK:
        return now < _REDIS_BREAKER_OPEN_UNTIL


def _mark_redis_success() -> None:
    global _REDIS_FAIL_COUNT, _REDIS_BREAKER_OPEN_UNTIL
    with _REDIS_BREAKER_LOCK:
        _REDIS_FAIL_COUNT = 0
        _REDIS_BREAKER_OPEN_UNTIL = 0.0


def _mark_redis_failure(now: float) -> None:
    global _REDIS_FAIL_COUNT, _REDIS_BREAKER_OPEN_UNTIL
    with _REDIS_BREAKER_LOCK:
        _REDIS_FAIL_COUNT += 1
        if _REDIS_FAIL_COUNT >= _REDIS_BREAKER_THRESHOLD:
            _REDIS_BREAKER_OPEN_UNTIL = now + _REDIS_BREAKER_OPEN_SECONDS
            _REDIS_FAIL_COUNT = 0


def _emit_sentry_redis_unreachable(endpoint_key: str, category: RateLimitCategory) -> None:
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category="rate_limit",
            level="warning",
            message="Redis unreachable in rate limiter",
            data={"endpoint_key": endpoint_key, "category": category},
        )
        sentry_sdk.capture_message(
            "Redis unreachable in rate limiter", level="warning"
        )
    except Exception:
        pass


def _local_degraded_allow(redis_key: str, limit: int, window: int) -> bool:
    # Default degraded mode: tighter local process-level limits.
    degraded_limit = max(1, int(math.ceil(limit / 2)))
    now = _now()
    with _LOCAL_DEGRADED_LOCK:
        count, expires_at = _LOCAL_DEGRADED.get(redis_key, (0, now + window))
        if now >= expires_at:
            count, expires_at = 0, now + window
        if count >= degraded_limit:
            _LOCAL_DEGRADED[redis_key] = (count, expires_at)
            _LOCAL_DEGRADED.move_to_end(redis_key)
            return False
        _LOCAL_DEGRADED[redis_key] = (count + 1, expires_at)
        _LOCAL_DEGRADED.move_to_end(redis_key)
        while len(_LOCAL_DEGRADED) > _LOCAL_DEGRADED_MAX_KEYS:
            _LOCAL_DEGRADED.popitem(last=False)
        return True


def _handle_redis_unavailable(
    *,
    category: RateLimitCategory,
    endpoint_key: str,
    redis_key: str,
    limit: int,
    window: int,
) -> bool:
    set_redis_up(False)
    log_cache_backend_error(
        "rate_limit",
        redis_key,
        error="redis_unreachable",
        extra={"endpoint_key": endpoint_key, "category": category},
    )
    if category == "critical":
        observe_rate_limit_decision(category, "fail_closed")
        _emit_sentry_redis_unreachable(endpoint_key, category)
        raise HTTPException(
            status_code=503,
            detail="Rate limit backend temporarily unavailable.",
            headers={"Retry-After": str(window)},
        )
    if category == "low":
        observe_rate_limit_decision(category, "allow_degraded")
        _emit_sentry_redis_unreachable(endpoint_key, category)
        return True
    # default
    allowed = _local_degraded_allow(redis_key, limit, window)
    observe_rate_limit_decision(category, "allow_degraded" if allowed else "deny_degraded")
    return allowed


def check_rate_limit(
    request: Request,
    key: str,
    limit: int,
    window: int = 60,
    category: RateLimitCategory = "default",
) -> bool:
    """
    Rate limit kontrolü yapar (Redis + degraded fallback).
    Returns: True if allowed, False if rate limit exceeded
    """
    if not settings.RATE_LIMIT_ENABLED:
        return True

    client_ip = request.client.host if request.client else "unknown"
    redis_key = f"ratelimit:{key}:{client_ip}"
    now = _now()

    if redis_client is None or _redis_breaker_is_open(now):
        return _handle_redis_unavailable(
            category=category,
            endpoint_key=key,
            redis_key=redis_key,
            limit=limit,
            window=window,
        )

    try:
        set_redis_up(True)
        # Mevcut sayıyı al
        current = redis_client.get(redis_key)

        if current is None:
            # İlk istek, sayacı başlat
            redis_client.setex(redis_key, window, 1)
            _mark_redis_success()
            observe_rate_limit_decision(category, "allow")
            return True
        else:
            current_count = int(current)
            if current_count >= limit:
                log_cache(
                    "rate_limit",
                    redis_key,
                    hit=False,
                    extra={
                        "rule_key": key,
                        "limit": limit,
                        "window_seconds": window,
                    },
                )
                # Rate limit aşıldı - log security event
                try:
                    from .security_logger import log_rate_limit_exceeded

                    log_rate_limit_exceeded(
                        ip_address=client_ip, endpoint=key, request=request
                    )
                except Exception:
                    pass  # Don't fail if logging fails
                _mark_redis_success()
                observe_rate_limit_decision(category, "deny")
                return False
            else:
                # Sayacı artır
                redis_client.incr(redis_key)
                _mark_redis_success()
                observe_rate_limit_decision(category, "allow")
                return True
    except Exception as e:
        _mark_redis_failure(now)
        set_redis_up(False)
        log_cache_backend_error("rate_limit", redis_key, error=str(e))
        return _handle_redis_unavailable(
            category=category,
            endpoint_key=key,
            redis_key=redis_key,
            limit=limit,
            window=window,
        )


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
