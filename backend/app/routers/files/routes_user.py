"""User stats and LLM preference routes under /files."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...db import Client, get_db, get_supabase
from ...deps import get_current_user
from ...models import User, UserStatsResponse
from ...observability.cache_logger import log_cache
from ...rate_limit import check_rate_limit
from ...redis_client import (
    GLOBAL_STATS_CACHE_KEY,
    GLOBAL_STATS_CACHE_TTL_SEC,
    USER_STATS_CACHE_TTL_SEC,
    user_stats_cache_key,
)
from ...services.files.metadata_service import (
    global_stats_payload,
    map_role_name_db,
    user_stats_cache_payload,
)

from . import _legacy as _legacy_module

logger = logging.getLogger(__name__)

router = APIRouter(tags=["files"])


class UpdateLlmChoiceRequest(BaseModel):
    provider: str  # "local" veya "cloud"


@router.get("/user/llm-choice")
async def get_llm_choice(
    current_user: dict = Depends(get_current_user),
    db: Optional[Session] = Depends(get_db),
):
    """
    Kullanıcının mevcut LLM tercihini döndürür.
    """
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if db is None:
            # DB bağlantısı yoksa default değeri döndür
            logger.warning(
                "Database connection unavailable, returning default LLM choice"
            )
            return {"provider": "local", "choice_id": 0}

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            # Kullanıcı bulunamazsa default değeri döndür
            return {"provider": "local", "choice_id": 0}

        # llm_choice_id: 0 = local llm, 1 = cloud llm (llm_choices seed migration)
        choice_id = getattr(user, "llm_choice_id", 0)
        provider = "cloud" if choice_id == 1 else "local"

        return {"provider": provider, "choice_id": choice_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM choice get error: {e}", exc_info=True)
        # Hata durumunda default değeri döndür
        return {"provider": "local", "choice_id": 0}


@router.post("/user/update-llm")
async def update_llm_choice(
    req: UpdateLlmChoiceRequest,
    current_user: dict = Depends(get_current_user),
    db: Optional[Session] = Depends(get_db),
):
    """
    Kullanıcının varsayılan LLM tercihini günceller.
    provider: 'local' -> 0
    provider: 'cloud' -> 1
    """
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if db is None:
            raise HTTPException(
                status_code=503,
                detail="Veritabanı bağlantısı şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
            )

        # Provider string'ini ID'ye çevir (llm_choices: 0=local, 1=cloud)
        choice_id = 1 if req.provider == "cloud" else 0

        # Kullanıcıyı bul ve güncelle
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.llm_choice_id = choice_id
        db.commit()

        return {"status": "success", "provider": req.provider, "choice_id": choice_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM update error: {e}", exc_info=True)
        if db:
            db.rollback()
        raise HTTPException(status_code=500, detail="Tercih güncellenemedi")


@router.get("/user/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    """Giriş yapmış kullanıcının istatistiklerini ve rolünü (Standart, Pro, Admin) getirir."""
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        cache_key = user_stats_cache_key(user_id)
        cached = _legacy_module.stats_cache_get_json(cache_key)
        if cached is not None and isinstance(cached, dict):
            try:
                log_cache(
                    "user_stats_redis",
                    cache_key,
                    True,
                    ttl=USER_STATS_CACHE_TTL_SEC,
                    extra={"endpoint": "user_stats"},
                )
                return UserStatsResponse(
                    summary_count=int(cached.get("summary_count", 0)),
                    tools_count=int(cached.get("tools_count", 0)),
                    role=str(cached.get("role", "Standart")),
                )
            except Exception:
                logger.debug("user_stats cache parse failed, refetching", exc_info=True)

        log_cache(
            "user_stats_redis",
            cache_key,
            False,
            ttl=USER_STATS_CACHE_TTL_SEC,
            extra={"endpoint": "user_stats"},
        )
        user_stats = await _legacy_module.stats_repo.get_user_stats(
            user_id=user_id,
            db=db,
            supabase=supabase,
        )

        role_name = map_role_name_db(user_stats.role_name_db)

        body = UserStatsResponse(
            summary_count=user_stats.summary_count,
            tools_count=user_stats.tools_count,
            role=role_name,  # Admin, Pro veya Standart dönecek
        )
        _legacy_module.stats_cache_set_json(
            cache_key, user_stats_cache_payload(user_stats), USER_STATS_CACHE_TTL_SEC
        )
        return body

    except Exception as e:
        print(f"❌ İstatistik hatası: {str(e)}")
        # Genel hatada frontend bozulmasın
        return UserStatsResponse(summary_count=0, tools_count=0, role="Standart")


@router.get("/global-stats")
async def get_global_stats(
    request: Request,
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    """Ana sayfa için tüm kullanıcıların toplam istatistiklerini döner. Auth gerektirmez (Public)."""
    from app.routers.files import PUBLIC_LIMITS

    for rule in PUBLIC_LIMITS.get("global_stats", []):
        if not check_rate_limit(
            request, rule.key, rule.limit, rule.window_seconds, rule.category
        ):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(rule.window_seconds)},
            )
    try:
        gkey = GLOBAL_STATS_CACHE_KEY
        gttl = GLOBAL_STATS_CACHE_TTL_SEC
        cached = _legacy_module.stats_cache_get_json(gkey)
        if cached is not None and isinstance(cached, dict):
            log_cache(
                "global_stats_redis",
                gkey,
                True,
                ttl=gttl,
                extra={"endpoint": "global_stats"},
            )
            return {
                "total_users": int(cached.get("total_users", 0)),
                "total_processed": int(cached.get("total_processed", 0)),
                "total_ai_summaries": int(cached.get("total_ai_summaries", 0)),
            }

        log_cache(
            "global_stats_redis",
            gkey,
            False,
            ttl=gttl,
            extra={"endpoint": "global_stats"},
        )
        global_stats = await _legacy_module.stats_repo.get_global_stats(
            db=db, supabase=supabase
        )

        payload = global_stats_payload(global_stats)
        _legacy_module.stats_cache_set_json(gkey, payload, gttl)
        return payload

    except Exception as e:
        print(f"❌ Global stats error: {str(e)}")
        # Hata olsa bile frontend bozulmasın diye 0 dön
        return {"total_users": 0, "total_processed": 0, "total_ai_summaries": 0}
