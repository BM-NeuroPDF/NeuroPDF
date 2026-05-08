from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException, Request, Response
from fastapi.testclient import TestClient

from app.db import get_db, get_supabase
from app.main import app
from app import rate_limit
from app.routers.auth import get_current_user_dep
from app.routers.auth import legacy_handlers as lh
from app.schemas import auth as auth_schemas

client = TestClient(app)


def _override_db_and_supabase(mock_db: MagicMock | None = None) -> None:
    db = mock_db or MagicMock()

    def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_supabase] = lambda: MagicMock()


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _reset_rate_limit_state() -> None:
    rate_limit._LOCAL_DEGRADED.clear()
    rate_limit._REDIS_FAIL_COUNT = 0
    rate_limit._REDIS_BREAKER_OPEN_UNTIL = 0.0
    yield
    rate_limit._LOCAL_DEGRADED.clear()
    rate_limit._REDIS_FAIL_COUNT = 0
    rate_limit._REDIS_BREAKER_OPEN_UNTIL = 0.0


@patch("app.routers.auth.legacy_handlers._l.check_rate_limit", return_value=True)
@patch("app.routers.auth.legacy_handlers._l.settings.USE_SUPABASE", False)
@patch("app.routers.auth.legacy_handlers._l.security.hash_password", return_value="h")
@patch("app.routers.auth.legacy_handlers._l.security.create_jwt", return_value="jwt")
@patch("app.routers.auth.legacy_handlers.auth_service.create_user_avatar")
def test_register_happy_local(
    _avatar: MagicMock,
    _jwt: MagicMock,
    _hash: MagicMock,
    _rate_limit: MagicMock,
) -> None:
    db = MagicMock()
    db.execute.return_value.first.return_value = None
    _override_db_and_supabase(db)
    try:
        resp = client.post(
            "/auth/register",
            json={
                "username": "new_user_1",
                "email": "new_user_1@example.com",
                "password": "StrongPass123",
                "eula_accepted": True,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"] == "jwt"
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._l.settings.REFRESH_TOKENS_ENABLED", True)
@patch("app.routers.auth.legacy_handlers._l.settings.USE_SUPABASE", False)
@patch("app.routers.auth.legacy_handlers._extract_refresh_token", return_value="r1")
@patch(
    "app.routers.auth.legacy_handlers.rotate_refresh_token",
    return_value=("u1", "r2"),
)
@patch(
    "app.routers.auth.legacy_handlers._load_user_claim_material",
    return_value=("u1@example.com", "u1", True),
)
@patch(
    "app.routers.auth.legacy_handlers._l.security.create_jwt", return_value="jwt-new"
)
@patch("app.routers.auth.legacy_handlers._set_refresh_cookie")
def test_refresh_happy_path(
    _set_cookie: MagicMock,
    _jwt: MagicMock,
    _claims: MagicMock,
    _rotate: MagicMock,
    _extract: MagicMock,
) -> None:
    db = MagicMock()
    _override_db_and_supabase(db)
    try:
        resp = client.post("/auth/refresh", json={"refresh_token": "r1"})
        assert resp.status_code == 200
        assert resp.json()["access_token"] == "jwt-new"
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._l.settings.REFRESH_TOKENS_ENABLED", True)
@patch("app.routers.auth.legacy_handlers._l.settings.USE_SUPABASE", False)
@patch("app.routers.auth.legacy_handlers._extract_refresh_token", return_value=None)
def test_refresh_auth_error_missing_token(
    _extract: MagicMock,
) -> None:
    _override_db_and_supabase(MagicMock())
    try:
        resp = client.post("/auth/refresh", json={})
        assert resp.status_code == 401
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._l.settings.REFRESH_TOKENS_ENABLED", True)
@patch("app.routers.auth.legacy_handlers._l.settings.USE_SUPABASE", False)
@patch("app.routers.auth.legacy_handlers._extract_refresh_token", return_value="r1")
def test_logout_happy_path(
    _extract: MagicMock,
) -> None:
    _override_db_and_supabase(MagicMock())
    try:
        resp = client.post("/auth/logout", json={"refresh_token": "r1"})
        assert resp.status_code == 200
        assert resp.json()["message"] == "Logged out"
    finally:
        _clear_overrides()


def test_logout_all_auth_error_without_user() -> None:
    _override_db_and_supabase(MagicMock())
    try:
        resp = client.post("/auth/logout-all")
        assert resp.status_code in (401, 403)
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._l.settings.REFRESH_TOKENS_ENABLED", False)
def test_logout_all_happy_with_user() -> None:
    _override_db_and_supabase(MagicMock())
    app.dependency_overrides[get_current_user_dep] = lambda: {
        "sub": "u1",
        "email": "u1@x.com",
    }
    try:
        resp = client.post("/auth/logout-all")
        assert resp.status_code == 200
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._primary_auth_provider", return_value="google")
@patch(
    "app.routers.auth.legacy_handlers._l.security.generate_six_digit_otp",
    return_value="123456",
)
@patch("app.routers.auth.legacy_handlers._l.security.hash_password", return_value="h")
@patch("app.routers.auth.legacy_handlers._set_deletion_otp_in_redis")
@patch("app.routers.auth.legacy_handlers._l.send_deletion_otp_email")
def test_request_deletion_otp_happy(
    _send_email: MagicMock,
    _set_otp: MagicMock,
    _hash: MagicMock,
    _gen: MagicMock,
    _provider: MagicMock,
) -> None:
    _override_db_and_supabase(MagicMock())
    app.dependency_overrides[get_current_user_dep] = lambda: {
        "sub": "u1",
        "email": "u1@example.com",
    }
    try:
        resp = client.post("/auth/request-deletion-otp")
        assert resp.status_code == 200
        assert resp.json()["message"] == "OTP sent"
    finally:
        _clear_overrides()


def test_request_deletion_otp_auth_error_without_user() -> None:
    _override_db_and_supabase(MagicMock())
    try:
        resp = client.post("/auth/request-deletion-otp")
        assert resp.status_code in (401, 403)
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._primary_auth_provider", return_value="local")
@patch("app.routers.auth.legacy_handlers._verify_password_for_account_deletion")
@patch(
    "app.routers.auth.legacy_handlers._execute_account_deletion",
    return_value={"message": "Account deleted"},
)
def test_verify_and_delete_happy_local(
    _execute: MagicMock,
    _verify_pw: MagicMock,
    _provider: MagicMock,
) -> None:
    _override_db_and_supabase(MagicMock())
    app.dependency_overrides[get_current_user_dep] = lambda: {
        "sub": "u1",
        "email": "u1@example.com",
    }
    try:
        resp = client.post("/auth/verify-and-delete", json={"password": "Secret123!"})
        assert resp.status_code == 200
        assert resp.json()["message"] == "Account deleted"
    finally:
        _clear_overrides()


def test_verify_and_delete_auth_error_without_user() -> None:
    _override_db_and_supabase(MagicMock())
    try:
        resp = client.post("/auth/verify-and-delete", json={"password": "x"})
        assert resp.status_code in (401, 403)
    finally:
        _clear_overrides()


@patch("app.routers.auth.legacy_handlers._verify_password_for_account_deletion")
@patch(
    "app.routers.auth.legacy_handlers._execute_account_deletion",
    return_value={"message": "Account deleted"},
)
def test_delete_account_happy(
    _execute: MagicMock,
    _verify_pw: MagicMock,
) -> None:
    _override_db_and_supabase(MagicMock())
    app.dependency_overrides[get_current_user_dep] = lambda: {
        "sub": "u1",
        "email": "u1@example.com",
    }
    try:
        resp = client.request(
            "DELETE", "/auth/delete-account", json={"password": "Secret123!"}
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Account deleted"
    finally:
        _clear_overrides()


def _request() -> Request:
    scope = {
        "type": "http",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "method": "POST",
        "path": "/",
    }
    return Request(scope)


def test_google_login_invalid_token_paths() -> None:
    req = _request()
    res = Response()
    with patch.object(
        lh.auth_service, "verify_google_token", side_effect=Exception("bad")
    ):
        with pytest.raises(HTTPException) as exc:
            lh.google_login(
                res,
                req,
                auth_schemas.GoogleExchangeIn(id_token="x"),
                MagicMock(),
                MagicMock(),
            )
    assert exc.value.status_code == 401

    with patch.object(
        lh.auth_service, "verify_google_token", return_value={"email": "x@y.com"}
    ):
        with pytest.raises(HTTPException) as exc2:
            lh.google_login(
                res,
                req,
                auth_schemas.GoogleExchangeIn(id_token="x"),
                MagicMock(),
                MagicMock(),
            )
    assert exc2.value.status_code == 401


def test_google_login_local_error_and_user_not_found() -> None:
    req, res = _request(), Response()
    db = MagicMock()
    db.execute.side_effect = Exception("db fail")
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(
            lh.auth_service,
            "verify_google_token",
            return_value={"sub": "s", "email": "x@y.com", "name": "n"},
        ),
    ):
        with pytest.raises(Exception) as exc:
            lh.google_login(
                res, req, auth_schemas.GoogleExchangeIn(id_token="x"), MagicMock(), db
            )
    assert "db fail" in str(exc.value)

    db2 = MagicMock()
    m1 = MagicMock()
    m1.mappings.return_value.first.return_value = {"user_id": "u1"}
    m2 = MagicMock()
    m2.mappings.return_value.first.return_value = None
    db2.execute.side_effect = [m1, m2]
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(
            lh.auth_service,
            "verify_google_token",
            return_value={"sub": "s", "email": "x@y.com", "name": "n"},
        ),
    ):
        with pytest.raises(HTTPException) as exc2:
            lh.google_login(
                res, req, auth_schemas.GoogleExchangeIn(id_token="x"), MagicMock(), db2
            )
    assert exc2.value.status_code == 500


def test_register_rate_limit_and_local_conflicts_and_errors() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.RegisterIn(
        username="u_123", email="u@test.com", password="Aa123456", eula_accepted=True
    )
    with patch.object(lh._l, "check_rate_limit", return_value=False):
        with pytest.raises(HTTPException) as exc:
            lh.register_user(res, req, payload, MagicMock(), MagicMock())
    assert exc.value.status_code == 429

    db = MagicMock()
    db.execute.return_value.first.return_value = True
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
    ):
        with pytest.raises(HTTPException) as e2:
            lh.register_user(res, req, payload, MagicMock(), db)
    assert e2.value.detail == "Username already taken"

    db2 = MagicMock()
    first = MagicMock()
    first.first.return_value = None
    second = MagicMock()
    second.first.return_value = True
    db2.execute.side_effect = [first, second]
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
    ):
        with pytest.raises(HTTPException) as e3:
            lh.register_user(res, req, payload, MagicMock(), db2)
    assert e3.value.detail == "Email already taken"

    db3 = MagicMock()
    first3 = MagicMock()
    first3.first.return_value = None
    second3 = MagicMock()
    second3.first.return_value = None
    db3.execute.side_effect = [first3, second3, Exception("insert fail")]
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
    ):
        with pytest.raises(Exception):
            lh.register_user(res, req, payload, MagicMock(), db3)


def test_register_supabase_branches() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.RegisterIn(
        username="u_123", email="u@test.com", password="Aa123456", eula_accepted=True
    )
    supa = MagicMock()
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", True),
        patch.object(lh._l, "check_rate_limit", return_value=True),
    ):
        supa.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "x"}
        ]
        with pytest.raises(HTTPException):
            lh.register_user(res, req, payload, supa, MagicMock())


@pytest.mark.asyncio
async def test_login_local_branch_failures_and_redis_paths() -> None:
    req = _request()
    bg = BackgroundTasks()
    payload = auth_schemas.LoginIn(email="u@test.com", password="Aa123456")
    db = MagicMock()
    m = MagicMock()
    m.mappings.return_value.first.return_value = None
    db.execute.return_value = m
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
    ):
        with pytest.raises(HTTPException) as exc:
            await lh.login(req, bg, payload, MagicMock(), db)
    assert exc.value.status_code == 401

    row = {"id": 1, "user_id": "u1", "password_hash": "legacy"}
    m2 = MagicMock()
    m2.mappings.return_value.first.return_value = row
    db2 = MagicMock()
    db2.execute.return_value = m2
    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh, "_sha256_hex_equals_legacy_stored", return_value=False),
    ):
        with pytest.raises(HTTPException):
            await lh.login(req, bg, payload, MagicMock(), db2)

    with (
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh, "_sha256_hex_equals_legacy_stored", return_value=True),
        patch.object(
            lh._l, "set_redis_otp", new=AsyncMock(side_effect=lh.RedisOtpUnavailable())
        ),
    ):
        awaitable_db = MagicMock()
        awaitable_db.execute.return_value = m2
        with pytest.raises(HTTPException) as ex2:
            await lh.login(req, bg, payload, MagicMock(), awaitable_db)
    assert ex2.value.status_code == 503


@pytest.mark.asyncio
async def test_verify_2fa_failure_paths() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.Verify2FAIn(temp_token="x", otp_code="123456")
    with patch.object(lh._l, "check_rate_limit", return_value=False):
        with pytest.raises(HTTPException) as e1:
            await lh.verify_2fa(res, req, payload, MagicMock(), MagicMock())
    assert e1.value.status_code == 429

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=True),
    ):
        with pytest.raises(HTTPException) as e2:
            await lh.verify_2fa(res, req, payload, MagicMock(), MagicMock())
    assert e2.value.status_code == 429


def test_refresh_remaining_branches() -> None:
    req, res = _request(), Response()
    db = MagicMock()
    payload = auth_schemas.RefreshIn(refresh_token="x")
    with patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", False):
        with pytest.raises(HTTPException) as e1:
            lh.refresh_access_token(req, res, payload, db)
    assert e1.value.status_code == 404

    with (
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        with pytest.raises(HTTPException) as e2:
            lh.refresh_access_token(req, res, payload, db)
    assert e2.value.status_code == 503

    with (
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh, "_extract_refresh_token", return_value="x"),
        patch.object(
            lh, "rotate_refresh_token", side_effect=lh.RefreshTokenError("bad")
        ),
    ):
        with pytest.raises(HTTPException) as e3:
            lh.refresh_access_token(req, res, payload, db)
    assert e3.value.status_code == 401


def test_logout_supabase_and_disabled_branches() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.RefreshIn(refresh_token="x")
    with patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", False):
        assert lh.logout(req, res, payload, MagicMock())["message"] == "Logged out"
    with (
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        assert lh.logout(req, res, payload, MagicMock())["message"] == "Logged out"


def test_logout_all_supabase_branch() -> None:
    res = Response()
    with (
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        out = lh.logout_all(res, {"sub": "u1"}, MagicMock())
    assert out["message"] == "Logged out from all devices"


def test_request_deletion_otp_error_paths() -> None:
    bg = BackgroundTasks()
    user = {"sub": "u1", "email": "u1@test.com"}
    with patch.object(lh, "_primary_auth_provider", return_value="local"):
        with pytest.raises(HTTPException) as e1:
            lh.request_deletion_otp(bg, user, MagicMock(), MagicMock())
    assert e1.value.status_code == 400

    with patch.object(lh, "_primary_auth_provider", return_value="google"):
        with pytest.raises(HTTPException) as e2:
            lh.request_deletion_otp(
                bg, {"sub": "u1", "email": " "}, MagicMock(), MagicMock()
            )
    assert e2.value.status_code == 400

    with (
        patch.object(lh, "_primary_auth_provider", return_value="google"),
        patch.object(
            lh, "_set_deletion_otp_in_redis", side_effect=lh.RedisOtpUnavailable()
        ),
    ):
        with pytest.raises(HTTPException) as e3:
            lh.request_deletion_otp(bg, user, MagicMock(), MagicMock())
    assert e3.value.status_code == 503


def test_verify_and_delete_error_paths() -> None:
    user = {"sub": "u1", "email": "u1@test.com"}
    with patch.object(lh, "_primary_auth_provider", return_value="local"):
        with pytest.raises(HTTPException) as e1:
            lh.verify_and_delete(
                auth_schemas.VerifyAndDeleteAccountIn(password=""),
                user,
                MagicMock(),
                MagicMock(),
            )
    assert e1.value.status_code == 400

    with patch.object(lh, "_primary_auth_provider", return_value="google"):
        with pytest.raises(HTTPException) as e2:
            lh.verify_and_delete(
                auth_schemas.VerifyAndDeleteAccountIn(otp=None),
                user,
                MagicMock(),
                MagicMock(),
            )
    assert e2.value.status_code == 400


def test_google_login_local_try_and_avatar_warning_paths() -> None:
    req, res = _request(), Response()
    db = MagicMock()
    q1 = MagicMock()
    q1.mappings.return_value.first.return_value = None
    db.execute.side_effect = [q1, Exception("insert-fail")]
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(
            lh.auth_service,
            "verify_google_token",
            return_value={"sub": "s", "email": "x@y.com", "name": "n"},
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            lh.google_login(
                res, req, auth_schemas.GoogleExchangeIn(id_token="x"), MagicMock(), db
            )
    assert exc.value.status_code == 500

    db2 = MagicMock()
    q2 = MagicMock()
    q2.mappings.return_value.first.return_value = None
    db2.execute.side_effect = [q2, MagicMock(), MagicMock(), MagicMock(), MagicMock()]
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(
            lh.auth_service,
            "verify_google_token",
            return_value={"sub": "s", "email": "x@y.com", "name": "n"},
        ),
        patch.object(
            lh.auth_service, "create_user_avatar", side_effect=Exception("avatar")
        ),
        patch.object(lh, "_issue_auth_out", return_value={"ok": True}),
    ):
        out = lh.google_login(
            res, req, auth_schemas.GoogleExchangeIn(id_token="x"), MagicMock(), db2
        )
    assert out["ok"] is True


def test_register_supabase_happy_and_local_tail_paths() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.RegisterIn(
        username="u_123", email="u@test.com", password="Aa123456", eula_accepted=True
    )
    supa = MagicMock()
    empty = MagicMock()
    empty.data = []
    created = MagicMock()
    created.data = [{"id": "u1", "username": "u_123"}]
    supa.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
        empty,
        empty,
    ]
    supa.table.return_value.insert.return_value.execute.return_value = created
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(lh._l.security, "create_jwt", return_value="tok"),
    ):
        out = lh.register_user(res, req, payload, supa, MagicMock())
    assert out["access_token"] == "tok"

    db = MagicMock()
    none_first = MagicMock()
    none_first.first.return_value = None
    db.execute.side_effect = [
        none_first,
        none_first,
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
    ]
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(
            lh.auth_service, "create_user_avatar", side_effect=Exception("avatar")
        ),
        patch.object(lh._l.security, "create_jwt", return_value="tok"),
        patch.object(lh, "issue_refresh_token", return_value=MagicMock(token="rt")),
    ):
        out2 = lh.register_user(res, req, payload, MagicMock(), db)
    assert out2["access_token"] == "tok"


def test_register_supabase_remaining_error_paths() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.RegisterIn(
        username="u_123", email="u@test.com", password="Aa123456", eula_accepted=True
    )
    supa = MagicMock()
    empty = MagicMock()
    empty.data = []
    email_taken = MagicMock()
    email_taken.data = [{"user_id": "x"}]
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        supa.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            empty,
            email_taken,
        ]
        with pytest.raises(HTTPException) as e1:
            lh.register_user(res, req, payload, supa, MagicMock())
    assert e1.value.detail == "Email already taken"

    supa2 = MagicMock()
    empty2 = MagicMock()
    empty2.data = []
    created_none = MagicMock()
    created_none.data = []
    supa2.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
        empty2,
        empty2,
    ]
    supa2.table.return_value.insert.return_value.execute.return_value = created_none
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        with pytest.raises(HTTPException) as e2:
            lh.register_user(res, req, payload, supa2, MagicMock())
    assert e2.value.status_code == 500

    supa3 = MagicMock()
    created = MagicMock()
    created.data = [{"id": "u1", "username": "u_123"}]
    supa3.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
        empty2,
        empty2,
    ]
    supa3.table.return_value.insert.return_value.execute.return_value = created
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
        patch.object(
            lh.auth_service, "create_user_avatar", side_effect=Exception("avatar")
        ),
        patch.object(lh._l.security, "create_jwt", return_value="tok"),
    ):
        out = lh.register_user(res, req, payload, supa3, MagicMock())
    assert out["access_token"] == "tok"


@pytest.mark.asyncio
async def test_login_and_verify_remaining_error_branches() -> None:
    req = _request()
    bg = BackgroundTasks()
    payload = auth_schemas.LoginIn(email="u@test.com", password="Aa123456")
    auth_rec = {"id": 1, "user_id": "u1", "password_hash": "legacy-hash"}
    supa = MagicMock()
    supa.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        auth_rec
    ]
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
        patch.object(lh, "_sha256_hex_equals_legacy_stored", return_value=True),
        patch.object(
            lh._l,
            "set_redis_otp",
            new=AsyncMock(side_effect=HTTPException(status_code=400, detail="x")),
        ),
    ):
        with pytest.raises(HTTPException):
            await lh.login(req, bg, payload, supa, MagicMock())

    db = MagicMock()
    row = MagicMock()
    row.mappings.return_value.first.return_value = {
        "id": 1,
        "user_id": "u1",
        "password_hash": "$2b$x",
    }
    db.execute.return_value = row
    db.rollback.side_effect = Exception("rb")
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(
            lh._l, "set_redis_otp", new=AsyncMock(side_effect=Exception("boom"))
        ),
    ):
        with pytest.raises(HTTPException) as e:
            await lh.login(req, bg, payload, MagicMock(), db)
    assert e.value.status_code == 503

    vr = auth_schemas.Verify2FAIn(temp_token="t", otp_code="123456")
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "", "email": ""},
        ),
    ):
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, MagicMock(), MagicMock())


@pytest.mark.asyncio
async def test_verify_2fa_post_validation_branches() -> None:
    req = _request()
    vr = auth_schemas.Verify2FAIn(temp_token="t", otp_code="123456")
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value=None)),
    ):
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, MagicMock(), MagicMock())

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value="h")),
        patch.object(lh._l.security, "verify_password", return_value=False),
    ):
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, MagicMock(), MagicMock())

    supa = MagicMock()
    supa.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value="h")),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(lh._l, "delete_redis_otp", new=AsyncMock()),
        patch.object(
            lh._l.user_repo,
            "mark_email_as_verified",
            new=AsyncMock(side_effect=Exception("x")),
        ),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, supa, MagicMock())

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value="h")),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(lh._l, "delete_redis_otp", new=AsyncMock()),
        patch.object(
            lh._l.user_repo,
            "mark_email_as_verified",
            new=AsyncMock(side_effect=Exception("x")),
        ),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
    ):
        db = MagicMock()
        db.rollback.side_effect = Exception("rb")
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, MagicMock(), db)

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value="h")),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(lh._l, "delete_redis_otp", new=AsyncMock()),
        patch.object(
            lh._l.user_repo, "mark_email_as_verified", new=AsyncMock(return_value=None)
        ),
        patch.object(lh._l.settings, "USE_SUPABASE", True),
    ):
        supa2 = MagicMock()
        supa2.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, supa2, MagicMock())

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
    ):
        bad = auth_schemas.Verify2FAIn(temp_token="t", otp_code="12a456")
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, bad, MagicMock(), MagicMock())

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value="h")),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(lh._l, "delete_redis_otp", new=AsyncMock()),
        patch.object(
            lh._l.user_repo, "mark_email_as_verified", new=AsyncMock(return_value=None)
        ),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
    ):
        db2 = MagicMock()
        m_user = MagicMock()
        m_user.mappings.return_value.first.return_value = None
        m_set = MagicMock()
        m_set.mappings.return_value.first.return_value = {"eula_accepted": True}
        db2.execute.side_effect = [m_user, m_set]
        with pytest.raises(HTTPException):
            await lh.verify_2fa(Response(), req, vr, MagicMock(), db2)

    with (
        patch.object(lh._l, "check_rate_limit", return_value=True),
        patch.object(lh._l, "is_2fa_verify_locked", return_value=False),
        patch.object(
            lh._l.security,
            "decode_2fa_pending_token",
            return_value={"sub": "u1", "email": "u@test.com"},
        ),
        patch.object(lh._l, "get_redis_otp", new=AsyncMock(return_value="h")),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(lh._l, "delete_redis_otp", new=AsyncMock()),
        patch.object(
            lh._l.user_repo, "mark_email_as_verified", new=AsyncMock(return_value=None)
        ),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh, "_issue_auth_out", return_value={"ok": True}),
    ):
        db3 = MagicMock()
        m_user_ok = MagicMock()
        m_user_ok.mappings.return_value.first.return_value = {
            "id": "u1",
            "username": "u",
        }
        m_set_ok = MagicMock()
        m_set_ok.mappings.return_value.first.return_value = {"eula_accepted": True}
        db3.execute.side_effect = [m_user_ok, m_set_ok]
        out = await lh.verify_2fa(Response(), req, vr, MagicMock(), db3)
    assert out["ok"] is True


def test_refresh_reuse_sentry_except_and_deletion_otp_paths() -> None:
    req, res = _request(), Response()
    payload = auth_schemas.RefreshIn(refresh_token="x")
    db = MagicMock()
    reuse = lh.RefreshTokenReuseDetected("u1")
    with (
        patch.object(lh._l.settings, "REFRESH_TOKENS_ENABLED", True),
        patch.object(lh._l.settings, "USE_SUPABASE", False),
        patch.object(lh, "_extract_refresh_token", return_value="x"),
        patch.object(lh, "rotate_refresh_token", side_effect=reuse),
        patch.dict(
            "sys.modules",
            {
                "sentry_sdk": MagicMock(
                    capture_message=MagicMock(side_effect=Exception("s"))
                )
            },
        ),
    ):
        with pytest.raises(HTTPException):
            lh.refresh_access_token(req, res, payload, db)

    user = {"sub": "u1", "email": "u1@test.com"}
    with (
        patch.object(lh, "_primary_auth_provider", return_value="google"),
        patch.object(lh, "_set_deletion_otp_in_redis", side_effect=Exception("x")),
    ):
        with pytest.raises(HTTPException):
            lh.request_deletion_otp(BackgroundTasks(), user, MagicMock(), MagicMock())

    with patch.object(lh, "_primary_auth_provider", return_value="google"):
        with pytest.raises(HTTPException):
            lh.verify_and_delete(
                auth_schemas.VerifyAndDeleteAccountIn(otp="12 34ab"),
                user,
                MagicMock(),
                MagicMock(),
            )

    with (
        patch.object(lh, "_primary_auth_provider", return_value="google"),
        patch.object(lh, "_get_deletion_otp_from_redis", return_value=None),
    ):
        with pytest.raises(HTTPException):
            lh.verify_and_delete(
                auth_schemas.VerifyAndDeleteAccountIn(otp="123456"),
                user,
                MagicMock(),
                MagicMock(),
            )

    with (
        patch.object(lh, "_primary_auth_provider", return_value="google"),
        patch.object(lh, "_get_deletion_otp_from_redis", return_value="stored"),
        patch.object(lh._l.security, "verify_password", return_value=False),
    ):
        with pytest.raises(HTTPException):
            lh.verify_and_delete(
                auth_schemas.VerifyAndDeleteAccountIn(otp="123456"),
                user,
                MagicMock(),
                MagicMock(),
            )

    with (
        patch.object(lh, "_primary_auth_provider", return_value="google"),
        patch.object(lh, "_get_deletion_otp_from_redis", return_value="stored"),
        patch.object(lh._l.security, "verify_password", return_value=True),
        patch.object(lh, "_delete_deletion_otp_from_redis"),
        patch.object(lh, "_execute_account_deletion", return_value={"message": "ok"}),
    ):
        out = lh.verify_and_delete(
            auth_schemas.VerifyAndDeleteAccountIn(otp="123456"),
            user,
            MagicMock(),
            MagicMock(),
        )
    assert out["message"] == "ok"
