from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
import time

from fastapi import HTTPException, Request, status

from .config import settings
from .redis_client import redis_client

logger = logging.getLogger(__name__)


def _body_sha256_hex(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _expected_signature(secret: str, request: Request, timestamp: str, body: bytes) -> str:
    canonical = (
        f"{request.method.upper()}|{request.url.path}|{timestamp}|{_body_sha256_hex(body)}"
    )
    return hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()


def _verify_timestamp(timestamp_raw: str) -> int:
    try:
        ts = int(timestamp_raw)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid callback timestamp.",
        ) from exc

    now = int(time.time())
    skew = int(settings.CALLBACK_TIMESTAMP_SKEW_SEC)
    if abs(now - ts) > skew:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expired callback timestamp.",
        )
    return ts


def _verify_ip_allowlist(request: Request) -> None:
    cidrs = settings.CALLBACK_ALLOWED_CIDRS
    if not cidrs:
        return

    host = request.client.host if request.client else None
    if not host:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Callback source IP not available.",
        )

    try:
        client_ip = ipaddress.ip_address(host)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Callback source IP is invalid.",
        ) from exc

    for cidr in cidrs:
        try:
            if client_ip in ipaddress.ip_network(cidr, strict=False):
                return
        except ValueError:
            logger.warning("Invalid CALLBACK_ALLOWED_CIDRS entry ignored: %s", cidr)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Callback source IP is not allowed.",
    )


def _verify_replay(signature: str) -> None:
    if redis_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Callback verification temporarily unavailable.",
        )

    ttl = max(1, int(settings.CALLBACK_TIMESTAMP_SKEW_SEC) * 2)
    replay_key = f"callback:replay:{signature}"

    try:
        created = redis_client.set(replay_key, "1", nx=True, ex=ttl)
    except Exception as exc:
        logger.error("Callback replay verification failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Callback verification temporarily unavailable.",
        ) from exc

    if not created:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Replay callback detected.",
        )


async def verify_callback_signature(request: Request) -> None:
    """Verify callback request via CIDR allowlist + timestamped HMAC + replay guard."""
    secret = (settings.CALLBACK_SECRET or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Callback secret is not configured.",
        )

    _verify_ip_allowlist(request)

    timestamp = (request.headers.get("X-Callback-Timestamp") or "").strip()
    signature = (request.headers.get("X-Callback-Signature") or "").strip().lower()
    body = await request.body()

    # One-version backward compatibility for legacy secret-only callbacks.
    legacy_secret = (request.headers.get("X-Callback-Secret") or "").strip()
    if not timestamp or not signature:
        if legacy_secret and hmac.compare_digest(legacy_secret, secret):
            logger.warning(
                "Deprecated callback auth accepted: X-Callback-Secret only. "
                "Please migrate to X-Callback-Timestamp + X-Callback-Signature."
            )
            return
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing callback signature headers.",
        )

    _verify_timestamp(timestamp)
    expected = _expected_signature(secret, request, timestamp, body)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid callback signature.",
        )

    _verify_replay(signature)
