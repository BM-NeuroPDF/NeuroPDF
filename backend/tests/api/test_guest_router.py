"""
Unit tests for guest.py router endpoints
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.redis_client import redis_client

client = TestClient(app)


# ==========================================
# FIXTURES
# ==========================================

@pytest.fixture
def mock_redis():
    """Mock Redis client"""
    mock = MagicMock()
    return mock


# ==========================================
# GUEST SESSION TESTS
# ==========================================

class TestGuestSession:
    """Test guest session endpoints"""
    
    @patch("app.routers.guest.redis_client")
    def test_create_guest_session_success(self, mock_redis_client):
        """Test creating a new guest session"""
        mock_redis_client.set.return_value = True
        
        response = client.post("/guest/session")
        
        assert response.status_code == 201
        data = response.json()
        assert "guest_id" in data
        assert "usage_count" in data
        assert "remaining_usage" in data
        assert "max_usage" in data
        assert data["usage_count"] == 0
    
    @patch("app.routers.guest.redis_client", None)
    def test_create_guest_session_no_redis(self):
        """Test creating guest session when Redis is unavailable"""
        response = client.post("/guest/session")
        
        assert response.status_code == 503
        assert "Redis" in response.json()["detail"]


# ==========================================
# GUEST USAGE TESTS
# ==========================================

class TestGuestUsage:
    """Test guest usage endpoints"""
    
    @patch("app.routers.guest.get_guest_usage_count")
    @patch("app.routers.guest.settings")
    def test_check_guest_usage_success(
        self,
        mock_settings,
        mock_get_usage
    ):
        """Test checking guest usage"""
        mock_settings.MAX_GUEST_USAGE = 5
        mock_get_usage.return_value = 2
        
        headers = {"X-Guest-ID": "test-guest-id"}
        response = client.get("/guest/check-usage", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["can_use"] is True
        assert data["usage_count"] == 2
        assert data["remaining_usage"] == 3
    
    @patch("app.routers.guest.get_guest_usage_count")
    @patch("app.routers.guest.settings")
    def test_check_guest_usage_limit_reached(
        self,
        mock_settings,
        mock_get_usage
    ):
        """Test checking guest usage when limit is reached"""
        mock_settings.MAX_GUEST_USAGE = 5
        mock_get_usage.return_value = 5
        
        headers = {"X-Guest-ID": "test-guest-id"}
        response = client.get("/guest/check-usage", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["can_use"] is False
        assert data["usage_count"] == 5
        assert data["remaining_usage"] == 0
    
    def test_check_guest_usage_no_guest_id(self):
        """Test checking usage without guest ID"""
        response = client.get("/guest/check-usage")
        
        assert response.status_code == 400
        assert "Guest ID" in response.json()["detail"]
    
    @patch("app.routers.guest.get_guest_usage_count")
    @patch("app.routers.guest.increment_guest_usage")
    @patch("app.routers.guest.settings")
    def test_use_guest_service_success(
        self,
        mock_settings,
        mock_increment,
        mock_get_usage
    ):
        """Test using guest service successfully"""
        mock_settings.MAX_GUEST_USAGE = 5
        mock_get_usage.return_value = 2
        mock_increment.return_value = 3
        
        headers = {"X-Guest-ID": "test-guest-id"}
        response = client.post("/guest/use", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["can_use"] is True
        assert data["usage_count"] == 3
        assert data["remaining_usage"] == 2
    
    @patch("app.routers.guest.get_guest_usage_count")
    @patch("app.routers.guest.settings")
    def test_use_guest_service_limit_reached(
        self,
        mock_settings,
        mock_get_usage
    ):
        """Test using guest service when limit is reached"""
        mock_settings.MAX_GUEST_USAGE = 5
        mock_get_usage.return_value = 5
        
        headers = {"X-Guest-ID": "test-guest-id"}
        response = client.post("/guest/use", headers=headers)
        
        assert response.status_code == 403
        assert "limit" in response.json()["detail"].lower()
    
    def test_use_guest_service_no_guest_id(self):
        """Test using guest service without guest ID"""
        response = client.post("/guest/use")
        
        assert response.status_code == 400
        assert "Guest ID" in response.json()["detail"]
    
    @patch("app.routers.guest.redis_client")
    def test_delete_guest_session_success(self, mock_redis_client):
        """Test deleting guest session"""
        mock_redis_client.delete.return_value = 1
        
        headers = {"X-Guest-ID": "test-guest-id"}
        response = client.delete("/guest/session", headers=headers)
        
        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()
    
    def test_delete_guest_session_no_guest_id(self):
        """Test deleting session without guest ID"""
        response = client.delete("/guest/session")
        
        assert response.status_code == 200
        assert "No session" in response.json()["message"]


# ==========================================
# HELPER FUNCTION TESTS
# ==========================================

class TestGuestHelpers:
    """Test guest helper functions"""
    
    @patch("app.routers.guest.redis_client")
    def test_get_guest_usage_count_success(self, mock_redis_client):
        """Test getting guest usage count from Redis"""
        from app.routers.guest import get_guest_usage_count
        
        mock_redis_client.get.return_value = "3"
        
        count = get_guest_usage_count("test-guest-id")
        
        assert count == 3
        mock_redis_client.get.assert_called_once()
    
    @patch("app.routers.guest.redis_client")
    def test_get_guest_usage_count_not_found(self, mock_redis_client):
        """Test getting usage count when key doesn't exist"""
        from app.routers.guest import get_guest_usage_count
        
        mock_redis_client.get.return_value = None
        
        count = get_guest_usage_count("test-guest-id")
        
        assert count == 0
    
    @patch("app.routers.guest.redis_client", None)
    def test_get_guest_usage_count_no_redis(self):
        """Test getting usage count when Redis is unavailable"""
        from app.routers.guest import get_guest_usage_count
        
        count = get_guest_usage_count("test-guest-id")
        
        assert count == 0
    
    @patch("app.routers.guest.redis_client")
    def test_increment_guest_usage_success(self, mock_redis_client):
        """Test incrementing guest usage"""
        from app.routers.guest import increment_guest_usage
        
        mock_redis_client.incr.return_value = 4
        mock_redis_client.expire.return_value = True
        
        count = increment_guest_usage("test-guest-id")
        
        assert count == 4
        mock_redis_client.incr.assert_called_once()
        mock_redis_client.expire.assert_called_once()
    
    @patch("app.routers.guest.redis_client", None)
    def test_increment_guest_usage_no_redis(self):
        """Test incrementing usage when Redis is unavailable"""
        from app.routers.guest import increment_guest_usage
        
        with pytest.raises(Exception):  # Should raise HTTPException
            increment_guest_usage("test-guest-id")
