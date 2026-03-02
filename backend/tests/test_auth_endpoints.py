import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_supabase
from app.services import auth_service

client = TestClient(app)

# Helper function to mock Supabase client
def mock_supabase_client():
    mock_client = MagicMock()
    return mock_client

@pytest.fixture
def override_get_supabase():
    mock_client = mock_supabase_client()
    app.dependency_overrides[get_supabase] = lambda: mock_client
    yield mock_client
    app.dependency_overrides.clear()

class TestAuthEndpoints:
    
    @patch("app.routers.auth.security.verify_password")
    @patch("app.routers.auth.security.create_jwt")
    def test_login_success_bcrypt(self, mock_create_jwt, mock_verify_password, override_get_supabase):
        # Mocking auth record finding
        mock_auth_record = {
            "id": 1,
            "user_id": "123",
            "provider": "local",
            "provider_key": "test@example.com",
            "password_hash": "$2b$12$somehashedpassword"
        }
        
        # Select on user_auth
        mock_auth_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_execute.return_value.data = [mock_auth_record]
        
        # Select on users
        mock_user = {"id": "123", "username": "testuser"}
        mock_user_execute = override_get_supabase.table().select().eq().execute
        mock_user_execute.return_value.data = [mock_user]
        
        # Select on user_settings
        mock_settings = {"eula_accepted": True}
        mock_settings_execute = override_get_supabase.table().select().eq().execute
        mock_settings_execute.return_value.data = [mock_settings]
        
        # Mocking password verification and JWT creation
        mock_verify_password.return_value = True
        mock_create_jwt.return_value = "fake_jwt_token"
        
        response = client.post(
            "/auth/login",
            json={"email": "test@example.com", "password": "correct_password"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "fake_jwt_token"
        assert data["user_id"] == "123"
        assert data["email"] == "test@example.com"
        
    def test_login_invalid_credentials_user_not_found(self, override_get_supabase):
        # Return empty list from user_auth table to simulate not found
        mock_auth_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_execute.return_value.data = []
        
        response = client.post(
            "/auth/login",
            json={"email": "notfound@example.com", "password": "any_password"}
        )
        
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"
        
    @patch("app.routers.auth.security.verify_password")
    def test_login_invalid_credentials_wrong_password(self, mock_verify_password, override_get_supabase):
        mock_auth_record = {
            "id": 1,
            "user_id": "123",
            "provider": "local",
            "provider_key": "test@example.com",
            "password_hash": "$2b$12$somehashedpassword"
        }
        mock_auth_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_execute.return_value.data = [mock_auth_record]
        
        # Password verify returns False
        mock_verify_password.return_value = False
        
        response = client.post(
            "/auth/login",
            json={"email": "test@example.com", "password": "wrong_password"}
        )
        
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    @patch("app.services.auth_service.verify_google_token")
    @patch("app.routers.auth.security.create_jwt")
    @patch("app.services.auth_service.create_user_avatar")
    def test_google_login_new_user(self, mock_create_avatar, mock_create_jwt, mock_verify_google, override_get_supabase):
        # Mock Google token verification
        mock_verify_google.return_value = {
            "sub": "google123",
            "email": "google@example.com",
            "name": "Google User"
        }
        
        # 1. user_auth select returns empty
        mock_auth_select_execute = override_get_supabase.table().select().eq().eq().execute
        mock_auth_select_execute.return_value.data = []
        
        # 2. insert returns new user ID
        new_user = {"id": "new-uuid", "username": "Google User"}
        mock_user_insert_execute = override_get_supabase.table().insert().execute
        mock_user_insert_execute.return_value.data = [new_user]
        
        mock_create_jwt.return_value = "google_jwt_token"
        
        response = client.post(
            "/auth/google",
            json={"id_token": "valid_google_id_token"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "google_jwt_token"
        # We don't strictly assert the exact UUID since it's generated dynamically
        assert "user_id" in data
        assert data["email"] == "google@example.com"

    @patch("app.services.auth_service.verify_google_token")
    @patch("app.routers.auth.security.create_jwt")
    def test_google_login_existing_user(self, mock_create_jwt, mock_verify_google, override_get_supabase):
        # Mock Google token verification
        mock_verify_google.return_value = {
            "sub": "google123",
            "email": "existing@example.com",
            "name": "Existing User"
        }
        
        # 1. user_auth select returns user_id
        mock_auth_select = override_get_supabase.table().select().eq().eq().execute
        mock_auth_select.return_value.data = [{"user_id": "existing-uuid"}]
        
        # 2. users select returns user
        mock_user_select = override_get_supabase.table().select().eq().execute
        mock_user_select.return_value.data = [{"id": "existing-uuid", "username": "Existing User"}]
        
        # 3. user_settings select returns settings
        mock_settings_select = override_get_supabase.table().select().eq().execute
        mock_settings_select.return_value.data = [{"eula_accepted": True}]

        mock_create_jwt.return_value = "existing_jwt_token"
        
        response = client.post(
            "/auth/google",
            json={"id_token": "valid_google_id_token"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "existing_jwt_token"
        assert data["user_id"] == "existing-uuid"
