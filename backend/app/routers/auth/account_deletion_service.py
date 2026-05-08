import logging

import hashlib
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from supabase import Client

from ...core import security
from ...core.redis_otp import RedisOtpUnavailable
from ...models import User
from ...redis_client import redis_client
from ...config import settings

from .legacy_constants import DELETION_OTP_TTL_SECONDS
from .password_legacy import _sha256_hex_equals_legacy_stored

logger = logging.getLogger(__name__)


def _deletion_otp_redis_key(user_id: str) -> str:
    return f"deletion_otp:{user_id}"


def _set_deletion_otp_in_redis(user_id: str, otp_hash: str) -> None:
    if redis_client is None:
        raise RedisOtpUnavailable()
    redis_client.setex(
        _deletion_otp_redis_key(user_id), DELETION_OTP_TTL_SECONDS, otp_hash
    )


def _get_deletion_otp_from_redis(user_id: str) -> str | None:
    if redis_client is None:
        return None
    try:
        raw = redis_client.get(_deletion_otp_redis_key(user_id))
    except Exception:
        logger.warning("deletion_otp: GET failed", exc_info=True)
        return None
    if raw is None:
        return None
    return raw.decode() if isinstance(raw, bytes) else str(raw)


def _delete_deletion_otp_from_redis(user_id: str) -> None:
    if redis_client is None:
        return
    try:
        redis_client.delete(_deletion_otp_redis_key(user_id))
    except Exception:
        logger.warning("deletion_otp: DEL failed", exc_info=True)


def _primary_auth_provider(user_id: str, supabase: Client, db: Session) -> str:
    if settings.USE_SUPABASE:
        auth_res = (
            supabase.table("user_auth")
            .select("provider")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return auth_res.data[0]["provider"] if auth_res.data else "local"
    row = (
        db.execute(
            text(
                """
                SELECT provider FROM user_auth
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
    return row["provider"] if row else "local"


def _execute_account_deletion(uid: str, supabase: Client, db: Session) -> dict:
    if settings.USE_SUPABASE:
        supabase.table("user_auth").delete().eq("user_id", uid).execute()
        supabase.table("user_settings").delete().eq("user_id", uid).execute()
        supabase.table("user_stats").delete().eq("user_id", uid).execute()
        supabase.table("user_avatars").delete().eq("user_id", uid).execute()
        supabase.table("users").delete().eq("id", uid).execute()
    else:
        user = db.get(User, uid)
        if user:
            db.delete(user)
            db.commit()
    return {"message": "Deleted"}


def _verify_password_for_account_deletion(
    user_id: str,
    password: str,
    supabase: Client,
    db: Session,
) -> None:
    """Require local password confirmation before destructive account deletion."""
    if settings.USE_SUPABASE:
        auth_res = (
            supabase.table("user_auth")
            .select("password_hash")
            .eq("user_id", user_id)
            .eq("provider", "local")
            .limit(1)
            .execute()
        )
        if not auth_res.data:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Account deletion requires a local password. "
                    "OAuth-only accounts are not supported on this endpoint."
                ),
            )
        stored_pw = auth_res.data[0].get("password_hash")
    else:
        row = (
            db.execute(
                text(
                    """
                    SELECT password_hash FROM user_auth
                    WHERE user_id = :uid AND provider = 'local'
                    ORDER BY id DESC
                    LIMIT 1
                    """
                ),
                {"uid": user_id},
            )
            .mappings()
            .first()
        )
        if not row:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Account deletion requires a local password. "
                    "OAuth-only accounts are not supported on this endpoint."
                ),
            )
        stored_pw = row["password_hash"]

    if not stored_pw:
        raise HTTPException(
            status_code=400,
            detail="No password set for this account. Cannot verify deletion.",
        )

    if stored_pw.startswith("$2b$") or stored_pw.startswith("$2a$"):
        if not security.verify_password(password, str(stored_pw)):
            raise HTTPException(status_code=401, detail="Invalid password")
    else:
        digest = hashlib.sha256(password.encode()).hexdigest()
        if not _sha256_hex_equals_legacy_stored(digest, str(stored_pw)):
            raise HTTPException(status_code=401, detail="Invalid password")
