from __future__ import annotations

from typing import Optional, Protocol

from sqlalchemy.orm import Session

from ..db import Client
from .dto import GlobalStatsDTO, UserStatsDTO


class StatsRepoProtocol(Protocol):
    async def increment_usage(
        self,
        user_id: str,
        operation_type: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> None: ...

    async def get_user_stats(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> UserStatsDTO: ...

    async def get_global_stats(
        self,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> GlobalStatsDTO: ...


class UserRepoProtocol(Protocol):
    async def get_llm_provider(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> str: ...

    async def is_pro_user(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> bool: ...

    async def mark_email_as_verified(
        self,
        user_id: str,
        db: Optional[Session],
        supabase: Optional[Client],
    ) -> None: ...
