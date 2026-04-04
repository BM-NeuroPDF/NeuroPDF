"""Son %100 itişi: chat_session, deps, db, security_logger."""

from __future__ import annotations

from unittest.mock import MagicMock, patch, Mock

import jwt
import pytest
from fastapi import FastAPI, Depends, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

import app.db as db_module
from app.config import settings
from app.deps import get_current_user, get_current_user_optional, require_role
from app import chat_session_storage as css
from app.db import get_db as get_db_dep


class TestChatSessionRemaining:
    def test_truncate_none(self):
        assert css.truncate_context_text(None) is None

    def test_get_chat_session_by_db_id(self):
        db = MagicMock()
        sess = Mock()
        db.query.return_value.filter.return_value.first.return_value = sess
        assert css.get_chat_session_by_db_id(db, "sid", "uid") is sess

    def test_list_user_chat_sessions(self):
        db = MagicMock()
        rows = [Mock()]
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = rows
        assert css.list_user_chat_sessions(db, "u") == rows

    def test_get_session_messages_ordered_with_session(self):
        db = MagicMock()
        session = Mock()
        session.id = "s1"
        msgs = [Mock()]
        db.query.return_value.filter.return_value.first.return_value = session
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = msgs
        # İlk query: get_chat_session_by_db_id; ikinci: messages
        q1 = MagicMock()
        q1.filter.return_value.first.return_value = session
        q2 = MagicMock()
        q2.filter.return_value.order_by.return_value.all.return_value = msgs

        def query_side(model):
            name = getattr(model, "__name__", str(model))
            if "PdfChatSession" in name or "PdfChatSession" == getattr(
                model, "__name__", ""
            ):
                return q1
            return q2

        db.query.side_effect = lambda m: q1 if m is css.PdfChatSession else q2
        from app.models import PdfChatSession

        db.query.side_effect = lambda m: q1 if m is PdfChatSession else q2
        out = css.get_session_messages_ordered(db, "dbid", "uid")
        assert out == msgs

    def test_get_session_messages_ordered_no_session(self):
        db = MagicMock()
        with patch.object(css, "get_chat_session_by_db_id", return_value=None):
            assert css.get_session_messages_ordered(db, "x", "y") == []


class TestDepsRemaining:
    def test_optional_valid_token_line_87(self):
        app = FastAPI()

        @app.get("/o")
        def o(u=Depends(get_current_user_optional)):
            return u

        tok = jwt.encode(
            {"sub": "x", "exp": 9_999_999_999},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        c = TestClient(app)
        r = c.get("/o", headers={"Authorization": f"Bearer {tok}"})
        assert r.json() is not None

    def test_expired_token_logging_suppressed(self):
        app = FastAPI()

        @app.get("/n")
        def n(u=Depends(get_current_user)):
            return u

        with patch("app.security_logger.log_invalid_token", side_effect=RuntimeError):
            tok = jwt.encode(
                {"sub": "x", "exp": 1}, settings.JWT_SECRET, algorithm="HS256"
            )
            c = TestClient(app)
            r = c.get("/n", headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 401

    def test_invalid_token_logging_suppressed(self):
        app = FastAPI()

        @app.get("/n")
        def n(u=Depends(get_current_user)):
            return u

        with patch("app.security_logger.log_invalid_token", side_effect=RuntimeError):
            c = TestClient(app)
            r = c.get("/n", headers={"Authorization": "Bearer x.y.z"})
            assert r.status_code == 401

    def test_require_role_no_sub(self):
        a = FastAPI()
        dep = require_role("admin")

        @a.get("/r")
        def r(user=Depends(dep)):
            return {}

        tok = jwt.encode(
            {"exp": 9_999_999_999},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        c = TestClient(a)
        a.dependency_overrides[get_db_dep] = lambda: MagicMock()
        try:
            resp = c.get("/r", headers={"Authorization": f"Bearer {tok}"})
            assert resp.status_code == 401
        finally:
            a.dependency_overrides.clear()

    def test_require_role_user_missing(self):
        from app.db import get_db

        a = FastAPI()
        dep = require_role("admin")

        @a.get("/r")
        def r(user=Depends(dep)):
            return {}

        tok = jwt.encode(
            {"sub": "uid1", "exp": 9_999_999_999},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        c = TestClient(a)
        a.dependency_overrides[get_db] = lambda: mock_db
        try:
            resp = c.get("/r", headers={"Authorization": f"Bearer {tok}"})
            assert resp.status_code == 404
        finally:
            a.dependency_overrides.clear()

    def test_require_role_admin_ok(self):
        from app.db import get_db

        a = FastAPI()
        dep = require_role("admin")

        @a.get("/r")
        def r(user=Depends(dep)):
            return {"ok": True}

        tok = jwt.encode(
            {"sub": "uid1", "exp": 9_999_999_999},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        mock_db = MagicMock()
        mock_u = MagicMock()
        mock_u.role = MagicMock()
        mock_u.role.name = "admin"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_u
        c = TestClient(a)
        a.dependency_overrides[get_db] = lambda: mock_db
        try:
            resp = c.get("/r", headers={"Authorization": f"Bearer {tok}"})
            assert resp.status_code == 200
        finally:
            a.dependency_overrides.clear()


class TestSecurityLoggerRequest:
    def test_extract_ip_from_request(self):
        from app.security_logger import log_security_event
        from fastapi import Request

        scope = {
            "type": "http",
            "headers": [],
            "client": ("10.0.0.1", 1234),
            "method": "GET",
            "path": "/",
        }
        req = Request(scope)
        with patch("app.security_logger.logger"):
            log_security_event("failed_login", request=req)


class TestDbRemaining:
    def test_get_supabase_raises_after_both_fail(self):
        with (
            patch.object(db_module, "SUPABASE_URL", "u"),
            patch.object(db_module, "SUPABASE_KEY", "k"),
            patch.object(db_module, "create_client", side_effect=Exception("fail")),
        ):
            with pytest.raises(Exception, match="fail"):
                db_module.get_supabase()

    @patch.dict("os.environ", {"ENVIRONMENT": "production"})
    def test_get_supabase_production_verify_ssl(self):
        with (
            patch.object(db_module, "SUPABASE_URL", "https://x.supabase.co"),
            patch.object(db_module, "SUPABASE_KEY", "k"),
            patch.object(db_module, "create_client") as cc,
        ):
            cc.return_value = object()
            out = db_module.get_supabase()
            assert out is not None
            kwargs = cc.call_args.kwargs
            assert "options" in kwargs
            assert "http_client" in kwargs["options"]
            assert cc.called

    def test_build_db_url_database_url_fallback(self, monkeypatch):
        monkeypatch.setenv("USE_SUPABASE", "false")
        with patch.object(db_module, "settings") as st:
            st.SUPABASE_DATABASE_URL = None
            st.LOCAL_DATABASE_URL = None
            st.DATABASE_URL = "postgresql://a:b@h:5432/d"
            st.DB_USER = "a"
            st.DB_PASSWORD = "b"
            st.DB_HOST = "h"
            st.DB_PORT = "5432"
            st.DB_NAME = "n"
            st.DB_SSLMODE = "disable"
            url = db_module.build_db_url()
            assert "postgresql+psycopg2://" in url

    def test_get_db_generic_exception_on_execute(self):
        sess = MagicMock()
        sess.execute.side_effect = ValueError("boom")
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            with pytest.raises(HTTPException) as ei:
                next(gen)
            assert ei.value.status_code == 503

    def test_get_db_http_exception_reraise(self):
        sess = MagicMock()
        sess.execute.return_value = None
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            next(gen)
            with pytest.raises(HTTPException) as hi:
                gen.throw(HTTPException(status_code=418, detail="teapot"))
            assert hi.value.status_code == 418

    def test_get_db_generic_in_yield(self):
        sess = MagicMock()
        sess.execute.return_value = None
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            next(gen)
            with pytest.raises(ValueError):
                gen.throw(ValueError("x"))

    def test_get_db_close_operational_error_ignored(self):
        sess = MagicMock()
        sess.execute.return_value = None
        sess.close.side_effect = OperationalError("x", {}, None)
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            next(gen)
            gen.close()

    def test_get_db_close_fails_after_operational_error(self):
        sess = MagicMock()
        sess.execute.side_effect = OperationalError("a", {}, None)
        sess.close.side_effect = RuntimeError("close")
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            with pytest.raises(HTTPException):
                next(gen)

    def test_get_db_close_fails_after_generic_execute_error(self):
        sess = MagicMock()
        sess.execute.side_effect = ValueError("boom")
        sess.close.side_effect = RuntimeError("close")
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            with pytest.raises(HTTPException):
                next(gen)

    def test_get_db_yield_rollback_fails_operational(self):
        sess = MagicMock()
        sess.execute.return_value = None
        sess.rollback.side_effect = RuntimeError("rb")
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            next(gen)
            with pytest.raises(HTTPException):
                gen.throw(OperationalError("a", {}, None))

    def test_get_db_yield_rollback_fails_generic(self):
        sess = MagicMock()
        sess.execute.return_value = None
        sess.rollback.side_effect = RuntimeError("rb")
        sm = MagicMock(return_value=sess)
        with (
            patch.object(db_module, "SessionLocal", sm),
            patch.object(db_module, "engine", object()),
        ):
            gen = db_module.get_db()
            next(gen)
            with pytest.raises(ValueError):
                gen.throw(ValueError("inner"))
