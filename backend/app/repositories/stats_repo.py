from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..db import Client
from ..redis_client import invalidate_stats_caches_for_user
from .contracts import StatsRepoProtocol
from .dto import GlobalStatsDTO, UserStatsDTO

logger = logging.getLogger(__name__)


class StatsRepository(StatsRepoProtocol):
    async def increment_usage(
        self,
        user_id: str,
        operation_type: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> None:
        if not user_id or str(user_id).startswith("guest"):
            return

        target_column = (
            "summary_count" if operation_type == "summary" else "tools_count"
        )
        now_utc = datetime.now(timezone.utc)
        now_iso = now_utc.isoformat()

        try:
            if settings.USE_SUPABASE and supabase is not None:
                res = (
                    supabase.table("user_stats")
                    .select("*")
                    .eq("user_id", user_id)
                    .execute()
                )
                if res.data and len(res.data) > 0:
                    current_data = res.data[0]
                    current_val = current_data.get(target_column, 0)
                    new_val = current_val + 1
                    update_data = {target_column: new_val, "last_activity": now_iso}
                    (
                        supabase.table("user_stats")
                        .update(update_data)
                        .eq("user_id", user_id)
                        .execute()
                    )
                    invalidate_stats_caches_for_user(user_id)
                    return

                new_data = {
                    "user_id": user_id,
                    "summary_count": 1 if target_column == "summary_count" else 0,
                    "tools_count": 1 if target_column == "tools_count" else 0,
                    "last_activity": now_iso,
                }
                supabase.table("user_stats").insert(new_data).execute()
                invalidate_stats_caches_for_user(user_id)
                return

            if db is not None:
                row = (
                    db.execute(
                        text(
                            """
                            SELECT summary_count, tools_count
                            FROM user_stats
                            WHERE user_id = :user_id
                            LIMIT 1
                            """
                        ),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .first()
                )
                if row:
                    current_val = int(row.get(target_column, 0) or 0)
                    new_val = current_val + 1
                    db.execute(
                        text(
                            f"""
                            UPDATE user_stats
                            SET {target_column} = :new_val, last_activity = :last_activity
                            WHERE user_id = :user_id
                            """
                        ),
                        {
                            "new_val": new_val,
                            "last_activity": now_utc,
                            "user_id": user_id,
                        },
                    )
                else:
                    db.execute(
                        text(
                            """
                            INSERT INTO user_stats (user_id, summary_count, tools_count, last_activity)
                            VALUES (:user_id, :summary_count, :tools_count, :last_activity)
                            """
                        ),
                        {
                            "user_id": user_id,
                            "summary_count": 1
                            if target_column == "summary_count"
                            else 0,
                            "tools_count": 1 if target_column == "tools_count" else 0,
                            "last_activity": now_utc,
                        },
                    )
                db.commit()
                invalidate_stats_caches_for_user(user_id)
        except Exception as e:
            logger.error("increment_usage failed: %s", e, exc_info=True)
            if db is not None:
                db.rollback()

    async def get_user_stats(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> UserStatsDTO:
        try:
            summary_count = 0
            tools_count = 0
            role_name_db = "default user"

            if settings.USE_SUPABASE and supabase is not None:
                stats_response = (
                    supabase.table("user_stats")
                    .select("summary_count,tools_count")
                    .eq("user_id", user_id)
                    .execute()
                )
                if stats_response.data:
                    summary_count = int(
                        stats_response.data[0].get("summary_count", 0) or 0
                    )
                    tools_count = int(stats_response.data[0].get("tools_count", 0) or 0)

                try:
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
                            role_name_db = roles_data[0].get("name", "default user")
                        elif isinstance(roles_data, dict):
                            role_name_db = roles_data.get("name", "default user")
                except Exception as role_error:
                    logger.warning(
                        "Role resolution failed in get_user_stats: %s",
                        role_error,
                        exc_info=True,
                    )
            elif db is not None:
                stats_row = (
                    db.execute(
                        text(
                            """
                            SELECT summary_count, tools_count
                            FROM user_stats
                            WHERE user_id = :user_id
                            LIMIT 1
                            """
                        ),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .first()
                )
                if stats_row:
                    summary_count = int(stats_row.get("summary_count", 0) or 0)
                    tools_count = int(stats_row.get("tools_count", 0) or 0)

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
                    role_name_db = str(role_row["role_name"])

            return UserStatsDTO(
                summary_count=summary_count,
                tools_count=tools_count,
                role_name_db=role_name_db or "default user",
            )
        except Exception as e:
            logger.error("get_user_stats failed: %s", e, exc_info=True)
            return UserStatsDTO(
                summary_count=0, tools_count=0, role_name_db="default user"
            )

    async def get_global_stats(
        self,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> GlobalStatsDTO:
        try:
            if settings.USE_SUPABASE and supabase is not None:
                users_response = (
                    supabase.table("users")
                    .select("*", count="exact", head=True)
                    .execute()
                )
                total_users = (
                    users_response.count if users_response.count is not None else 0
                )

                stats_response = (
                    supabase.table("user_stats")
                    .select("summary_count, tools_count")
                    .execute()
                )

                total_tools = 0
                total_ai = 0
                if stats_response.data:
                    for row in stats_response.data:
                        total_tools += int(row.get("tools_count", 0) or 0)
                        total_ai += int(row.get("summary_count", 0) or 0)

                return GlobalStatsDTO(
                    total_users=int(total_users or 0),
                    total_processed=total_tools + total_ai,
                    total_ai_summaries=total_ai,
                )

            if db is not None:
                users_row = (
                    db.execute(text("SELECT COUNT(*) AS total_users FROM users"))
                    .mappings()
                    .first()
                )
                stats_row = (
                    db.execute(
                        text(
                            """
                            SELECT
                              COALESCE(SUM(summary_count), 0) AS total_ai,
                              COALESCE(SUM(tools_count), 0) AS total_tools
                            FROM user_stats
                            """
                        )
                    )
                    .mappings()
                    .first()
                )
                total_users = int((users_row or {}).get("total_users", 0) or 0)
                total_ai = int((stats_row or {}).get("total_ai", 0) or 0)
                total_tools = int((stats_row or {}).get("total_tools", 0) or 0)

                return GlobalStatsDTO(
                    total_users=total_users,
                    total_processed=total_tools + total_ai,
                    total_ai_summaries=total_ai,
                )
        except Exception as e:
            logger.error("get_global_stats failed: %s", e, exc_info=True)

        return GlobalStatsDTO(total_users=0, total_processed=0, total_ai_summaries=0)
