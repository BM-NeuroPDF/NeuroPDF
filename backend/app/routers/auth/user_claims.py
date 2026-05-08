from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


def _load_user_claim_material(
    db: Session, user_id: str
) -> tuple[str | None, str | None, bool]:
    user_row = (
        db.execute(
            text(
                """
                SELECT u.username, ua.provider_key AS email, us.eula_accepted
                FROM users u
                LEFT JOIN user_auth ua ON ua.user_id = u.id
                LEFT JOIN user_settings us ON us.user_id = u.id
                WHERE u.id = :uid
                ORDER BY ua.id ASC
                LIMIT 1
                """
            ),
            {"uid": user_id},
        )
        .mappings()
        .first()
    )
    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return (
        user_row.get("email"),
        user_row.get("username"),
        bool(user_row.get("eula_accepted")),
    )
