from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RefreshToken

REFRESH_TOKEN_TYP = "refresh"


class RefreshTokenError(Exception):
    pass


class RefreshTokenReuseDetected(RefreshTokenError):
    def __init__(self, user_id: str):
        super().__init__("refresh token reuse detected")
        self.user_id = user_id


@dataclass
class RefreshIssueResult:
    token: str
    jti: str
    expires_at: datetime


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _decode_refresh_token(token: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "jti", "typ"]},
        )
    except Exception as exc:
        raise RefreshTokenError("invalid refresh token") from exc
    if claims.get("typ") != REFRESH_TOKEN_TYP:
        raise RefreshTokenError("invalid refresh token type")
    return claims


def issue_refresh_token(
    db: Session, user_id: str, parent_jti: str | None = None
) -> RefreshIssueResult:
    now = _now()
    expires_at = now + timedelta(days=max(1, settings.REFRESH_TOKEN_EXPIRES_DAYS))
    jti = secrets.token_urlsafe(24)
    claims = {
        "sub": str(user_id),
        "jti": jti,
        "typ": REFRESH_TOKEN_TYP,
        "iat": now,
        "exp": expires_at,
        "iss": "fastapi-refresh",
    }
    token = jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")
    db.add(
        RefreshToken(
            user_id=str(user_id),
            jti=jti,
            expires_at=expires_at,
            revoked_at=None,
            parent_jti=parent_jti,
        )
    )
    db.flush()
    return RefreshIssueResult(token=token, jti=jti, expires_at=expires_at)


def revoke_refresh_token_by_jti(db: Session, jti: str) -> bool:
    row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if not row:
        return False
    if row.revoked_at is None:
        row.revoked_at = _now()
        db.flush()
    return True


def revoke_all_refresh_tokens_for_user(db: Session, user_id: str) -> int:
    now = _now()
    rows = db.query(RefreshToken).filter(
        RefreshToken.user_id == str(user_id),
        RefreshToken.revoked_at.is_(None),
    )
    count = 0
    for row in rows:
        row.revoked_at = now
        count += 1
    db.flush()
    return count


def rotate_refresh_token(db: Session, token: str) -> tuple[str, str]:
    claims = _decode_refresh_token(token)
    user_id = str(claims["sub"])
    jti = str(claims["jti"])
    row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if not row:
        raise RefreshTokenError("refresh token not recognized")
    now = _now()
    if row.revoked_at is not None:
        revoke_all_refresh_tokens_for_user(db, user_id)
        raise RefreshTokenReuseDetected(user_id)
    if row.expires_at <= now:
        row.revoked_at = now
        db.flush()
        raise RefreshTokenError("refresh token expired")
    row.revoked_at = now
    issued = issue_refresh_token(db, user_id=user_id, parent_jti=jti)
    return user_id, issued.token
