"""
Unit tests for avatar_service module.
These tests mock external dependencies (Supabase, Redis, HTTP requests).
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from app.services import avatar_service


@pytest.mark.unit
class TestCreateStoragePath:
    """Test storage path creation."""
    
    def test_create_storage_path(self):
        """Test that storage path is created correctly."""
        user_id = "user123"
        path = avatar_service.create_storage_path(user_id)
        
        assert user_id in path
        assert path.endswith(".png")
        assert "/" in path
    
    def test_create_storage_path_unique(self):
        """Test that storage paths are unique."""
        user_id = "user123"
        path1 = avatar_service.create_storage_path(user_id)
        path2 = avatar_service.create_storage_path(user_id)
        
        assert path1 != path2


@pytest.mark.unit
class TestValidateImageResponse:
    """Test image response validation."""
    
    def test_validate_png_image(self):
        """Test PNG image validation."""
        # Valid PNG magic bytes
        png_content = b'\x89PNG\r\n\x1a\n' + b'x' * 100
        
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_open.return_value = mock_img
            
            is_valid, error = avatar_service.validate_image_response(png_content)
            
            assert is_valid is True
            assert error is None
    
    def test_validate_jpeg_image(self):
        """Test JPEG image validation."""
        # Valid JPEG magic bytes
        jpeg_content = b'\xff\xd8\xff' + b'x' * 100
        
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_open.return_value = mock_img
            
            is_valid, error = avatar_service.validate_image_response(jpeg_content)
            
            assert is_valid is True
            assert error is None
    
    def test_validate_invalid_image(self):
        """Test invalid image validation."""
        invalid_content = b'not an image'
        
        is_valid, error = avatar_service.validate_image_response(invalid_content)
        
        assert is_valid is False
        assert error is not None
    
    def test_validate_too_small_content(self):
        """Test that too small content is rejected."""
        small_content = b'x' * 50
        
        is_valid, error = avatar_service.validate_image_response(small_content)
        
        assert is_valid is False
        assert "too small" in error.lower()
    
    def test_validate_empty_content(self):
        """Test that empty content is rejected."""
        is_valid, error = avatar_service.validate_image_response(b'')
        
        assert is_valid is False
        assert error is not None


@pytest.mark.unit
class TestGenerateAvatarFromName:
    """Test avatar generation from name."""
    
    def test_generate_avatar_from_name(self):
        """Test avatar generation from name."""
        name = "Test User"
        avatar_bytes = avatar_service.generate_avatar_from_name(name)
        
        assert isinstance(avatar_bytes, bytes)
        assert len(avatar_bytes) > 0
        # Should be PNG format
        assert avatar_bytes.startswith(b'\x89PNG')
    
    def test_generate_avatar_from_name_empty(self):
        """Test avatar generation with empty name."""
        avatar_bytes = avatar_service.generate_avatar_from_name("")
        
        assert isinstance(avatar_bytes, bytes)
        assert len(avatar_bytes) > 0
    
    def test_generate_avatar_from_name_single_char(self):
        """Test avatar generation with single character."""
        avatar_bytes = avatar_service.generate_avatar_from_name("T")
        
        assert isinstance(avatar_bytes, bytes)
        assert len(avatar_bytes) > 0
    
    def test_generate_avatar_custom_size(self):
        """Test avatar generation with custom size."""
        avatar_bytes = avatar_service.generate_avatar_from_name("Test", size=256)
        
        assert isinstance(avatar_bytes, bytes)
        assert len(avatar_bytes) > 0


@pytest.mark.unit
class TestSaveTempAvatar:
    """Test temporary avatar storage."""
    
    @patch('app.services.avatar_service.redis_client')
    def test_save_temp_avatar_success(self, mock_redis):
        """Test successful temp avatar save."""
        mock_redis.setex = MagicMock()
        
        avatar_bytes = b'fake_image_data'
        prompt = "test prompt"
        temp_id = avatar_service.save_temp_avatar("user123", avatar_bytes, prompt)
        
        assert temp_id is not None
        assert len(temp_id) > 0
        mock_redis.setex.assert_called_once()
    
    @patch('app.services.avatar_service.redis_client', None)
    def test_save_temp_avatar_no_redis(self):
        """Test temp avatar save when Redis is unavailable."""
        avatar_bytes = b'fake_image_data'
        prompt = "test prompt"
        temp_id = avatar_service.save_temp_avatar("user123", avatar_bytes, prompt)
        
        # Should still return an ID even without Redis
        assert temp_id is not None


@pytest.mark.unit
class TestGetTempAvatar:
    """Test temporary avatar retrieval."""
    
    @patch('app.services.avatar_service.redis_client')
    def test_get_temp_avatar_success(self, mock_redis):
        """Test successful temp avatar retrieval."""
        import json
        import base64
        from datetime import datetime
        
        avatar_bytes = b'fake_image_data'
        data = {
            "avatar_bytes_base64": base64.b64encode(avatar_bytes).decode('utf-8'),
            "prompt": "test prompt",
            "created_at": datetime.utcnow().isoformat()
        }
        mock_redis.get.return_value = json.dumps(data)
        
        result = avatar_service.get_temp_avatar("user123", "temp_id")
        
        assert result == avatar_bytes
    
    @patch('app.services.avatar_service.redis_client')
    def test_get_temp_avatar_not_found(self, mock_redis):
        """Test temp avatar retrieval when not found."""
        mock_redis.get.return_value = None
        
        result = avatar_service.get_temp_avatar("user123", "temp_id")
        
        assert result is None
    
    @patch('app.services.avatar_service.redis_client', None)
    def test_get_temp_avatar_no_redis(self):
        """Test temp avatar retrieval when Redis is unavailable."""
        result = avatar_service.get_temp_avatar("user123", "temp_id")
        
        assert result is None
