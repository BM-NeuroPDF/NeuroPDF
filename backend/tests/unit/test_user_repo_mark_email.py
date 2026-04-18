from unittest.mock import MagicMock, patch

import pytest

from app.repositories.user_repo import UserRepository


@pytest.mark.asyncio
class TestUserRepoMarkEmailVerified:
    async def test_mark_email_local(self):
        repo = UserRepository()
        db = MagicMock()
        res = MagicMock()
        res.rowcount = 1
        db.execute.return_value = res
        await repo.mark_email_as_verified("u1", db=db, supabase=None)
        db.execute.assert_called_once()
        db.commit.assert_called_once()

    async def test_mark_email_local_no_matching_row(self):
        repo = UserRepository()
        db = MagicMock()
        res = MagicMock()
        res.rowcount = 0
        db.execute.return_value = res
        await repo.mark_email_as_verified("missing", db=db, supabase=None)
        db.commit.assert_called_once()

    @patch("app.repositories.user_repo.settings.USE_SUPABASE", True)
    async def test_mark_email_supabase(self):
        repo = UserRepository()
        sb = MagicMock()
        await repo.mark_email_as_verified("u1", db=None, supabase=sb)
        sb.table.assert_called_with("users")


@pytest.mark.asyncio
class TestUserRepoGetLlmProvider:
    async def test_empty_user_id_returns_local(self):
        repo = UserRepository()
        assert await repo.get_llm_provider("", db=MagicMock(), supabase=None) == "local"

    async def test_no_user_row_returns_local(self):
        repo = UserRepository()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        assert await repo.get_llm_provider("uid", db=db, supabase=None) == "local"


@pytest.mark.asyncio
class TestUserRepoIsProUser:
    async def test_empty_user_id(self):
        repo = UserRepository()
        assert await repo.is_pro_user("", db=MagicMock(), supabase=None) is False

    async def test_no_db_no_supabase(self):
        repo = UserRepository()
        assert await repo.is_pro_user("u1", db=None, supabase=None) is False

    async def test_db_pro_role(self):
        repo = UserRepository()
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "role_name": "Pro User"
        }
        assert await repo.is_pro_user("u1", db=db, supabase=None) is True

    async def test_db_non_pro_role(self):
        repo = UserRepository()
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "role_name": "Standart"
        }
        assert await repo.is_pro_user("u1", db=db, supabase=None) is False

    async def test_db_no_row_then_supabase_none(self):
        repo = UserRepository()
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = None
        assert await repo.is_pro_user("u1", db=db, supabase=None) is False

    async def test_db_role_name_null_falls_through(self):
        repo = UserRepository()
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "role_name": None
        }
        assert await repo.is_pro_user("u1", db=db, supabase=None) is False

    @patch("app.repositories.user_repo.settings.USE_SUPABASE", True)
    async def test_supabase_list_role_pro(self):
        repo = UserRepository()
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_roles": [{"name": "Pro"}]}
        ]
        assert await repo.is_pro_user("u1", db=None, supabase=sb) is True

    @patch("app.repositories.user_repo.settings.USE_SUPABASE", True)
    async def test_supabase_dict_role_pro(self):
        repo = UserRepository()
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_roles": {"name": "pro"}}
        ]
        assert await repo.is_pro_user("u1", db=None, supabase=sb) is True

    @patch("app.repositories.user_repo.settings.USE_SUPABASE", True)
    async def test_supabase_malformed_roles(self):
        repo = UserRepository()
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_roles": "nope"}
        ]
        assert await repo.is_pro_user("u1", db=None, supabase=sb) is False

    @patch("app.repositories.user_repo.settings.USE_SUPABASE", True)
    async def test_supabase_exception_returns_false(self):
        repo = UserRepository()
        sb = MagicMock()
        sb.table.side_effect = RuntimeError("boom")
        assert await repo.is_pro_user("u1", db=None, supabase=sb) is False

    @patch("app.repositories.user_repo.settings.USE_SUPABASE", True)
    async def test_db_skips_empty_role_then_supabase_pro(self):
        repo = UserRepository()
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "role_name": None
        }
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_roles": [{"name": "Pro"}]}
        ]
        assert await repo.is_pro_user("u1", db=db, supabase=sb) is True

    async def test_db_execute_raises_returns_false(self):
        repo = UserRepository()
        db = MagicMock()
        db.execute.side_effect = RuntimeError("db error")
        assert await repo.is_pro_user("u1", db=db, supabase=None) is False
