"""
Unit tests for security module (password validation, hashing, JWT).
"""

import pytest
from app.core.security import (
    validate_password_strength,
    hash_password,
    verify_password,
    create_jwt,
    generate_six_digit_otp,
    create_2fa_pending_token,
    decode_2fa_pending_token,
    TWO_FA_PENDING_TYP,
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

    def test_create_jwt_accepts_sub_when_id_missing(self):
        """conftest / helpers may pass sub instead of id (must not become string 'None')."""
        import jwt
        from app.config import settings

        token = create_jwt({"sub": "uuid-abc", "email": "x@y.com"})
        decoded = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        assert decoded["sub"] == "uuid-abc"

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


@pytest.mark.unit
class TestEmailLoginOtpHelpers:
    def test_generate_six_digit_otp_format(self):
        code = generate_six_digit_otp("anyone@example.com")
        assert len(code) == 6
        assert code.isdigit()

    def test_generate_six_digit_otp_magic_email(self):
        from unittest.mock import patch

        with patch("app.core.security.settings") as s:
            s.E2E_MAGIC_OTP_ENABLED = True
            s.E2E_MAGIC_OTP_ALL_USERS = False
            s.E2E_MAGIC_OTP_EMAIL = "magic@test.com"
            assert generate_six_digit_otp("magic@test.com") == "123456"

    def test_generate_six_digit_otp_magic_all_users(self):
        from unittest.mock import patch

        with patch("app.core.security.settings") as s:
            s.E2E_MAGIC_OTP_ENABLED = True
            s.E2E_MAGIC_OTP_ALL_USERS = True
            s.E2E_MAGIC_OTP_EMAIL = None
            assert generate_six_digit_otp("anyone@example.com") == "123456"

    def test_create_and_decode_2fa_pending_token(self):
        tok = create_2fa_pending_token("uid-1", "u@example.com")
        payload = decode_2fa_pending_token(tok)
        assert payload["sub"] == "uid-1"
        assert payload["email"] == "u@example.com"
        assert payload["typ"] == TWO_FA_PENDING_TYP

    def test_decode_2fa_pending_token_invalid(self):
        with pytest.raises(ValueError):
            decode_2fa_pending_token("not-a-jwt")

    def test_decode_2fa_pending_token_wrong_typ(self):
        import jwt
        from datetime import datetime, timedelta, timezone
        from app.config import settings

        now = datetime.now(timezone.utc)
        bad = jwt.encode(
            {
                "sub": "x",
                "email": "a@b.com",
                "typ": "other",
                "exp": now + timedelta(minutes=5),
                "iat": now,
            },
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        with pytest.raises(ValueError):
            decode_2fa_pending_token(bad)
