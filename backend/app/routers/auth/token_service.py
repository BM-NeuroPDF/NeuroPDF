from datetime import datetime

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from ...schemas import auth as auth_schemas
from ...services.refresh_token_service import issue_refresh_token


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    from . import _legacy as _facade

    response.set_cookie(
        key=_facade.settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=_facade.settings.REFRESH_COOKIE_SECURE,
        samesite=_facade.settings.REFRESH_COOKIE_SAMESITE,
        max_age=max(60, _facade.settings.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 3600),
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    from . import _legacy as _facade

    response.delete_cookie(key=_facade.settings.REFRESH_COOKIE_NAME, path="/")


def _issue_auth_out(
    *,
    response: Response,
    db: Session,
    user_id: str,
    email: str | None,
    username: str | None,
    eula_accepted: bool | None,
    created_at: datetime | None,
) -> auth_schemas.AuthOut:
    from . import _legacy as _facade

    auth_out = auth_schemas.AuthOut(
        access_token=_facade.security.create_jwt(
            {
                "sub": user_id,
                "email": email,
                "username": username,
                "eula_accepted": eula_accepted,
            }
        ),
        user_id=user_id,
        email=email,
        username=username,
        eula_accepted=eula_accepted,
        created_at=created_at,
    )
    if _facade.settings.REFRESH_TOKENS_ENABLED:
        if _facade.settings.USE_SUPABASE:
            raise HTTPException(
                status_code=503,
                detail="Refresh token flow is not available in Supabase mode.",
            )
        issued = issue_refresh_token(db, user_id=user_id)
        _set_refresh_cookie(response, issued.token)
        db.commit()
    return auth_out


def _extract_refresh_token(
    request: Request, payload: auth_schemas.RefreshIn
) -> str | None:
    from . import _legacy as _facade

    if payload.refresh_token:
        return payload.refresh_token.strip()
    cookie_val = request.cookies.get(_facade.settings.REFRESH_COOKIE_NAME)
    if cookie_val:
        return cookie_val.strip()
    return None
