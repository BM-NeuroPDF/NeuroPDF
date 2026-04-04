import logging
import hashlib
import uuid
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import PlainTextResponse
from supabase import Client
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..core import security
from ..schemas import auth as auth_schemas
from ..services import auth_service
from ..utils import helpers
from ..db import get_supabase, get_db
from ..deps import get_current_user as get_current_user_dep
from ..rate_limit import check_rate_limit
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=auth_schemas.AuthOut)
def google_login(
    request: Request,
    payload: auth_schemas.GoogleExchangeIn,
    supabase: Client = Depends(get_supabase),
):
    if not check_rate_limit(
        request, "auth:google", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=429, detail="Too many requests")

    info = auth_service.verify_google_token(payload.id_token)
    sub = info.get("sub")
    email = info.get("email")
    name = info.get("name") or (email.split("@")[0] if email else "User")

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
        import uuid

        new_id = str(uuid.uuid4())

        # A. users'a ekle
        user_insert = {"id": new_id, "username": name, "llm_choice_id": 2, "role_id": 1}
        user = supabase.table("users").insert(user_insert).execute().data[0]

        # B. user_auth'a ekle
        auth_insert = {"user_id": new_id, "provider": "google", "provider_key": sub}
        supabase.table("user_auth").insert(auth_insert).execute()

        # C. user_settings'e ekle
        settings_insert = {
            "user_id": new_id,
            "eula_accepted": False,
            "active_avatar_url": None,  # Avatar create_user_avatar tarafından oluşturulacak
        }
        supabase.table("user_settings").insert(settings_insert).execute()

        # D. user_stats tablosuna ekle
        stats_insert = {"user_id": new_id, "summary_count": 0, "tools_count": 0}
        supabase.table("user_stats").insert(stats_insert).execute()

        auth_service.create_user_avatar(new_id, name)

        eula_accepted = False
        email_val = email

    # Kullanıcı varsa bilgilerini çek
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

    # user dict for JWT
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
            "llm_choice_id": 2,
            "role_id": 1,
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
            logger.warning(f"Avatar creation failed (non-critical): {e}")

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
                VALUES (:id, :username, 2, 1)
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
        db.execute(
            text(
                """
                INSERT INTO user_stats (user_id, summary_count, tools_count)
                VALUES (:user_id, 0, 0)
                ON CONFLICT (user_id) DO NOTHING
                """
            ),
            {"user_id": new_id},
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    try:
        auth_service.create_user_avatar(new_id, payload.username)
    except Exception as e:
        logger.warning(f"Avatar creation failed (non-critical): {e}")

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


@router.post("/login", response_model=auth_schemas.AuthOut)
def login(
    request: Request,
    payload: auth_schemas.LoginIn,
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    from ..security_logger import (
        log_failed_login,
        log_successful_login,
        log_rate_limit_exceeded,
    )

    if not check_rate_limit(
        request, "auth:login", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60
    ):
        log_rate_limit_exceeded(
            ip_address=request.client.host if request.client else None,
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
                ip_address=request.client.host if request.client else None,
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
            if hashlib.sha256(payload.password.encode()).hexdigest() == stored_pw:
                is_valid = True
                supabase.table("user_auth").update(
                    {"password_hash": security.hash_password(payload.password)}
                ).eq("id", auth_record["id"]).execute()

        if not is_valid:
            log_failed_login(
                email=payload.email,
                ip_address=request.client.host if request.client else None,
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # 3. Get user & settings for payload
        user_res = supabase.table("users").select("*").eq("id", user_id).execute()
        user = user_res.data[0] if user_res.data else {}

        settings_res = (
            supabase.table("user_settings")
            .select("eula_accepted")
            .eq("user_id", user_id)
            .execute()
        )
        eula_accepted = (
            settings_res.data[0]["eula_accepted"] if settings_res.data else False
        )
        jwt_user = {**user, "email": payload.email, "eula_accepted": eula_accepted}
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
                ip_address=request.client.host if request.client else None,
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_id = auth_row["user_id"]
        stored_pw = auth_row["password_hash"]
        is_valid = False
        if stored_pw and stored_pw.startswith("$2b$"):
            is_valid = security.verify_password(payload.password, stored_pw)
        elif stored_pw:
            if hashlib.sha256(payload.password.encode()).hexdigest() == stored_pw:
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
                ip_address=request.client.host if request.client else None,
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

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
        user = {
            "id": user_id,
            "username": user_row["username"] if user_row else None,
        }
        jwt_user = {**user, "email": payload.email, "eula_accepted": eula_accepted}

    # Log successful login
    log_successful_login(
        user_id=str(user_id),
        email=payload.email,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return auth_schemas.AuthOut(
        access_token=security.create_jwt(jwt_user),
        user_id=str(user_id),
        email=payload.email,
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
):
    supabase.table("user_settings").update({"eula_accepted": payload.accepted}).eq(
        "user_id", current_user["sub"]
    ).execute()
    return {"message": "Success"}


@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
):
    user_id = current_user["sub"]
    user_res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_res.data[0]

    settings_res = (
        supabase.table("user_settings").select("*").eq("user_id", user_id).execute()
    )
    settings = settings_res.data[0] if settings_res.data else {}

    auth_res = (
        supabase.table("user_auth")
        .select("provider, provider_key")
        .eq("user_id", user_id)
        .execute()
    )
    # Assume first auth record provider
    provider = auth_res.data[0]["provider"] if auth_res.data else "local"
    email = auth_res.data[0]["provider_key"] if auth_res.data else None

    return {
        "user_id": user["id"],
        "email": email,
        "username": user.get("username"),
        "provider": provider,
        "eula_accepted": settings.get("eula_accepted"),
        "created_at": user.get("created_at"),
    }


@router.delete("/delete-account")
def delete_account(
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
):
    uid = current_user["sub"]
    # cascade should delete user_stats, pdfs, user_auth, user_settings if setup correctly in PostgreSQL
    # if not, we must delete them manually via REST API here:
    supabase.table("user_auth").delete().eq("user_id", uid).execute()
    supabase.table("user_settings").delete().eq("user_id", uid).execute()
    supabase.table("user_stats").delete().eq("user_id", uid).execute()
    supabase.table("user_avatars").delete().eq("user_id", uid).execute()
    supabase.table("users").delete().eq("id", uid).execute()

    return {"message": "Deleted"}
