"""
Unit tests for storage service.
These tests mock database and file system operations.
"""

import pytest
from unittest.mock import patch, MagicMock
from app.storage import StorageService


@pytest.mark.unit
class TestSanitizeFilename:
    """Test filename sanitization."""

    def test_sanitize_filename_path_traversal(self):
        """Test filename sanitization removes path traversal attempts."""
        # Test path traversal
        dangerous = "../../etc/passwd"
        safe = StorageService.sanitize_filename(dangerous)
        assert "../" not in safe
        assert "/" not in safe
        assert "etc" not in safe

        # Test backslashes
        dangerous2 = "..\\..\\windows\\system32"
        safe2 = StorageService.sanitize_filename(dangerous2)
        assert "\\" not in safe2
        assert ".." not in safe2

    def test_sanitize_filename_dangerous_chars(self):
        """Test filename sanitization removes dangerous characters."""
        # Test dangerous characters
        dangerous = 'file<>:"|?*.pdf'
        safe = StorageService.sanitize_filename(dangerous)
        assert "<" not in safe
        assert ">" not in safe
        assert ":" not in safe
        assert '"' not in safe
        assert "|" not in safe
        assert "?" not in safe
        assert "*" not in safe

        # Test normal filename (should pass through mostly unchanged)
        normal = "test_document.pdf"
        safe_normal = StorageService.sanitize_filename(normal)
        assert "test" in safe_normal.lower()
        assert "pdf" in safe_normal.lower()

    def test_sanitize_filename_long_names(self):
        """Test that long filenames are truncated."""
        # Test long filenames
        long_name = "a" * 300 + ".pdf"
        safe_long = StorageService.sanitize_filename(long_name)
        assert len(safe_long) <= 205  # 200 chars + extension

    def test_sanitize_filename_empty(self):
        """Test that empty filenames get default name."""
        safe = StorageService.sanitize_filename("")
        assert safe == "document"

        safe2 = StorageService.sanitize_filename("   ")
        assert safe2 == "document"

    def test_sanitize_filename_dangerous_words(self):
        """Test that dangerous words are removed."""
        dangerous = "testetcpasswd.pdf"
        safe = StorageService.sanitize_filename(dangerous)
        assert "etc" not in safe.lower()
        assert "passwd" not in safe.lower()

    def test_sanitize_filename_whitespace(self):
        """Test that whitespace is normalized."""
        filename = "test   file  .pdf"
        safe = StorageService.sanitize_filename(filename)
        assert "  " not in safe  # Multiple spaces should be replaced


@pytest.mark.unit
class TestStorageServiceMethods:
    """Test StorageService methods."""

    @patch("app.storage.Path")
    def test_storage_service_init(self, mock_path):
        """Test StorageService initialization."""
        mock_path.mkdir = MagicMock()
        service = StorageService()

        assert service.base_dir is not None
        mock_path.mkdir.assert_called_once()

    def test_generate_file_path_with_user(self):
        """Test file path generation with user_id."""
        service = StorageService()
        path = service.generate_file_path("user123", "test.pdf")

        assert "user123" in str(path)
        assert "test" in str(path).lower()

    def test_generate_file_path_guest(self):
        """Test file path generation for guest users."""
        service = StorageService()
        path = service.generate_file_path(None, "test.pdf")

        assert "guest" in str(path).lower()

    def test_generate_file_path_dangerous_filename(self):
        """Test file path generation with dangerous filename."""
        service = StorageService()
        dangerous_path = service.generate_file_path("user123", "../../etc/passwd")

        assert "../" not in str(dangerous_path)
        assert "/etc" not in str(dangerous_path)
