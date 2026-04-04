"""
Kalan coverage boşlukları: deps, db, auth dalları, security_logger, chat_session,
rate_limit (Redis hata). (helpers: test_helpers_eula.py)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch, Mock

import jwt
import pytest
from fastapi import FastAPI, Depends, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

import app.db as db_module
from app.core import security as sec
from app.deps import get_current_user, get_current_user_optional, require_role
from app.main import app
from app.db import get_db, build_db_url
from app.rate_limit import check_rate_limit
from app import chat_session_storage as css

client = TestClient(app)


# --- security verify_jwt + verify_password edge ---
class TestSecurityExtra:
    def test_verify_jwt_invalid(self):
        with pytest.raises(ValueError, match="Invalid JWT"):
            sec.verify_jwt("not-a-jwt")

    def test_verify_password_bcrypt_error(self):
        with patch("app.core.security.bcrypt.checkpw", side_effect=RuntimeError("x")):
            assert sec.verify_password("a", "$2b$12$x" * 10) is False


# --- rate_limit redis failure (fail-open) ---
class TestRateLimitRedisError:
    def test_check_rate_limit_redis_raises(self):
        req = Mock()
        req.client = Mock()
        req.client.host = "1.1.1.1"
        bad_redis = MagicMock()
        bad_redis.get.side_effect = RuntimeError("redis down")
        with (
            patch("app.rate_limit.settings") as s,
            patch("app.rate_limit.redis_client", bad_redis),
        ):
            s.RATE_LIMIT_ENABLED = True
            assert check_rate_limit(req, "k", 5, 60) is True


# --- chat_session_storage ---
class TestChatSessionStorage:
    def test_truncate_long(self):
        t = "x" * (css.CONTEXT_TEXT_MAX_CHARS + 50)
        assert len(css.truncate_context_text(t) or "") == css.CONTEXT_TEXT_MAX_CHARS

    def test_append_chat_turn_no_session(self):
        db = MagicMock()
        with patch.object(css, "get_chat_session_by_ai_id", return_value=None):
            css.append_chat_turn(
                db,
                ai_session_id="a",
                user_id="u",
                user_message="h",
                assistant_message="b",
            )

    def test_history_for_ai_restore_filters(self):
        m1 = Mock(role="user", content="u")
        m2 = Mock(role="system", content="s")
        m3 = Mock(role="assistant", content="a")
        out = css.history_for_ai_restore([m1, m2, m3])
        assert len(out) == 2


# --- db: get_supabase + build_db_url + get_db ---
class TestDbHelpers:
    def test_get_supabase_missing_keys(self):
        with (
            patch.object(db_module, "SUPABASE_URL", ""),
            patch.object(db_module, "SUPABASE_KEY", ""),
        ):
            with pytest.raises(RuntimeError, match="missing"):
                db_module.get_supabase()

    def test_get_supabase_fallback_second_create_client(self):
        fake_client = object()
        with (
            patch.object(db_module, "SUPABASE_URL", "http://x"),
            patch.object(db_module, "SUPABASE_KEY", "k"),
            patch.object(db_module, "create_client") as cc,
        ):
            cc.side_effect = [TypeError("no options"), fake_client]
            out = db_module.get_supabase()
            assert out is fake_client
            assert cc.call_count == 2

    def test_build_db_url_supabase_branch(self, monkeypatch):
        monkeypatch.setenv("USE_SUPABASE", "true")
        with patch("app.db.settings") as st:
            st.SUPABASE_DATABASE_URL = "postgresql://u:p@h:5432/d"
            st.LOCAL_DATABASE_URL = None
            st.DATABASE_URL = None
            st.DB_USER = "a"
            st.DB_PASSWORD = "b"
            st.DB_HOST = "h"
            st.DB_PORT = "5432"
            st.DB_NAME = "n"
            st.DB_SSLMODE = "disable"
            url = build_db_url()
            assert "postgresql+psycopg2://" in url

    def test_build_db_url_local_components(self, monkeypatch):
        monkeypatch.setenv("USE_SUPABASE", "false")
        with patch("app.db.settings") as st:
            st.SUPABASE_DATABASE_URL = None
            st.LOCAL_DATABASE_URL = None
            st.DATABASE_URL = None
            st.DB_USER = "a"
            st.DB_PASSWORD = "b"
            st.DB_HOST = "h"
            st.DB_PORT = "5432"
            st.DB_NAME = "n"
            st.DB_SSLMODE = "disable"
            url = build_db_url()
            assert "postgresql+psycopg2://" in url


class TestGetDbGenerator:
    def test_get_db_session_local_none(self):
        with (
            patch.object(db_module, "SessionLocal", None),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            with pytest.raises(HTTPException) as ei:
                next(gen)
            assert ei.value.status_code == 503

    def test_get_db_engine_none(self):
        sm = MagicMock()
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", None),
        ):
            gen = db_module.get_db()
            with pytest.raises(HTTPException) as ei:
                next(gen)
            assert ei.value.status_code == 503

    def test_get_db_execute_operational_error(self):
        sess = MagicMock()
        sess.execute.side_effect = OperationalError("s", {}, None)
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            with pytest.raises(HTTPException) as ei:
                next(gen)
            assert ei.value.status_code == 503
            assert sess.close.called

    def test_get_db_yield_rollback_path(self):
        sess = MagicMock()
        sess.execute.return_value = None
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            db = next(gen)
            assert db is sess
            try:
                gen.throw(OperationalError("s", {}, None))
            except HTTPException as e:
                assert e.status_code == 503


# --- deps JWT ---
@pytest.fixture
def mini_dep_app():
    a = FastAPI()

    @a.get("/need")
    def need_user(user=Depends(get_current_user)):
        return {"sub": user["sub"]}

    @a.get("/opt")
    def opt_user(user=Depends(get_current_user_optional)):
        return {"u": user}

    return a


class TestDepsJwt:
    def test_get_current_user_expired(self, mini_dep_app):
        from app.config import settings

        tok = jwt.encode(
            {"sub": "x", "exp": 1},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        c = TestClient(mini_dep_app)
        r = c.get("/need", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401

    def test_get_current_user_invalid(self, mini_dep_app):
        c = TestClient(mini_dep_app)
        r = c.get("/need", headers={"Authorization": "Bearer notvalid"})
        assert r.status_code == 401

    def test_optional_no_header(self, mini_dep_app):
        c = TestClient(mini_dep_app)
        r = c.get("/opt")
        assert r.json()["u"] is None

    def test_optional_bad_token(self, mini_dep_app):
        c = TestClient(mini_dep_app)
        r = c.get("/opt", headers={"Authorization": "Bearer xxx"})
        assert r.json()["u"] is None

    def test_require_role_forbidden(self):
        from app.config import settings

        a = FastAPI()
        role_dep = require_role("admin")

        @a.get("/admin")
        def adm(user=Depends(role_dep)):
            return {"ok": True}

        tok = jwt.encode(
            {"sub": "u1", "exp": 9_999_999_999},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        mock_db = MagicMock()
        mock_user = MagicMock()
        mock_user.role = MagicMock()
        mock_user.role.name = "user"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        c = TestClient(a)
        a.dependency_overrides[get_db] = lambda: mock_db
        try:
            r = c.get("/admin", headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 403
        finally:
            a.dependency_overrides.clear()


# --- security_logger severities ---
class TestSecurityLoggerBranches:
    def test_log_security_event_critical_error_warning_info(self):
        from app.security_logger import log_security_event

        with patch("app.security_logger.logger") as lg:
            log_security_event("failed_login", severity="CRITICAL")
            log_security_event("failed_login", severity="ERROR")
            log_security_event("failed_login", severity="WARNING")
            log_security_event("failed_login", severity="INFO")
            assert lg.critical.called
            assert lg.error.called
            assert lg.warning.called
            assert lg.info.called

    def test_log_security_event_unknown_type(self):
        from app.security_logger import log_security_event

        with patch("app.security_logger.logger") as lg:
            log_security_event("unknown_type_xyz")
            assert lg.info.called

    def test_log_api_key_failed(self):
        from app.security_logger import log_api_key_failed

        with patch("app.security_logger.log_security_event") as le:
            log_api_key_failed("1.1.1.1", "/x")
            le.assert_called_once()


# --- auth router extra (mock supabase + db) ---
class TestAuthRouterBranches:
    @patch("app.security_logger.log_rate_limit_exceeded")
    @patch("app.routers.auth.check_rate_limit", return_value=False)
    def test_login_rate_limited(self, _mock_rl, _mock_log):
        from app.db import get_supabase, get_db

        mc = MagicMock()

        def _db():
            yield MagicMock()

        app.dependency_overrides[get_supabase] = lambda: mc
        app.dependency_overrides[get_db] = _db
        try:
            r = client.post(
                "/auth/login",
                json={"email": "a@b.com", "password": "x"},
            )
            assert r.status_code == 429
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit", return_value=True)
    def test_register_eula_required(self, _mock_rl):
        from app.db import get_supabase, get_db

        def _db():
            yield MagicMock()

        app.dependency_overrides[get_supabase] = lambda: MagicMock()
        app.dependency_overrides[get_db] = _db
        try:
            r = client.post(
                "/auth/register",
                json={
                    "username": "usr",
                    "email": "e@e.com",
                    "password": "ValidPass123",
                    "eula_accepted": False,
                },
            )
            assert r.status_code == 400
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.check_rate_limit", return_value=False)
    def test_google_rate_limited(self, _rl):
        from app.db import get_supabase

        app.dependency_overrides[get_supabase] = lambda: MagicMock()
        try:
            r = client.post("/auth/google", json={"id_token": "t"})
            assert r.status_code == 429
        finally:
            app.dependency_overrides.clear()
