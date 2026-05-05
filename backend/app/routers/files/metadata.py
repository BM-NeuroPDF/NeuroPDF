"""Metadata/stats-related files router facades."""

from .routes_user import (
    get_global_stats,
    get_llm_choice,
    get_user_stats,
    update_llm_choice,
)

__all__ = [
    "get_global_stats",
    "get_llm_choice",
    "get_user_stats",
    "update_llm_choice",
]
