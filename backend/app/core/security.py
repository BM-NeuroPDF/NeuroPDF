import jwt
import re
import bcrypt
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import settings

TWO_FA_PENDING_TYP = "2fa_pending"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def validate_password_strength(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Şifre en az 8 karakter olmalıdır"
    if not re.search(r"[A-Z]", password):
        return False, "Şifre en az bir büyük harf içermelidir"
    if not re.search(r"[a-z]", password):
        return False, "Şifre en az bir küçük harf içermelidir"
    if not re.search(r"\d", password):
        return False, "Şifre en az bir rakam içermelidir"
    return True, ""


def create_jwt(user: dict) -> str:
    now = datetime.now(timezone.utc)
    # auth router ve testler: "id"; bazı yardımcılar: "sub" — ikisini de destekle
    subject = user.get("id")
    if subject is None:
        subject = user.get("sub")
    claims = {
        "sub": str(subject) if subject is not None else "",
        "email": user.get("email"),
        "username": user.get("username"),
        "eula_accepted": user.get("eula_accepted", False),
        "exp": now
        + timedelta(
            minutes=(
                settings.ACCESS_TOKEN_EXPIRES_MIN
                if settings.REFRESH_TOKENS_ENABLED
                else settings.JWT_EXPIRES_MIN
            )
        ),
        "iat": now,
        "iss": "fastapi",
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")


def verify_jwt(token: str) -> dict:
    """
    Backward-compatible JWT verifier used by older tests/helpers.
    Returns decoded payload, raises ValueError on invalid token.
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except Exception as exc:
        raise ValueError("Invalid JWT token") from exc


def generate_six_digit_otp(email: str) -> str:
    if settings.E2E_MAGIC_OTP_ENABLED and (
        settings.E2E_MAGIC_OTP_ALL_USERS
        or (
            settings.E2E_MAGIC_OTP_EMAIL
            and email.lower() == settings.E2E_MAGIC_OTP_EMAIL.lower()
        )
    ):
        return "123456"
    return f"{secrets.randbelow(1_000_000):06d}"


def create_2fa_pending_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    ttl = max(60, int(settings.OTP_EMAIL_TTL_SECONDS))
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "typ": TWO_FA_PENDING_TYP,
        "exp": now + timedelta(seconds=ttl),
        "iat": now,
        "iss": "fastapi-2fa-pending",
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")


def decode_2fa_pending_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except Exception as exc:
        raise ValueError("Invalid pending token") from exc
    if payload.get("typ") != TWO_FA_PENDING_TYP:
        raise ValueError("Invalid pending token")
    return payload
