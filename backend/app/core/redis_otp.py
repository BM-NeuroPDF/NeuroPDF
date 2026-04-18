"""Ephemeral login OTP storage in Redis (hashed code, TTL)."""

from __future__ import annotations

import asyncio
import logging

from ..config import settings
from ..redis_client import redis_client

logger = logging.getLogger(__name__)


class RedisOtpUnavailable(Exception):
    """OTP cannot be written to Redis (no client or command failed)."""


def _otp_key(user_id: str) -> str:
    return f"auth:otp:{user_id}"


def _setex_sync(user_id: str, otp_hash: str, ttl_seconds: int) -> None:
    key = _otp_key(user_id)
    redis_client.setex(key, ttl_seconds, otp_hash)


def _get_sync(user_id: str) -> str | None:
    key = _otp_key(user_id)
    return redis_client.get(key)


def _delete_sync(user_id: str) -> None:
    key = _otp_key(user_id)
    redis_client.delete(key)


async def set_redis_otp(
    user_id: str,
    otp_hash: str,
    ttl_seconds: int | None = None,
) -> None:
    if redis_client is None:
        logger.warning("redis_otp: Redis client unavailable, cannot store OTP")
        raise RedisOtpUnavailable
    ttl = (
        ttl_seconds
        if ttl_seconds is not None
        else max(60, int(settings.OTP_EMAIL_TTL_SECONDS))
    )
    try:
        await asyncio.to_thread(_setex_sync, user_id, otp_hash, ttl)
    except Exception:
        logger.warning("redis_otp: SETEX failed", exc_info=True)
        raise RedisOtpUnavailable from None


async def get_redis_otp(user_id: str) -> str | None:
    if redis_client is None:
        return None
    try:
        return await asyncio.to_thread(_get_sync, user_id)
    except Exception:
        logger.warning("redis_otp: GET failed", exc_info=True)
        return None


async def delete_redis_otp(user_id: str) -> None:
    if redis_client is None:
        return
    try:
        await asyncio.to_thread(_delete_sync, user_id)
    except Exception:
        logger.warning("redis_otp: DEL failed", exc_info=True)
