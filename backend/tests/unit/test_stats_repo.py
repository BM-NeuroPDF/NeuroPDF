"""Unit tests for StatsRepository (mocked DB / Supabase)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.repositories.stats_repo import StatsRepository


@pytest.fixture
def repo() -> StatsRepository:
    return StatsRepository()


@pytest.mark.asyncio
class TestIncrementUsage:
    async def test_skips_guest_and_empty(self, repo: StatsRepository):
        db = MagicMock()
        await repo.increment_usage("guest-x", "summary", db=db, supabase=None)
        db.execute.assert_not_called()
        await repo.increment_usage("", "summary", db=db, supabase=None)
        db.execute.assert_not_called()

    @patch("app.repositories.stats_repo.settings")
    async def test_supabase_updates_existing_summary(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()
        exec_stats = MagicMock()
        exec_stats.data = [{"summary_count": 2, "tools_count": 1}]

        def table_side(name):
            m = MagicMock()
            if name == "user_stats":
                m.select.return_value.eq.return_value.execute.return_value = exec_stats
                m.update.return_value.eq.return_value.execute.return_value = MagicMock()
            return m

        sb.table.side_effect = table_side

        await repo.increment_usage("u1", "summary", db=None, supabase=sb)
        sb.table.assert_called_with("user_stats")

    @patch("app.repositories.stats_repo.settings")
    async def test_supabase_inserts_when_no_stats_row(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()

        empty_exec = MagicMock()
        empty_exec.data = []

        insert_exec = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "user_stats":
                sel = MagicMock()
                sel.eq.return_value.execute.return_value = empty_exec
                m.select.return_value = sel
                m.insert.return_value.execute.return_value = insert_exec
            return m

        sb.table.side_effect = table_side

        await repo.increment_usage("u1", "tools", db=None, supabase=sb)
        sb.table.assert_called_with("user_stats")

    @patch("app.repositories.stats_repo.settings")
    async def test_db_increments_existing_tools(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = False
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "summary_count": 0,
            "tools_count": 3,
        }
        await repo.increment_usage("u1", "tools", db=db, supabase=None)
        assert db.execute.call_count >= 2
        db.commit.assert_called_once()

    @patch("app.repositories.stats_repo.settings")
    async def test_db_inserts_when_no_stats_row(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = False
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = None
        await repo.increment_usage("u1", "summary", db=db, supabase=None)
        db.commit.assert_called_once()

    @patch("app.repositories.stats_repo.settings")
    async def test_db_rollback_on_error(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = False
        db = MagicMock()
        db.execute.side_effect = RuntimeError("fail")
        await repo.increment_usage("u1", "summary", db=db, supabase=None)
        db.rollback.assert_called_once()


@pytest.mark.asyncio
class TestGetUserStats:
    @patch("app.repositories.stats_repo.settings")
    async def test_supabase_role_fetch_raises_logged(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "user_stats":
                m.select.return_value.eq.return_value.execute.return_value.data = [
                    {"summary_count": 0, "tools_count": 0}
                ]
            if name == "users":
                m.select.return_value.eq.return_value.execute.side_effect = ValueError(
                    "role fetch failed"
                )
            return m

        sb.table.side_effect = table_side
        dto = await repo.get_user_stats("u1", db=None, supabase=sb)
        assert dto.summary_count == 0

    @patch("app.repositories.stats_repo.settings")
    async def test_supabase_with_stats_and_role_list(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "user_stats":
                m.select.return_value.eq.return_value.execute.return_value.data = [
                    {"summary_count": 5, "tools_count": 2}
                ]
            if name == "users":
                m.select.return_value.eq.return_value.execute.return_value.data = [
                    {"user_roles": [{"name": "Pro"}]}
                ]
            return m

        sb.table.side_effect = table_side
        dto = await repo.get_user_stats("u1", db=None, supabase=sb)
        assert dto.summary_count == 5
        assert dto.tools_count == 2
        assert "Pro" in dto.role_name_db or dto.role_name_db == "Pro"

    @patch("app.repositories.stats_repo.settings")
    async def test_supabase_role_dict_branch(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "user_stats":
                m.select.return_value.eq.return_value.execute.return_value.data = []
            if name == "users":
                m.select.return_value.eq.return_value.execute.return_value.data = [
                    {"user_roles": {"name": "admin"}}
                ]
            return m

        sb.table.side_effect = table_side
        dto = await repo.get_user_stats("u1", db=None, supabase=sb)
        assert dto.summary_count == 0
        assert "admin" in dto.role_name_db.lower() or dto.role_name_db == "admin"

    @patch("app.repositories.stats_repo.settings")
    async def test_db_branch_with_role(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = False
        db = MagicMock()

        def execute(*args, **kwargs):
            stmt = str(args[0]) if args else ""
            m = MagicMock()
            if "FROM user_stats" in stmt:
                m.mappings.return_value.first.return_value = {
                    "summary_count": 1,
                    "tools_count": 4,
                }
            else:
                m.mappings.return_value.first.return_value = {"role_name": "Standart"}
            return m

        db.execute.side_effect = execute

        dto = await repo.get_user_stats("u1", db=db, supabase=None)
        assert dto.summary_count == 1
        assert dto.tools_count == 4

    @patch("app.repositories.stats_repo.settings")
    async def test_top_level_exception_returns_default_dto(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = False
        db = MagicMock()
        db.execute.side_effect = RuntimeError("x")
        dto = await repo.get_user_stats("u1", db=db, supabase=None)
        assert dto.summary_count == 0
        assert dto.tools_count == 0


@pytest.mark.asyncio
class TestGetGlobalStats:
    @patch("app.repositories.stats_repo.settings")
    async def test_supabase_branch(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "users":
                exec_u = MagicMock()
                exec_u.count = 10
                m.select.return_value.execute.return_value = exec_u
            if name == "user_stats":
                m.select.return_value.execute.return_value.data = [
                    {"summary_count": 2, "tools_count": 3},
                    {"summary_count": 1, "tools_count": 1},
                ]
            return m

        sb.table.side_effect = table_side
        dto = await repo.get_global_stats(db=None, supabase=sb)
        assert dto.total_users == 10
        assert dto.total_ai_summaries == 3
        assert dto.total_processed == 7

    @patch("app.repositories.stats_repo.settings")
    async def test_db_branch(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = False
        db = MagicMock()

        def execute(*args, **_k):
            stmt = str(args[0]) if args else ""
            m = MagicMock()
            if "COUNT(*)" in stmt:
                m.mappings.return_value.first.return_value = {"total_users": 7}
            else:
                m.mappings.return_value.first.return_value = {
                    "total_ai": 4,
                    "total_tools": 9,
                }
            return m

        db.execute.side_effect = execute
        dto = await repo.get_global_stats(db=db, supabase=None)
        assert dto.total_users == 7
        assert dto.total_ai_summaries == 4
        assert dto.total_processed == 13

    @patch("app.repositories.stats_repo.settings")
    async def test_exception_returns_zeros(self, mock_settings, repo):
        mock_settings.USE_SUPABASE = True
        sb = MagicMock()
        sb.table.side_effect = RuntimeError("x")
        dto = await repo.get_global_stats(db=None, supabase=sb)
        assert dto.total_users == 0
        assert dto.total_processed == 0
