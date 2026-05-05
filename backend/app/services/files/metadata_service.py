"""Metadata/stats service helpers for files router."""

from app.repositories.dto import GlobalStatsDTO, UserStatsDTO


def map_role_name_db(role_name_db: str | None) -> str:
    """Map DB role labels to API role labels."""
    role_name_lower = role_name_db.lower() if role_name_db else ""
    if "pro" in role_name_lower:
        return "Pro"
    if "admin" in role_name_lower:
        return "Admin"
    return "Standart"


def global_stats_payload(dto: GlobalStatsDTO) -> dict:
    """Convert DTO to API payload."""
    return {
        "total_users": dto.total_users,
        "total_processed": dto.total_processed,
        "total_ai_summaries": dto.total_ai_summaries,
    }


def user_stats_cache_payload(dto: UserStatsDTO) -> dict:
    """Convert user stats DTO to cache-safe payload."""
    return {
        "summary_count": dto.summary_count,
        "tools_count": dto.tools_count,
        "role": map_role_name_db(dto.role_name_db),
    }
