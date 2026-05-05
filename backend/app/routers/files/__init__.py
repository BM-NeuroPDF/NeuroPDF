from fastapi import APIRouter

from app.redis_client import redis_client as redis_client
from app.redis_client import stats_cache_get_json as stats_cache_get_json
from app.rate_limit import RateLimitRule

from . import _legacy as _legacy_module

PUBLIC_LIMITS = {
    "callback": [
        RateLimitRule("ip_rpm", limit=20, window_seconds=60, category="critical")
    ],
    "markdown_to_pdf": [
        RateLimitRule("ip_rpm", limit=10, window_seconds=60, category="default")
    ],
    "summarize_guest": [
        RateLimitRule("ip_rpm", limit=10, window_seconds=60, category="default")
    ],
    "global_stats": [
        RateLimitRule("ip_rpm", limit=30, window_seconds=60, category="low")
    ],
}

from .routes_user import (
    get_global_stats,
    get_llm_choice,
    get_user_stats,
    router as routes_user_router,
    update_llm_choice,
)

_composite_router = APIRouter(prefix="/files", tags=["files"])
_composite_router.include_router(routes_user_router)
_composite_router.include_router(_legacy_module.router)

from ._legacy import *  # noqa: F401,F403

router = _composite_router

stats_repo = _legacy_module.stats_repo

__all__ = [
    "router",
    "PUBLIC_LIMITS",
    "redis_client",
    "stats_cache_get_json",
    "stats_repo",
    "get_global_stats",
    "get_llm_choice",
    "get_user_stats",
    "update_llm_choice",
]
