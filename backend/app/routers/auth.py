import logging
import hashlib
import hmac
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import PlainTextResponse
from supabase import Client
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..core import security
from ..core.redis_otp import (
    RedisOtpUnavailable,
    delete_redis_otp,
    get_redis_otp,
    set_redis_otp,
)
from ..schemas import auth as auth_schemas
from ..services import auth_service
from ..services.email_service import send_deletion_otp_email, send_login_otp_email
from ..utils import helpers
from ..utils.client_ip import get_client_ip
from ..db import get_supabase, get_db
from ..redis_client import redis_client
from ..deps import get_current_user as get_current_user_dep
from ..rate_limit import (
    check_rate_limit,
    is_2fa_verify_locked,
    record_2fa_verify_failure,
    clear_2fa_verify_failures,
)
from ..repositories.user_repo import UserRepository
from ..config import settings
from ..models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

user_repo = UserRepository()


def _sha256_hex_equals_legacy_stored(candidate_hex: str, stored_pw: str) -> bool:
    """Constant-time compare for legacy SHA-256 hex passwords (length mismatch → false)."""
    try:
        return hmac.compare_digest(candidate_hex, str(stored_pw))
    except ValueError:
        return False


@router.post("/google", response_model=auth_schemas.AuthOut)
def google_login(
    request: Request,
    payload: auth_schemas.GoogleExchangeIn,
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(
        request, "auth:google", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    try:
        info = auth_service.verify_google_token(payload.id_token)
    except Exception:
        logger.exception("Google token verification failed")
        raise HTTPException(
            status_code=401, detail="Invalid or expired Google credentials"
        )

    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email:
        raise HTTPException(
            status_code=401, detail="Invalid or expired Google credentials"
        )
    name = (info.get("name") or email.split("@")[0] or "User")[:50]

    if settings.USE_SUPABASE:
        # 1. user_auth'tan kullanıcıyı bul
        auth_res = (
            supabase.table("user_auth")
            .select("user_id")
            .eq("provider", "google")
            .eq("provider_key", sub)
            .execute()
        )
        user_id = auth_res.data[0]["user_id"] if auth_res.data else None

        # Kullanıcı yoksa oluştur
        if not user_id:
            new_id = str(uuid.uuid4())

            # A. users'a ekle
            user_insert = {
                "id": new_id,
                "username": name,
                "llm_choice_id": 1,
                "role_id": 1,
                "is_email_verified": True,
            }
            user = supabase.table("users").insert(user_insert).execute().data[0]

            # B. user_auth'a ekle
            auth_insert = {"user_id": new_id, "provider": "google", "provider_key": sub}
            supabase.table("user_auth").insert(auth_insert).execute()

            # C. user_settings'e ekle
            settings_insert = {
                "user_id": new_id,
                "eula_accepted": False,
                "active_avatar_url": None,
            }
            supabase.table("user_settings").insert(settings_insert).execute()

            # D. user_stats tablosuna ekle
            stats_insert = {"user_id": new_id, "summary_count": 0, "tools_count": 0}
            supabase.table("user_stats").insert(stats_insert).execute()

            auth_service.create_user_avatar(new_id, name)

            eula_accepted = False
            email_val = email

        else:
            user_res = supabase.table("users").select("*").eq("id", user_id).execute()
            user = user_res.data[0]

            settings_res = (
                supabase.table("user_settings")
                .select("eula_accepted")
                .eq("user_id", user_id)
                .execute()
            )
            eula_accepted = (
                settings_res.data[0]["eula_accepted"] if settings_res.data else False
            )
            email_val = email

        jwt_user = {**user, "email": email_val, "eula_accepted": eula_accepted}

        return auth_schemas.AuthOut(
            access_token=security.create_jwt(jwt_user),
            user_id=str(user["id"]),
            email=email_val,
            username=user.get("username"),
            eula_accepted=eula_accepted,
            created_at=user.get("created_at"),
        )

    # Local Postgres (USE_SUPABASE=false): same semantics without REST
    auth_row = (
        db.execute(
            text(
                """
                SELECT user_id FROM user_auth
                WHERE provider = 'google' AND provider_key = :sub
                LIMIT 1
                """
            ),
            {"sub": sub},
        )
        .mappings()
        .first()
    )
    user_id = str(auth_row["user_id"]) if auth_row else None

    if not user_id:
        new_id = str(uuid.uuid4())
        try:
            db.execute(
                text(
                    """
                    INSERT INTO users (id, username, llm_choice_id, role_id, is_email_verified)
                    VALUES (:id, :username, 1, 1, true)
                    """
                ),
                {"id": new_id, "username": name},
            )
            db.execute(
                text(
                    """
                    INSERT INTO user_auth (user_id, provider, provider_key, password_hash)
                    VALUES (:user_id, 'google', :sub, NULL)
                    """
                ),
                {"user_id": new_id, "sub": sub},
            )
            db.execute(
                text(
                    """
                    INSERT INTO user_settings (user_id, eula_accepted, active_avatar_url)
                    VALUES (:user_id, false, NULL)
                    """
                ),
                {"user_id": new_id},
            )
            now = datetime.now(timezone.utc)
            db.execute(
                text(
                    """
                    INSERT INTO user_stats (user_id, summary_count, tools_count, last_activity)
                    VALUES (:user_id, 0, 0, :ts)
                    ON CONFLICT (user_id) DO NOTHING
                    """
                ),
                {"user_id": new_id, "ts": now},
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("google_login: local DB create user failed")
            raise HTTPException(
                status_code=500, detail="Failed to create account"
            ) from None

        try:
            auth_service.create_user_avatar(new_id, name)
        except Exception as e:
            logger.warning("Avatar creation failed (non-critical): %s", e)

        user = {"id": new_id, "username": name}
        eula_accepted = False
        email_val = email
    else:
        user_row = (
            db.execute(
                text("SELECT id, username FROM users WHERE id = :uid LIMIT 1"),
                {"uid": user_id},
            )
            .mappings()
            .first()
        )
        if not user_row:
            raise HTTPException(status_code=500, detail="User not found")
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
        eula_accepted = bool(settings_row["eula_accepted"]) if settings_row else False
        user = {"id": user_row["id"], "username": user_row["username"]}
        email_val = email

    jwt_user = {**user, "email": email_val, "eula_accepted": eula_accepted}

    return auth_schemas.AuthOut(
        access_token=security.create_jwt(jwt_user),
        user_id=str(user["id"]),
        email=email_val,
        username=user.get("username"),
        eula_accepted=eula_accepted,
        created_at=user.get("created_at"),
    )


@router.post("/register")
def register_user(
    request: Request,
    payload: auth_schemas.RegisterIn,
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(
        request, "auth:register", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    if not payload.eula_accepted:
        raise HTTPException(
            status_code=400, detail="EULA must be accepted to register."
        )

    if settings.USE_SUPABASE:
        # Username check (users table)
        username_check = (
            supabase.table("users")
            .select("id")
            .eq("username", payload.username)
            .execute()
        )
        if username_check.data:
            raise HTTPException(status_code=400, detail="Username already taken")

        # Email check (user_auth table)
        email_check = (
            supabase.table("user_auth")
            .select("user_id")
            .eq("provider_key", payload.email)
            .execute()
        )
        if email_check.data:
            raise HTTPException(status_code=400, detail="Email already taken")

        hashed = security.hash_password(payload.password)
        new_id = str(uuid.uuid4())

        # 1. Create User
        user_insert = {
            "id": new_id,
            "username": payload.username,
            "llm_choice_id": 1,
            "role_id": 1,
            "is_email_verified": False,
        }
        user_response = supabase.table("users").insert(user_insert).execute()
        if not user_response.data:
            raise HTTPException(status_code=500, detail="Failed to create user")

        user = user_response.data[0]

        # 2. Create Auth Record
        auth_insert = {
            "user_id": new_id,
            "provider": "local",
            "provider_key": payload.email,
            "password_hash": hashed,
        }
        supabase.table("user_auth").insert(auth_insert).execute()

        # 3. Create Settings Record
        settings_insert = {
            "user_id": new_id,
            "eula_accepted": True,
            "active_avatar_url": None,  # Avatar create_user_avatar tarafından oluşturulacak
        }
        supabase.table("user_settings").insert(settings_insert).execute()

        # 4. Create Stats Record
        stats_insert = {"user_id": new_id, "summary_count": 0, "tools_count": 0}
        supabase.table("user_stats").insert(stats_insert).execute()

        try:
            auth_service.create_user_avatar(new_id, payload.username)
        except Exception as e:
            logger.warning(
                "register_user: avatar creation failed (non-critical): %s", e
            )

        jwt_user = {**user, "email": payload.email, "eula_accepted": True}
        token = security.create_jwt(jwt_user)

        return {
            "message": "User registered successfully",
            "user_id": new_id,
            "access_token": token,
            "token_type": "bearer",
            "created_at": user.get("created_at"),
        }

    # Local SQLAlchemy / raw SQL branch
    username_exists = db.execute(
        text("SELECT 1 FROM users WHERE username = :username LIMIT 1"),
        {"username": payload.username},
    ).first()
    if username_exists:
        raise HTTPException(status_code=400, detail="Username already taken")

    email_exists = db.execute(
        text(
            """
            SELECT 1 FROM user_auth
            WHERE provider = 'local' AND provider_key = :email
            LIMIT 1
            """
        ),
        {"email": payload.email},
    ).first()
    if email_exists:
        raise HTTPException(status_code=400, detail="Email already taken")

    hashed = security.hash_password(payload.password)
    new_id = str(uuid.uuid4())

    try:
        db.execute(
            text(
                """
                INSERT INTO users (id, username, llm_choice_id, role_id)
                VALUES (:id, :username, 1, 1)
                """
            ),
            {"id": new_id, "username": payload.username},
        )
        db.execute(
            text(
                """
                INSERT INTO user_auth (user_id, provider, provider_key, password_hash)
                VALUES (:user_id, 'local', :email, :password_hash)
                """
            ),
            {"user_id": new_id, "email": payload.email, "password_hash": hashed},
        )
        db.execute(
            text(
                """
                INSERT INTO user_settings (user_id, eula_accepted, active_avatar_url)
                VALUES (:user_id, true, NULL)
                """
            ),
            {"user_id": new_id},
        )
        now = datetime.now(timezone.utc)
        db.execute(
            text(
                """
                INSERT INTO user_stats (user_id, summary_count, tools_count, last_activity)
                VALUES (:user_id, 0, 0, :ts)
                ON CONFLICT (user_id) DO NOTHING
                """
            ),
            {"user_id": new_id, "ts": now},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("register_user: database transaction failed")
        raise

    try:
        auth_service.create_user_avatar(new_id, payload.username)
    except Exception as e:
        logger.warning("register_user: avatar creation failed (non-critical): %s", e)

    token = security.create_jwt(
        {
            "id": new_id,
            "username": payload.username,
            "email": payload.email,
            "eula_accepted": True,
        }
    )

    return {
        "message": "User registered successfully",
        "user_id": new_id,
        "access_token": token,
        "token_type": "bearer",
        "created_at": None,
    }


def _reject_2fa_verify(request: Request) -> None:
    record_2fa_verify_failure(request)
    raise HTTPException(
        status_code=401,
        detail="Invalid or expired verification code",
    )


@router.post("/login", response_model=auth_schemas.LoginRequires2FAOut)
async def login(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: auth_schemas.LoginIn,
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    from ..security_logger import (
        log_failed_login,
        log_rate_limit_exceeded,
    )

    if not check_rate_limit(
        request, "auth:login", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60
    ):
        log_rate_limit_exceeded(
            ip_address=get_client_ip(request),
            endpoint="/auth/login",
            request=request,
        )
        raise HTTPException(status_code=429, detail="Too many requests")

    if settings.USE_SUPABASE:
        # 1. Find auth records (email = provider_key in local strategy)
        auth_res = (
            supabase.table("user_auth")
            .select("*")
            .eq("provider_key", payload.email)
            .eq("provider", "local")
            .execute()
        )
        if not auth_res.data:
            log_failed_login(
                email=payload.email,
                ip_address=get_client_ip(request),
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        auth_record = auth_res.data[0]
        user_id = auth_record["user_id"]
        stored_pw = auth_record.get("password_hash")

        # 2. Check password
        is_valid = False
        if stored_pw and stored_pw.startswith("$2b$"):
            is_valid = security.verify_password(payload.password, stored_pw)
        elif stored_pw:
            digest = hashlib.sha256(payload.password.encode()).hexdigest()
            if _sha256_hex_equals_legacy_stored(digest, stored_pw):
                is_valid = True
                supabase.table("user_auth").update(
                    {"password_hash": security.hash_password(payload.password)}
                ).eq("id", auth_record["id"]).execute()

        if not is_valid:
            log_failed_login(
                email=payload.email,
                ip_address=get_client_ip(request),
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")
    else:
        auth_row = (
            db.execute(
                text(
                    """
                SELECT id, user_id, password_hash
                FROM user_auth
                WHERE provider = 'local' AND provider_key = :email
                ORDER BY id DESC
                LIMIT 1
                """
                ),
                {"email": payload.email},
            )
            .mappings()
            .first()
        )
        if not auth_row:
            log_failed_login(
                email=payload.email,
                ip_address=get_client_ip(request),
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_id = auth_row["user_id"]
        stored_pw = auth_row["password_hash"]
        is_valid = False
        if stored_pw and stored_pw.startswith("$2b$"):
            is_valid = security.verify_password(payload.password, stored_pw)
        elif stored_pw:
            digest = hashlib.sha256(payload.password.encode()).hexdigest()
            if _sha256_hex_equals_legacy_stored(digest, str(stored_pw)):
                is_valid = True
                db.execute(
                    text("UPDATE user_auth SET password_hash = :pw WHERE id = :id"),
                    {
                        "pw": security.hash_password(payload.password),
                        "id": auth_row["id"],
                    },
                )
                db.commit()

        if not is_valid:
            log_failed_login(
                email=payload.email,
                ip_address=get_client_ip(request),
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

    plain_otp = security.generate_six_digit_otp(str(payload.email))
    otp_hash = security.hash_password(plain_otp)

    try:
        await set_redis_otp(
            str(user_id),
            otp_hash,
            ttl_seconds=max(60, settings.OTP_EMAIL_TTL_SECONDS),
        )

        background_tasks.add_task(send_login_otp_email, str(payload.email), plain_otp)

        temp_token = security.create_2fa_pending_token(str(user_id), str(payload.email))
        return auth_schemas.LoginRequires2FAOut(temp_token=temp_token)
    except HTTPException:
        raise
    except RedisOtpUnavailable:
        logger.warning("auth/login: Redis OTP storage unavailable")
        raise HTTPException(
            status_code=503,
            detail="Sign-in could not be completed. Please try again later.",
        ) from None
    except Exception:
        logger.exception(
            "auth/login: unexpected error during 2FA setup (after password OK)"
        )
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503,
            detail=(
                "Sign-in could not be completed after password verification. "
                "Ensure Redis is available and email delivery is configured."
            ),
        ) from None


@router.post("/verify-2fa", response_model=auth_schemas.AuthOut)
async def verify_2fa(
    request: Request,
    payload: auth_schemas.Verify2FAIn,
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    from ..security_logger import (
        log_successful_login,
        log_rate_limit_exceeded,
    )

    if not check_rate_limit(
        request, "auth:verify2fa", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60
    ):
        log_rate_limit_exceeded(
            ip_address=get_client_ip(request),
            endpoint="/auth/verify-2fa",
            request=request,
        )
        raise HTTPException(status_code=429, detail="Too many requests")

    if is_2fa_verify_locked(request):
        log_rate_limit_exceeded(
            ip_address=get_client_ip(request),
            endpoint="/auth/verify-2fa-locked",
            request=request,
        )
        raise HTTPException(status_code=429, detail="Too many requests")

    otp_input = payload.otp_code.strip()
    if len(otp_input) != 6 or not otp_input.isdigit():
        _reject_2fa_verify(request)

    try:
        claims = security.decode_2fa_pending_token(payload.temp_token)
    except ValueError:
        _reject_2fa_verify(request)

    user_id = str(claims.get("sub") or "")
    email = str(claims.get("email") or "")
    if not user_id or not email:
        _reject_2fa_verify(request)

    otp_secret = await get_redis_otp(user_id)
    if not otp_secret:
        _reject_2fa_verify(request)

    if not security.verify_password(otp_input, otp_secret):
        _reject_2fa_verify(request)

    await delete_redis_otp(user_id)

    try:
        if settings.USE_SUPABASE:
            await user_repo.mark_email_as_verified(user_id, db=None, supabase=supabase)
        else:
            await user_repo.mark_email_as_verified(user_id, db=db, supabase=None)
    except Exception:
        logger.exception("verify-2fa: failed to persist email verified flag")
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503,
            detail="Sign-in could not be completed. Please try again.",
        ) from None

    if settings.USE_SUPABASE:
        user_res = supabase.table("users").select("*").eq("id", user_id).execute()
        if not user_res.data:
            _reject_2fa_verify(request)
        raw_u = user_res.data[0]
        user = raw_u if isinstance(raw_u, dict) else {}
        settings_res = (
            supabase.table("user_settings")
            .select("eula_accepted")
            .eq("user_id", user_id)
            .execute()
        )
        eula_accepted = (
            settings_res.data[0]["eula_accepted"] if settings_res.data else False
        )
    else:
        user_row = (
            db.execute(
                text("SELECT id, username FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            )
            .mappings()
            .first()
        )
        settings_row = (
            db.execute(
                text(
                    "SELECT eula_accepted FROM user_settings WHERE user_id = :user_id LIMIT 1"
                ),
                {"user_id": user_id},
            )
            .mappings()
            .first()
        )
        eula_accepted = bool(settings_row["eula_accepted"]) if settings_row else False
        if not user_row:
            _reject_2fa_verify(request)
        user = {
            "id": user_id,
            "username": user_row["username"] if user_row else None,
            "created_at": None,
        }

    clear_2fa_verify_failures(request)

    jwt_user = {**user, "email": email, "eula_accepted": eula_accepted}
    log_successful_login(
        user_id=str(user_id),
        email=email,
        ip_address=get_client_ip(request),
        request=request,
    )

    return auth_schemas.AuthOut(
        access_token=security.create_jwt(jwt_user),
        user_id=str(user_id),
        email=email,
        username=user.get("username"),
        eula_accepted=eula_accepted,
        created_at=user.get("created_at"),
    )


@router.get("/eula", response_class=PlainTextResponse)
def get_eula(lang: str = "tr"):
    return helpers.get_eula_content(lang)


@router.post("/accept-eula")
def accept_eula(
    payload: auth_schemas.AcceptEulaIn,
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    uid = current_user["sub"]
    if settings.USE_SUPABASE:
        supabase.table("user_settings").update({"eula_accepted": payload.accepted}).eq(
            "user_id", uid
        ).execute()
    else:
        db.execute(
            text(
                "UPDATE user_settings SET eula_accepted = :accepted WHERE user_id = :uid"
            ),
            {"accepted": payload.accepted, "uid": uid},
        )
        db.commit()
    return {"message": "Success"}


@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    user_id = current_user["sub"]
    if settings.USE_SUPABASE:
        user_res = supabase.table("users").select("*").eq("id", user_id).execute()
        if not user_res.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = user_res.data[0]

        settings_res = (
            supabase.table("user_settings").select("*").eq("user_id", user_id).execute()
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

        return {
            "user_id": user["id"],
            "email": email,
            "username": user.get("username"),
            "provider": provider,
            "eula_accepted": prefs.get("eula_accepted"),
            "created_at": user.get("created_at"),
        }

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

    return {
        "user_id": user_row["id"],
        "email": email,
        "username": user_row.get("username"),
        "provider": provider,
        "eula_accepted": prefs.get("eula_accepted"),
        "created_at": None,
    }


DELETION_OTP_TTL_SECONDS = 600


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


@router.post("/request-deletion-otp", response_model=auth_schemas.DeletionOtpSentOut)
def request_deletion_otp(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    uid = str(current_user["sub"])
    provider = _primary_auth_provider(uid, supabase, db)
    if provider == "local":
        raise HTTPException(
            status_code=400,
            detail="Password required for local accounts",
        )
    email = current_user.get("email")
    if not email or not str(email).strip():
        raise HTTPException(
            status_code=400,
            detail="No email address on session for OTP delivery",
        )
    email_str = str(email).strip()
    plain_otp = security.generate_six_digit_otp(email_str)
    otp_hash = security.hash_password(plain_otp)
    try:
        _set_deletion_otp_in_redis(uid, otp_hash)
    except RedisOtpUnavailable:
        logger.warning("request_deletion_otp: Redis unavailable")
        raise HTTPException(
            status_code=503,
            detail="Could not send verification code. Please try again later.",
        ) from None
    except Exception:
        logger.exception("request_deletion_otp: unexpected Redis error")
        raise HTTPException(
            status_code=503,
            detail="Could not send verification code. Please try again later.",
        ) from None

    background_tasks.add_task(send_deletion_otp_email, email_str, plain_otp)
    return auth_schemas.DeletionOtpSentOut()


@router.post("/verify-and-delete")
def verify_and_delete(
    body: auth_schemas.VerifyAndDeleteAccountIn,
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    uid = str(current_user["sub"])
    provider = _primary_auth_provider(uid, supabase, db)
    if provider == "local":
        pw = (body.password or "").strip()
        if not pw:
            raise HTTPException(status_code=400, detail="Password required")
        _verify_password_for_account_deletion(uid, pw, supabase, db)
    else:
        otp_code = body.otp
        if not otp_code or not str(otp_code).strip():
            raise HTTPException(status_code=400, detail="OTP required")
        otp_input = str(otp_code).replace(" ", "").strip()
        if len(otp_input) != 6 or not otp_input.isdigit():
            raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        stored = _get_deletion_otp_from_redis(uid)
        if not stored:
            raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        if not security.verify_password(otp_input, str(stored)):
            raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        _delete_deletion_otp_from_redis(uid)

    return _execute_account_deletion(uid, supabase, db)


@router.delete("/delete-account")
def delete_account(
    body: auth_schemas.DeleteAccountIn,
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    uid = str(current_user["sub"])
    _verify_password_for_account_deletion(uid, body.password, supabase, db)
    return _execute_account_deletion(uid, supabase, db)
