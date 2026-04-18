import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_supabase, get_db
from app.deps import get_current_user

client = TestClient(app)


def mock_supabase_client():
    mock_client = MagicMock()
    return mock_client


@pytest.fixture
def override_get_supabase():
    """Supabase + DB: get_db() gerçek engine olmadan 503 verir; tüm auth API testlerinde mock'lanır."""
    mock_client = mock_supabase_client()
    mock_session = MagicMock()

    def _db():
        yield mock_session

    app.dependency_overrides[get_supabase] = lambda: mock_client
    app.dependency_overrides[get_db] = _db
    yield mock_client
    app.dependency_overrides.clear()


@pytest.mark.usefixtures("override_get_supabase")
class TestAuthEndpoints:
    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit", return_value=True)
    @patch("app.routers.auth.security.verify_password")
    @patch("app.routers.auth.security.generate_six_digit_otp", return_value="111111")
    @patch("app.routers.auth.security.hash_password", return_value="hashed_otp")
    @patch(
        "app.routers.auth.security.create_2fa_pending_token", return_value="temp_jwt"
    )
    @patch("app.routers.auth.set_redis_otp", new_callable=AsyncMock)
    @patch("app.routers.auth.send_login_otp_email")
    def test_login_success_requires_2fa(
        self,
        mock_send_email,
        mock_set_redis_otp,
        mock_temp_token,
        mock_hash_pw,
        mock_gen_otp,
        mock_verify_password,
        override_get_supabase,
    ):
        mock_auth_record = {
            "id": 1,
            "user_id": "123",
            "provider": "local",
            "provider_key": "test@example.com",
            "password_hash": "$2b$12$somehashedpassword",
        }

        mock_auth_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_execute.return_value.data = [mock_auth_record]

        mock_verify_password.return_value = True

        response = client.post(
            "/auth/login",
            json={"email": "test@example.com", "password": "correct_password"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "requires_2fa"
        assert data["temp_token"] == "temp_jwt"
        mock_set_redis_otp.assert_awaited_once()
        mock_send_email.assert_called_once()

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit")
    def test_login_invalid_credentials_user_not_found(
        self, mock_rate_limit, override_get_supabase
    ):
        mock_rate_limit.return_value = True

        mock_auth_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_execute.return_value.data = []

        response = client.post(
            "/auth/login",
            json={"email": "notfound@example.com", "password": "any_password"},
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit")
    @patch("app.routers.auth.security.verify_password")
    def test_login_invalid_credentials_wrong_password(
        self, mock_verify_password, mock_rate_limit, override_get_supabase
    ):
        mock_rate_limit.return_value = True

        mock_auth_record = {
            "id": 1,
            "user_id": "123",
            "provider": "local",
            "provider_key": "test@example.com",
            "password_hash": "$2b$12$somehashedpassword",
        }
        mock_auth_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_execute.return_value.data = [mock_auth_record]

        mock_verify_password.return_value = False

        response = client.post(
            "/auth/login",
            json={"email": "test@example.com", "password": "wrong_password"},
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    def test_login_step2_runtime_error_returns_503_with_detail(self):
        from app.db import get_db, get_supabase

        mock_session = MagicMock()
        mock_session.execute.return_value.mappings.return_value.first.return_value = {
            "id": 1,
            "user_id": "user-uuid-1",
            "password_hash": "$2b$12$somehashedpassword",
        }

        def _db():
            yield mock_session

        with (
            patch("app.routers.auth.settings.USE_SUPABASE", False),
            patch("app.routers.auth.check_rate_limit", return_value=True),
            patch("app.routers.auth.security.verify_password", return_value=True),
            patch(
                "app.routers.auth.set_redis_otp",
                new_callable=AsyncMock,
            ) as set_redis_mock,
        ):
            set_redis_mock.side_effect = RuntimeError(
                "simulated supabase or jwt failure"
            )
            app.dependency_overrides[get_supabase] = lambda: mock_supabase_client()
            app.dependency_overrides[get_db] = _db
            try:
                response = client.post(
                    "/auth/login",
                    json={"email": "test@example.com", "password": "any_password"},
                )
                assert response.status_code == 503
                body = response.json()
                assert "detail" in body
                d = body["detail"].lower()
                assert "could not be completed" in d
            finally:
                app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit", return_value=True)
    @patch("app.routers.auth.is_2fa_verify_locked", return_value=False)
    @patch("app.routers.auth.user_repo.mark_email_as_verified", new_callable=AsyncMock)
    @patch("app.routers.auth.delete_redis_otp", new_callable=AsyncMock)
    @patch("app.routers.auth.get_redis_otp", new_callable=AsyncMock)
    @patch("app.routers.auth.security.create_jwt", return_value="access_jwt")
    @patch("app.routers.auth.security.decode_2fa_pending_token")
    @patch("app.routers.auth.clear_2fa_verify_failures")
    def test_verify_2fa_success(
        self,
        mock_clear_fails,
        mock_decode,
        mock_create_jwt,
        mock_get_redis_otp,
        mock_delete_redis_otp,
        mock_mark_email_verified,
        mock_locked,
        override_get_supabase,
    ):
        from app.core import security

        mock_decode.return_value = {
            "sub": "123",
            "email": "test@example.com",
        }
        code = "888888"
        mock_get_redis_otp.return_value = security.hash_password(code)

        class _UserRes:
            data = [{"id": "123", "username": "u", "created_at": None}]

        class _SettingsRes:
            data = [{"eula_accepted": True}]

        mock_user_table = MagicMock()
        mock_user_select = MagicMock()
        mock_user_eq = MagicMock()
        mock_user_eq.execute = MagicMock(return_value=_UserRes())
        mock_user_select.eq.return_value = mock_user_eq
        mock_user_table.select.return_value = mock_user_select

        mock_settings_table = MagicMock()
        mock_settings_select = MagicMock()
        mock_settings_eq = MagicMock()
        mock_settings_eq.execute = MagicMock(return_value=_SettingsRes())
        mock_settings_select.eq.return_value = mock_settings_eq
        mock_settings_table.select.return_value = mock_settings_select

        def table_side_effect(table_name):
            if table_name == "users":
                return mock_user_table
            if table_name == "user_settings":
                return mock_settings_table
            return MagicMock()

        override_get_supabase.table.side_effect = table_side_effect

        response = client.post(
            "/auth/verify-2fa",
            json={"temp_token": "dummy", "otp_code": code},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "access_jwt"
        assert data["user_id"] == "123"
        mock_delete_redis_otp.assert_awaited_once_with("123")
        mock_mark_email_verified.assert_awaited_once()
        assert mock_mark_email_verified.await_args.args[0] == "123"
        assert mock_mark_email_verified.await_args.kwargs["db"] is None
        assert mock_mark_email_verified.await_args.kwargs["supabase"] is not None
        mock_clear_fails.assert_called_once()

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit", return_value=True)
    @patch("app.routers.auth.is_2fa_verify_locked", return_value=True)
    def test_verify_2fa_locked(self, mock_locked, override_get_supabase):
        response = client.post(
            "/auth/verify-2fa",
            json={"temp_token": "x", "otp_code": "123456"},
        )
        assert response.status_code == 429

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.routers.auth.check_rate_limit", return_value=True)
    @patch("app.routers.auth.is_2fa_verify_locked", return_value=False)
    @patch("app.routers.auth.record_2fa_verify_failure")
    @patch("app.routers.auth.security.decode_2fa_pending_token", side_effect=ValueError)
    def test_verify_2fa_invalid_token(
        self, mock_decode, mock_record_fail, mock_locked, override_get_supabase
    ):
        response = client.post(
            "/auth/verify-2fa",
            json={"temp_token": "bad", "otp_code": "123456"},
        )
        assert response.status_code == 401
        mock_record_fail.assert_called()

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.services.auth_service.verify_google_token")
    @patch("app.routers.auth.security.create_jwt")
    @patch("app.services.auth_service.create_user_avatar")
    def test_google_login_new_user(
        self,
        mock_create_avatar,
        mock_create_jwt,
        mock_verify_google,
        override_get_supabase,
    ):
        mock_verify_google.return_value = {
            "sub": "google123",
            "email": "google@example.com",
            "name": "Google User",
        }

        mock_auth_select_execute = (
            override_get_supabase.table().select().eq().eq().execute
        )
        mock_auth_select_execute.return_value.data = []

        new_user = {"id": "new-uuid", "username": "Google User"}
        mock_user_insert_execute = override_get_supabase.table().insert().execute
        mock_user_insert_execute.return_value.data = [new_user]

        mock_create_jwt.return_value = "google_jwt_token"

        response = client.post(
            "/auth/google", json={"id_token": "valid_google_id_token"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "google_jwt_token"
        assert "user_id" in data
        assert data["email"] == "google@example.com"

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    @patch("app.services.auth_service.verify_google_token")
    @patch("app.routers.auth.security.create_jwt")
    def test_google_login_existing_user(
        self, mock_create_jwt, mock_verify_google, override_get_supabase
    ):
        mock_verify_google.return_value = {
            "sub": "google123",
            "email": "existing@example.com",
            "name": "Existing User",
        }

        mock_supabase = override_get_supabase

        mock_auth_table = MagicMock()
        mock_auth_select = MagicMock()
        mock_auth_eq1 = MagicMock()
        mock_auth_eq2 = MagicMock()
        mock_auth_execute = MagicMock()
        mock_auth_execute.return_value.data = [{"user_id": "existing-uuid"}]
        mock_auth_eq2.execute = mock_auth_execute
        mock_auth_eq1.eq.return_value = mock_auth_eq2
        mock_auth_select.eq.return_value = mock_auth_eq1
        mock_auth_table.select.return_value = mock_auth_select

        mock_user_table = MagicMock()
        mock_user_select = MagicMock()
        mock_user_eq = MagicMock()
        mock_user_execute = MagicMock()
        mock_user_execute.return_value.data = [
            {"id": "existing-uuid", "username": "Existing User", "created_at": None}
        ]
        mock_user_eq.execute = mock_user_execute
        mock_user_select.eq.return_value = mock_user_eq
        mock_user_table.select.return_value = mock_user_select

        mock_settings_table = MagicMock()
        mock_settings_select = MagicMock()
        mock_settings_eq = MagicMock()
        mock_settings_execute = MagicMock()
        mock_settings_execute.return_value.data = [{"eula_accepted": True}]
        mock_settings_eq.execute = mock_settings_execute
        mock_settings_select.eq.return_value = mock_settings_eq
        mock_settings_table.select.return_value = mock_settings_select

        def table_side_effect(table_name):
            if table_name == "user_auth":
                return mock_auth_table
            if table_name == "users":
                return mock_user_table
            if table_name == "user_settings":
                return mock_settings_table
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        mock_create_jwt.return_value = "existing_jwt_token"

        response = client.post(
            "/auth/google", json={"id_token": "valid_google_id_token"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "existing_jwt_token"
        assert data["user_id"] == "existing-uuid"

    @patch("app.routers.auth.check_rate_limit", return_value=True)
    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    @patch("app.services.auth_service.verify_google_token")
    @patch("app.routers.auth.security.create_jwt")
    @patch("app.services.auth_service.create_user_avatar")
    def test_google_login_local_new_user(
        self, mock_avatar, mock_create_jwt, mock_verify_google, _rl
    ):
        mock_verify_google.return_value = {
            "sub": "google-sub-local",
            "email": "local-google@example.com",
            "name": "Local Google",
        }
        mock_create_jwt.return_value = "local_google_jwt"

        mock_session = MagicMock()

        def execute_side_effect(stmt, _params=None):
            s = str(stmt)
            m = MagicMock()
            if "SELECT user_id FROM user_auth" in s:
                m.mappings.return_value.first.return_value = None
            return m

        mock_session.execute.side_effect = execute_side_effect

        def _db():
            yield mock_session

        app.dependency_overrides[get_supabase] = lambda: MagicMock()
        app.dependency_overrides[get_db] = _db
        try:
            response = client.post(
                "/auth/google", json={"id_token": "valid_google_id_token"}
            )
            assert response.status_code == 200
            assert response.json()["access_token"] == "local_google_jwt"
            mock_session.commit.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.check_rate_limit", return_value=True)
    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    @patch("app.services.auth_service.verify_google_token")
    @patch("app.routers.auth.security.create_jwt")
    def test_google_login_local_existing_user(
        self, mock_create_jwt, mock_verify_google, _rl
    ):
        mock_verify_google.return_value = {
            "sub": "google-sub-existing",
            "email": "existing-local@example.com",
            "name": "Ex",
        }
        mock_create_jwt.return_value = "jwt_existing_local"

        mock_session = MagicMock()

        def execute_side_effect(stmt, _params=None):
            s = str(stmt)
            m = MagicMock()
            if "SELECT user_id FROM user_auth" in s:
                m.mappings.return_value.first.return_value = {"user_id": "uid-loc-1"}
            elif "SELECT id, username FROM users" in s:
                m.mappings.return_value.first.return_value = {
                    "id": "uid-loc-1",
                    "username": "Ex",
                }
            elif "eula_accepted" in s:
                m.mappings.return_value.first.return_value = {"eula_accepted": True}
            return m

        mock_session.execute.side_effect = execute_side_effect

        def _db():
            yield mock_session

        app.dependency_overrides[get_supabase] = lambda: MagicMock()
        app.dependency_overrides[get_db] = _db
        try:
            response = client.post(
                "/auth/google", json={"id_token": "valid_google_id_token"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["user_id"] == "uid-loc-1"
            assert data["email"] == "existing-local@example.com"
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", True)
    def test_accept_eula_supabase(self, override_get_supabase):
        app.dependency_overrides[get_current_user] = lambda: {"sub": "u-supabase"}
        try:
            response = client.post("/auth/accept-eula", json={"accepted": True})
            assert response.status_code == 200
            assert response.json()["message"] == "Success"
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    def test_accept_eula_local(self):
        mock_session = MagicMock()
        app.dependency_overrides[get_current_user] = lambda: {"sub": "u-local"}
        app.dependency_overrides[get_supabase] = lambda: MagicMock()

        def _db():
            yield mock_session

        app.dependency_overrides[get_db] = _db
        try:
            response = client.post("/auth/accept-eula", json={"accepted": True})
            assert response.status_code == 200
            mock_session.execute.assert_called()
            mock_session.commit.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    def test_get_me_local(self):
        mock_session = MagicMock()

        def execute_side_effect(stmt, _params=None):
            s = str(stmt)
            m = MagicMock()
            if "SELECT id, username FROM users" in s:
                m.mappings.return_value.first.return_value = {
                    "id": "u-me",
                    "username": "MeUser",
                }
            elif "user_settings" in s:
                m.mappings.return_value.first.return_value = {"eula_accepted": True}
            elif "user_auth" in s:
                m.mappings.return_value.first.return_value = {
                    "provider": "google",
                    "provider_key": "me@example.com",
                }
            return m

        mock_session.execute.side_effect = execute_side_effect
        app.dependency_overrides[get_current_user] = lambda: {"sub": "u-me"}
        app.dependency_overrides[get_supabase] = lambda: MagicMock()

        def _db():
            yield mock_session

        app.dependency_overrides[get_db] = _db
        try:
            response = client.get("/auth/me")
            assert response.status_code == 200
            data = response.json()
            assert data["user_id"] == "u-me"
            assert data["email"] == "me@example.com"
            assert data["eula_accepted"] is True
            assert data["created_at"] is None
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    def test_get_me_local_user_not_found(self):
        mock_session = MagicMock()
        m = MagicMock()
        m.mappings.return_value.first.return_value = None
        mock_session.execute.return_value = m
        app.dependency_overrides[get_current_user] = lambda: {"sub": "missing"}
        app.dependency_overrides[get_supabase] = lambda: MagicMock()

        def _db():
            yield mock_session

        app.dependency_overrides[get_db] = _db
        try:
            response = client.get("/auth/me")
            assert response.status_code == 404
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    def test_delete_account_local(self):
        mock_user = MagicMock()
        mock_session = MagicMock()
        mock_session.get.return_value = mock_user
        app.dependency_overrides[get_current_user] = lambda: {"sub": "u-del"}
        app.dependency_overrides[get_supabase] = lambda: MagicMock()

        def _db():
            yield mock_session

        app.dependency_overrides[get_db] = _db
        try:
            response = client.delete("/auth/delete-account")
            assert response.status_code == 200
            mock_session.delete.assert_called_once_with(mock_user)
            mock_session.commit.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    @patch("app.routers.auth.settings.USE_SUPABASE", False)
    def test_delete_account_local_no_user(self):
        mock_session = MagicMock()
        mock_session.get.return_value = None
        app.dependency_overrides[get_current_user] = lambda: {"sub": "gone"}
        app.dependency_overrides[get_supabase] = lambda: MagicMock()

        def _db():
            yield mock_session

        app.dependency_overrides[get_db] = _db
        try:
            response = client.delete("/auth/delete-account")
            assert response.status_code == 200
            mock_session.delete.assert_not_called()
            mock_session.commit.assert_not_called()
        finally:
            app.dependency_overrides.clear()
