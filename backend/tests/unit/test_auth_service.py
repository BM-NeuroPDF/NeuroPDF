"""
Unit tests for auth_service module.
These tests mock external dependencies (Google OAuth, database).
"""

import pytest
from unittest.mock import patch, MagicMock
from app.services import auth_service


@pytest.mark.unit
class TestVerifyGoogleToken:
    """Test Google token verification."""

    @patch("app.services.auth_service.id_token.verify_oauth2_token")
    def test_verify_google_token_success(self, mock_verify):
        """Test successful Google token verification."""
        mock_verify.return_value = {
            "sub": "google123",
            "email": "test@example.com",
            "name": "Test User",
        }

        result = auth_service.verify_google_token("valid_token")

        assert result["sub"] == "google123"
        assert result["email"] == "test@example.com"
        assert result["name"] == "Test User"
        mock_verify.assert_called_once()

    @patch("app.services.auth_service.id_token.verify_oauth2_token")
    def test_verify_google_token_invalid(self, mock_verify):
        """Test invalid Google token raises exception."""
        from google.auth.exceptions import GoogleAuthError

        mock_verify.side_effect = GoogleAuthError("Invalid token")

        with pytest.raises(GoogleAuthError):
            auth_service.verify_google_token("invalid_token")


@pytest.mark.unit
class TestCreateUserAvatar:
    """Test user avatar creation."""

    @patch("app.services.auth_service.SessionLocal")
    @patch("app.services.auth_service.create_initial_avatar_for_user")
    def test_create_user_avatar_success(self, mock_create_avatar, mock_session_local):
        """Test successful avatar creation."""
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        auth_service.create_user_avatar("user123", "testuser")

        mock_create_avatar.assert_called_once_with(mock_db, "user123", "testuser")
        mock_db.close.assert_called_once()

    @patch("app.services.auth_service.SessionLocal")
    @patch("app.services.auth_service.create_initial_avatar_for_user")
    def test_create_user_avatar_db_error(self, mock_create_avatar, mock_session_local):
        """Test avatar creation handles database errors gracefully."""
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_create_avatar.side_effect = Exception("DB error")

        # Should not raise exception, just fail silently
        try:
            auth_service.create_user_avatar("user123", "testuser")
        except Exception:
            pytest.fail("create_user_avatar should handle errors gracefully")

        mock_db.close.assert_called_once()
