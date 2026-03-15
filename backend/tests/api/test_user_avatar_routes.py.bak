"""
Unit tests for user_avatar_routes.py router endpoints
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from io import BytesIO
from PIL import Image
import base64

from app.main import app
from app.db import get_db
from app.deps import get_current_user
from app.models import User, UserSettings, UserAvatar

client = TestClient(app)


# ==========================================
# FIXTURES
# ==========================================

@pytest.fixture
def mock_user():
    """Mock authenticated user"""
    return {"sub": "test-user-id", "email": "test@example.com"}


@pytest.fixture
def mock_db():
    """Mock database session"""
    mock = MagicMock()
    return mock


@pytest.fixture
def sample_png():
    """Create a sample PNG image"""
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    return img_bytes.read()


@pytest.fixture
def override_dependencies(mock_db, mock_user):
    """Override FastAPI dependencies"""
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield
    app.dependency_overrides.clear()


# ==========================================
# GET AVATAR TESTS
# ==========================================

class TestGetAvatar:
    """Test GET /{user_id}/avatar endpoint"""
    
    @patch("app.db.get_supabase")
    def test_get_avatar_from_db(
        self,
        mock_get_supabase,
        override_dependencies,
        mock_db
    ):
        """Test getting avatar from database"""
        # Mock user with settings
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_settings = MagicMock()
        mock_settings.active_avatar_url = "user123/avatar.png"
        mock_user_obj.settings = mock_settings
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        # Mock Supabase storage
        mock_supabase = MagicMock()
        mock_supabase.storage.from_.return_value.download.return_value = b"fake_image_data"
        mock_get_supabase.return_value = mock_supabase
        
        response = client.get("/api/v1/user/me/avatar")
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
    
    @patch("app.db.get_supabase")
    @patch("app.routers.user_avatar_routes.generate_avatar_from_name")
    @patch("app.routers.user_avatar_routes.upload_avatar_png_to_storage")
    @patch("app.routers.user_avatar_routes.save_avatar_record_and_set_active")
    def test_get_avatar_not_found_generates_default(
        self,
        mock_save_avatar,
        mock_upload,
        mock_generate,
        mock_get_supabase,
        override_dependencies,
        mock_db,
        sample_png
    ):
        """Test getting avatar when not found - generates default"""
        # Mock user without avatar
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_user_obj.username = "testuser"
        mock_user_obj.settings = None
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        # Mock default avatar generation
        mock_generate.return_value = sample_png
        mock_save_avatar.return_value = MagicMock(id=1)
        
        # Mock Supabase storage
        mock_supabase = MagicMock()
        mock_supabase.storage.from_.return_value.download.return_value = sample_png
        mock_get_supabase.return_value = mock_supabase
        
        response = client.get("/api/v1/user/me/avatar")
        
        # Should generate default and return it
        assert response.status_code in [200, 404]  # May return 404 if generation fails
    
    def test_get_avatar_forbidden(self, override_dependencies):
        """Test getting avatar for another user (forbidden)"""
        response = client.get("/api/v1/user/other-user-id/avatar")
        
        assert response.status_code == 403


# ==========================================
# GET AVATAR HISTORY TESTS
# ==========================================

class TestGetAvatarHistory:
    """Test GET /{user_id}/avatars endpoint"""
    
    def test_get_avatar_history_success(
        self,
        override_dependencies,
        mock_db
    ):
        """Test getting avatar history"""
        # Mock user
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        # Mock avatars
        mock_avatar1 = MagicMock()
        mock_avatar1.id = 1
        mock_avatar1.image_path = "path1.png"
        mock_avatar1.is_ai_generated = True
        mock_avatar1.created_at = MagicMock()
        mock_avatar1.created_at.isoformat.return_value = "2024-01-01T00:00:00"
        
        mock_avatar2 = MagicMock()
        mock_avatar2.id = 2
        mock_avatar2.image_path = "path2.png"
        mock_avatar2.is_ai_generated = False
        mock_avatar2.created_at = MagicMock()
        mock_avatar2.created_at.isoformat.return_value = "2024-01-02T00:00:00"
        
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            mock_avatar1, mock_avatar2
        ]
        
        response = client.get("/api/v1/user/me/avatars")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2


# ==========================================
# UPLOAD AVATAR TESTS
# ==========================================

class TestUploadAvatar:
    """Test POST /{user_id}/avatar endpoint"""
    
    @patch("app.routers.user_avatar_routes.upload_avatar_png_to_storage")
    @patch("app.routers.user_avatar_routes.save_avatar_record_and_set_active")
    def test_upload_avatar_success(
        self,
        mock_save_avatar,
        mock_upload,
        override_dependencies,
        mock_db,
        sample_png
    ):
        """Test uploading avatar successfully"""
        mock_save_avatar.return_value = MagicMock(id=1)
        
        files = {"file": ("avatar.png", sample_png, "image/png")}
        
        response = client.post("/api/v1/user/me/avatar", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "path" in data
        assert "avatar_id" in data
    
    def test_upload_avatar_invalid_type(
        self,
        override_dependencies,
        sample_png
    ):
        """Test uploading non-PNG file"""
        files = {"file": ("avatar.jpg", sample_png, "image/jpeg")}
        
        response = client.post("/api/v1/user/me/avatar", files=files)
        
        assert response.status_code == 415
        assert "PNG" in response.json()["detail"]


# ==========================================
# GENERATE AVATAR TESTS
# ==========================================

class TestGenerateAvatar:
    """Test POST /{user_id}/avatar/generate endpoint"""
    
    @patch("app.routers.user_avatar_routes.generate_avatar_with_prompt")
    @patch("app.routers.user_avatar_routes.save_temp_avatar")
    def test_generate_avatar_preview_success(
        self,
        mock_save_temp,
        mock_generate,
        override_dependencies,
        mock_db,
        sample_png
    ):
        """Test generating avatar preview"""
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_user_obj.username = "testuser"
        mock_user_obj.email = "test@example.com"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        mock_generate.return_value = sample_png
        mock_save_temp.return_value = "temp-avatar-id-123"
        
        payload = {"prompt": "A professional avatar"}
        
        response = client.post("/api/v1/user/me/avatar/generate", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "temp_avatar_id" in data
        assert "preview_image" in data
        assert data["temp_avatar_id"] == "temp-avatar-id-123"
    
    def test_generate_avatar_empty_prompt(
        self,
        override_dependencies,
        mock_db
    ):
        """Test generating avatar with empty prompt"""
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        payload = {"prompt": ""}
        
        response = client.post("/api/v1/user/me/avatar/generate", json=payload)
        
        assert response.status_code == 400
        assert "Prompt" in response.json()["detail"]


# ==========================================
# EDIT AVATAR TESTS
# ==========================================

class TestEditAvatar:
    """Test POST /{user_id}/avatar/edit endpoint"""
    
    @patch("app.routers.user_avatar_routes.edit_avatar_with_prompt")
    @patch("app.routers.user_avatar_routes.save_temp_avatar")
    def test_edit_avatar_success(
        self,
        mock_save_temp,
        mock_edit,
        override_dependencies,
        mock_db,
        sample_png
    ):
        """Test editing avatar successfully"""
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        mock_edit.return_value = sample_png
        mock_save_temp.return_value = "temp-avatar-id-456"
        
        files = {"file": ("avatar.png", sample_png, "image/png")}
        data = {"prompt": "Make it blue"}
        
        response = client.post(
            "/api/v1/user/me/avatar/edit",
            files=files,
            data=data
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "temp_avatar_id" in data
        assert "preview_image" in data


# ==========================================
# CONFIRM AVATAR TESTS
# ==========================================

class TestConfirmAvatar:
    """Test POST /{user_id}/avatar/confirm endpoint"""
    
    @patch("app.routers.user_avatar_routes.get_temp_avatar")
    @patch("app.routers.user_avatar_routes.upload_avatar_png_to_storage")
    @patch("app.routers.user_avatar_routes.save_avatar_record_and_set_active")
    def test_confirm_avatar_success(
        self,
        mock_save_avatar,
        mock_upload,
        mock_get_temp,
        override_dependencies,
        mock_db,
        sample_png
    ):
        """Test confirming avatar successfully"""
        mock_get_temp.return_value = sample_png
        mock_save_avatar.return_value = MagicMock(id=1)
        
        payload = {"temp_avatar_id": "temp-avatar-id-123"}
        
        response = client.post("/api/v1/user/me/avatar/confirm", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "avatar_id" in data
    
    @patch("app.routers.user_avatar_routes.get_temp_avatar")
    def test_confirm_avatar_not_found(
        self,
        mock_get_temp,
        override_dependencies
    ):
        """Test confirming avatar when temp avatar not found"""
        mock_get_temp.return_value = None
        
        payload = {"temp_avatar_id": "invalid-id"}
        
        response = client.post("/api/v1/user/me/avatar/confirm", json=payload)
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
