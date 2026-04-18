from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UserStatsDTO:
    summary_count: int
    tools_count: int
    role_name_db: str


@dataclass(frozen=True)
class GlobalStatsDTO:
    total_users: int
    total_processed: int
    total_ai_summaries: int
