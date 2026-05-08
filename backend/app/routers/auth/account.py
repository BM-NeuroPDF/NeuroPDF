from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from supabase import Client

from app.config import settings
from app.db import get_db, get_supabase
from app.deps import get_current_user as get_current_user_dep
from app.redis_client import (
    AUTH_ME_CACHE_TTL_SEC,
    auth_me_cache_key,
    stats_cache_get_json,
    stats_cache_set_json,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _normalize_me_payload_for_cache(payload: dict[str, Any]) -> dict[str, Any]:
    """Redis JSON için datetime vb. tipleri serileştirir."""
    out = dict(payload)
    ca = out.get("created_at")
    if ca is not None and hasattr(ca, "isoformat"):
        out["created_at"] = ca.isoformat()
    return out


@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    user_id = current_user["sub"]
    cache_key = auth_me_cache_key(user_id)
    cached = stats_cache_get_json(cache_key)
    if cached is not None:
        return cached

    if settings.USE_SUPABASE:
        user_res = (
            supabase.table("users")
            .select("id,username,created_at")
            .eq("id", user_id)
            .execute()
        )
        if not user_res.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = user_res.data[0]

        settings_res = (
            supabase.table("user_settings")
            .select("eula_accepted")
            .eq("user_id", user_id)
            .execute()
        )
        prefs = settings_res.data[0] if settings_res.data else {}

        auth_res = (
            supabase.table("user_auth")
            .select("provider, provider_key")
            .eq("user_id", user_id)
            .execute()
        )
        provider = auth_res.data[0]["provider"] if auth_res.data else "local"
        email = auth_res.data[0]["provider_key"] if auth_res.data else None

        payload = {
            "user_id": user["id"],
            "email": email,
            "username": user.get("username"),
            "provider": provider,
            "eula_accepted": prefs.get("eula_accepted"),
            "created_at": user.get("created_at"),
        }
        stats_cache_set_json(
            cache_key, _normalize_me_payload_for_cache(payload), AUTH_ME_CACHE_TTL_SEC
        )
        return payload

    user_row = (
        db.execute(
            text("SELECT id, username FROM users WHERE id = :uid LIMIT 1"),
            {"uid": user_id},
        )
        .mappings()
        .first()
    )
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    settings_row = (
        db.execute(
            text(
                """
                SELECT eula_accepted FROM user_settings
                WHERE user_id = :uid LIMIT 1
                """
            ),
            {"uid": user_id},
        )
        .mappings()
        .first()
    )
    prefs = {"eula_accepted": settings_row["eula_accepted"]} if settings_row else {}

    auth_row = (
        db.execute(
            text(
                """
                SELECT provider, provider_key FROM user_auth
                WHERE user_id = :uid
                ORDER BY id ASC
                LIMIT 1
                """
            ),
            {"uid": user_id},
        )
        .mappings()
        .first()
    )
    provider = auth_row["provider"] if auth_row else "local"
    email = auth_row["provider_key"] if auth_row else None

    payload = {
        "user_id": user_row["id"],
        "email": email,
        "username": user_row.get("username"),
        "provider": provider,
        "eula_accepted": prefs.get("eula_accepted"),
        "created_at": None,
    }
    stats_cache_set_json(
        cache_key, _normalize_me_payload_for_cache(payload), AUTH_ME_CACHE_TTL_SEC
    )
    return payload
