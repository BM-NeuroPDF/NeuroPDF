# app/redis_client.py
from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis

from .config import settings

logger = logging.getLogger(__name__)

redis_client = None

try:
    # Redis bağlantısı oluştur
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=0,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        # Bağlantı havuzu ayarları
        max_connections=10,
        retry_on_timeout=True,
    )

    # Bağlantıyı test et
    redis_client.ping()
    logger.info("Redis connection successful!")
    logger.info(f"Redis info: {settings.REDIS_HOST}:{settings.REDIS_PORT}")

except redis.exceptions.ConnectionError as e:
    logger.warning(f"Redis connection failed: {e}")
    logger.warning(f"Trying to connect to: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    logger.warning("Guest user limiting will be disabled")
    redis_client = None
except Exception as e:
    logger.error(f"Redis error: {e}", exc_info=True)
    redis_client = None


def get_redis() -> redis.Redis:
    """Redis client dependency"""
    if redis_client is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail="Redis service unavailable")
    return redis_client


def test_redis_connection():
    """Redis bağlantısını test et (debug için)"""
    if redis_client:
        try:
            info = redis_client.info()
            logger.info(f"Redis version: {info.get('redis_version')}")
            logger.info(f"Connected clients: {info.get('connected_clients')}")
            return True
        except Exception as e:
            logger.error(f"Redis test failed: {e}", exc_info=True)
            return False
    else:
        logger.warning("Redis client not initialized")
        return False


# --- Public stats API cache (files router) ---
GLOBAL_STATS_CACHE_KEY = "global_stats"
USER_STATS_CACHE_TTL_SEC = 60
GLOBAL_STATS_CACHE_TTL_SEC = 300


def user_stats_cache_key(user_id: str) -> str:
    return f"user_stats:{user_id}"


def stats_cache_get_json(key: str) -> Optional[dict[str, Any]]:
    """Redis'ten JSON nesne okur; yoksa veya hata varsa None."""
    if redis_client is None:
        return None
    try:
        raw = redis_client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug(
            "stats_cache_get_json failed for key=%s: %s", key, e, exc_info=True
        )
        return None


def stats_cache_set_json(key: str, payload: dict[str, Any], ttl_seconds: int) -> None:
    if redis_client is None:
        return
    try:
        redis_client.setex(key, ttl_seconds, json.dumps(payload))
    except Exception as e:
        logger.warning(
            "stats_cache_set_json failed for key=%s: %s", key, e, exc_info=True
        )


def stats_cache_delete_keys(*keys: str) -> None:
    if redis_client is None or not keys:
        return
    try:
        redis_client.delete(*keys)
    except Exception as e:
        logger.warning("stats_cache_delete_keys failed: %s", e, exc_info=True)


def invalidate_stats_caches_for_user(user_id: str) -> None:
    """user_stats ve global_stats özet önbelleğini temizler (usage güncellemesi sonrası)."""
    if not user_id or str(user_id).startswith("guest"):
        return
    stats_cache_delete_keys(user_stats_cache_key(user_id), GLOBAL_STATS_CACHE_KEY)


# Başlangıçta test et
if redis_client:
    test_redis_connection()
