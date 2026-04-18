from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..db import Client
from ..models import User
from .contracts import UserRepoProtocol

logger = logging.getLogger(__name__)


class UserRepository(UserRepoProtocol):
    async def get_llm_provider(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> str:
        if not user_id:
            return "local"
        try:
            if db is not None:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    return (
                        "local" if getattr(user, "llm_choice_id", 0) == 0 else "cloud"
                    )
        except Exception as e:
            logger.warning(
                "Failed to get llm provider for %s: %s", user_id, e, exc_info=True
            )
        return "local"

    async def is_pro_user(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> bool:
        if not user_id:
            return False
        try:
            if db is not None:
                role_row = (
                    db.execute(
                        text(
                            """
                            SELECT ur.name AS role_name
                            FROM users u
                            LEFT JOIN user_roles ur ON ur.id = u.role_id
                            WHERE u.id = :user_id
                            LIMIT 1
                            """
                        ),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .first()
                )
                if role_row and role_row.get("role_name"):
                    role_name = str(role_row["role_name"]).lower()
                    return "pro" in role_name or role_name == "pro"

            if settings.USE_SUPABASE and supabase is not None:
                user_response = (
                    supabase.table("users")
                    .select("user_roles(name)")
                    .eq("id", user_id)
                    .execute()
                )
                if user_response.data:
                    user_data = user_response.data[0]
                    roles_data = user_data.get("user_roles")
                    if isinstance(roles_data, list) and len(roles_data) > 0:
                        role_name = str(roles_data[0].get("name", "")).lower()
                    elif isinstance(roles_data, dict):
                        role_name = str(roles_data.get("name", "")).lower()
                    else:
                        return False
                    return "pro" in role_name or role_name == "pro"
        except Exception as e:
            logger.warning(
                "Failed to check pro user for %s: %s", user_id, e, exc_info=True
            )
        return False

    async def mark_email_as_verified(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> None:
        if db is not None:
            res = db.execute(
                text(
                    """
                    UPDATE users
                    SET is_email_verified = true
                    WHERE id = :id
                    """
                ),
                {"id": user_id},
            )
            if getattr(res, "rowcount", None) == 0:
                logger.warning(
                    "mark_email_as_verified: no users row for id=%s", user_id
                )
            db.commit()
            return
        if settings.USE_SUPABASE and supabase is not None:
            supabase.table("users").update({"is_email_verified": True}).eq(
                "id", user_id
            ).execute()
