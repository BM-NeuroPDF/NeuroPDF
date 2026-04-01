"""
Unit tests for security module (password validation, hashing, JWT).
"""

import pytest
from app.core.security import (
    validate_password_strength,
    hash_password,
    verify_password,
    create_jwt,
)


@pytest.mark.unit
class TestPasswordStrength:
    """Test password strength validation."""

    def test_password_too_short(self):
        """Test that password must be at least 8 characters."""
        is_valid, error_msg = validate_password_strength("Short1")
        assert not is_valid
        assert "8 karakter" in error_msg or "8 character" in error_msg.lower()

    def test_password_no_uppercase(self):
        """Test that password must contain uppercase letter."""
        is_valid, error_msg = validate_password_strength("lowercase123")
        assert not is_valid
        assert "büyük harf" in error_msg or "uppercase" in error_msg.lower()

    def test_password_no_lowercase(self):
        """Test that password must contain lowercase letter."""
        is_valid, error_msg = validate_password_strength("UPPERCASE123")
        assert not is_valid
        assert "küçük harf" in error_msg or "lowercase" in error_msg.lower()

    def test_password_no_digit(self):
        """Test that password must contain a digit."""
        is_valid, error_msg = validate_password_strength("NoDigitsHere")
        assert not is_valid
        assert (
            "rakam" in error_msg
            or "digit" in error_msg.lower()
            or "number" in error_msg.lower()
        )

    def test_valid_password(self):
        """Test that valid password passes."""
        is_valid, error_msg = validate_password_strength("ValidPass123")
        assert is_valid
        assert error_msg == ""

    def test_password_with_special_chars(self):
        """Test that password with special characters is valid."""
        is_valid, error_msg = validate_password_strength("ValidPass123!")
        assert is_valid

    def test_password_exactly_8_chars(self):
        """Test that password with exactly 8 characters is valid."""
        is_valid, error_msg = validate_password_strength("Pass1234")
        assert is_valid


@pytest.mark.unit
class TestPasswordHashing:
    """Test password hashing and verification."""

    def test_hash_password(self):
        """Test that password is hashed correctly."""
        password = "TestPassword123"
        hashed = hash_password(password)

        # Bcrypt hashes start with $2b$ or $2a$
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
        # Hash should be different from plain password
        assert hashed != password

    def test_verify_password_correct(self):
        """Test that correct password is verified."""
        password = "TestPassword123"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Test that incorrect password is rejected."""
        password = "TestPassword123"
        wrong_password = "WrongPassword123"
        hashed = hash_password(password)

        assert verify_password(wrong_password, hashed) is False

    def test_hash_password_uniqueness(self):
        """Test that same password produces different hashes (due to salt)."""
        password = "SamePassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        # Hashes should be different due to salt
        assert hash1 != hash2
        # But both should verify correctly
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True

    def test_hash_password_empty(self):
        """Test that empty password can be hashed."""
        hashed = hash_password("")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")


@pytest.mark.unit
class TestJWT:
    """Test JWT token creation and verification."""

    def test_create_jwt(self):
        """Test JWT token creation."""
        user_data = {
            "id": "user123",
            "email": "test@example.com",
            "username": "testuser",
            "eula_accepted": True,
        }
        token = create_jwt(user_data)

        assert isinstance(token, str)
        assert len(token) > 0
        # JWT tokens have 3 parts separated by dots
        assert token.count(".") == 2

    def test_create_jwt_minimal_data(self):
        """Test JWT token creation with minimal data."""
        user_data = {"id": "user123", "email": "test@example.com"}
        token = create_jwt(user_data)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_jwt_contains_required_fields(self):
        """Test that JWT contains required fields."""
        import jwt
        from app.config import settings

        user_data = {
            "id": "user123",
            "email": "test@example.com",
            "username": "testuser",
        }
        token = create_jwt(user_data)

        # Decode token to verify structure
        decoded = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])

        assert "sub" in decoded
        assert decoded["sub"] == "user123"
        assert "email" in decoded
        assert "exp" in decoded  # Expiration should be added automatically
        assert "iat" in decoded  # Issued at should be added automatically
