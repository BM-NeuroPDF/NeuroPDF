"""
Unit tests for files.py router endpoints
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import UploadFile
from io import BytesIO
import json

from app.main import app
from app.db import get_supabase, get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import User

client = TestClient(app)


# ==========================================
# FIXTURES
# ==========================================

@pytest.fixture
def mock_supabase():
    """Mock Supabase client"""
    mock = MagicMock()
    return mock


@pytest.fixture
def mock_db():
    """Mock database session"""
    mock = MagicMock()
    return mock


@pytest.fixture
def mock_user():
    """Mock authenticated user"""
    return {"sub": "test-user-id", "email": "test@example.com"}


@pytest.fixture
def sample_pdf():
    """Sample PDF file content"""
    # Minimal valid PDF content
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 0\ntrailer\n<< /Size 0 /Root 1 0 R >>\nstartxref\n9\n%%EOF"
    return pdf_content


@pytest.fixture
def override_dependencies(mock_supabase, mock_db, mock_user):
    """Override FastAPI dependencies"""
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_current_user_optional] = lambda: mock_user
    yield
    app.dependency_overrides.clear()


# ==========================================
# SUMMARIZE ENDPOINT TESTS
# ==========================================

class TestSummarizeFile:
    """Test /files/summarize endpoint"""
    
    @patch("app.routers.files.httpx.AsyncClient")
    @patch("app.routers.files.check_summarize_cache")
    @patch("app.routers.files.get_user_llm_choice")
    def test_summarize_file_success(
        self, 
        mock_get_llm_choice,
        mock_check_cache,
        mock_httpx_client,
        override_dependencies,
        sample_pdf,
        mock_supabase,
        mock_db
    ):
        """Test successful PDF summarization"""
        # Setup mocks
        mock_get_llm_choice.return_value = (2, "cloud")  # llm_choice_id, provider
        mock_check_cache.return_value = None  # No cache
        
        # Mock AI Service response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "summary": "Test summary",
            "pdf_text": "Test PDF text"
        }
        
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_client_instance
        
        # Mock user model
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user_obj
        
        # Create test file
        files = {"file": ("test.pdf", sample_pdf, "application/pdf")}
        
        # Make request
        response = client.post("/files/summarize", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "summary" in data
        assert "pdf_text" in data
    
    @patch("app.routers.files.check_summarize_cache_by_hash")
    @patch("app.routers.files.get_user_llm_choice")
    def test_summarize_file_cached(
        self,
        mock_get_llm_choice,
        mock_check_cache,
        override_dependencies,
        sample_pdf,
        mock_db
    ):
        """Test PDF summarization with cached result"""
        # Setup mocks
        mock_get_llm_choice.return_value = (2, "cloud")
        # check_summarize_cache_by_hash is async, so we need to make it return a coroutine
        async def mock_cache_return(*args, **kwargs):
            return "Cached summary"
        mock_check_cache.side_effect = mock_cache_return
        
        files = {"file": ("test.pdf", sample_pdf, "application/pdf")}
        
        response = client.post("/files/summarize", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["cached"] is True
        assert data["summary"] == "Cached summary"
    
    def test_summarize_file_invalid_type(self, override_dependencies):
        """Test summarize with non-PDF file"""
        files = {"file": ("test.txt", b"not a pdf", "text/plain")}
        
        response = client.post("/files/summarize", files=files)
        
        assert response.status_code == 400
        assert "PDF" in response.json()["detail"]


# ==========================================
# CHAT ENDPOINT TESTS
# ==========================================

class TestChatEndpoints:
    """Test chat-related endpoints"""
    
    @patch("app.routers.files.httpx.AsyncClient")
    @patch("app.routers.files.get_user_llm_provider")
    def test_start_chat_from_text(
        self,
        mock_get_provider,
        mock_httpx_client,
        override_dependencies,
        mock_db
    ):
        """Test starting chat session from text"""
        mock_get_provider.return_value = "cloud"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "test-session-123"}
        
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_client_instance
        
        payload = {
            "pdf_text": "Test PDF content",
            "filename": "test.pdf"
        }
        
        response = client.post("/files/chat/start-from-text", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["session_id"] == "test-session-123"
    
    @patch("app.routers.files.httpx.AsyncClient")
    @patch("app.routers.files.get_user_llm_provider")
    def test_start_chat_session(
        self,
        mock_get_provider,
        mock_httpx_client,
        override_dependencies,
        sample_pdf
    ):
        """Test starting chat session with file upload"""
        mock_get_provider.return_value = "cloud"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "test-session-456"}
        
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_client_instance
        
        files = {"file": ("test.pdf", sample_pdf, "application/pdf")}
        
        response = client.post("/files/chat/start", files=files)
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
    
    @patch("app.routers.files.httpx.AsyncClient")
    def test_send_chat_message(
        self,
        mock_httpx_client,
        override_dependencies
    ):
        """Test sending chat message"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"answer": "Test AI response"}
        
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_client_instance
        
        payload = {
            "session_id": "test-session-123",
            "message": "Test message"
        }
        
        response = client.post("/files/chat/message", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
    
    def test_send_chat_message_missing_fields(self, override_dependencies):
        """Test send chat message with missing fields"""
        payload = {"session_id": "test-session"}
        response = client.post("/files/chat/message", json=payload)
        assert response.status_code == 400


# ==========================================
# GENERAL CHAT ENDPOINT TESTS
# ==========================================

class TestGeneralChatEndpoints:
    """Test general chat endpoints (Pro users)"""
    
    @patch("app.routers.files._check_pro_user")
    @patch("app.routers.files.httpx.AsyncClient")
    def test_start_general_chat_success(
        self,
        mock_httpx_client,
        mock_check_pro,
        override_dependencies,
        mock_supabase
    ):
        """Test starting general chat for Pro user"""
        mock_check_pro.return_value = True
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "general-session-123"}
        
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_client_instance
        
        payload = {"llm_provider": "cloud", "mode": "flash"}
        
        response = client.post("/files/chat/general/start", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
    
    @patch("app.routers.files._check_pro_user")
    def test_start_general_chat_not_pro(
        self,
        mock_check_pro,
        override_dependencies,
        mock_supabase
    ):
        """Test starting general chat for non-Pro user"""
        mock_check_pro.return_value = False
        
        payload = {"llm_provider": "cloud"}
        
        response = client.post("/files/chat/general/start", json=payload)
        
        assert response.status_code == 403
        assert "Pro" in response.json()["detail"]
    
    @patch("app.routers.files._check_pro_user")
    @patch("app.routers.files.httpx.AsyncClient")
    def test_send_general_chat_message(
        self,
        mock_httpx_client,
        mock_check_pro,
        override_dependencies,
        mock_supabase
    ):
        """Test sending general chat message"""
        mock_check_pro.return_value = True
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"answer": "General AI response"}
        
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.return_value = mock_client_instance
        
        payload = {
            "session_id": "general-session-123",
            "message": "Hello"
        }
        
        response = client.post("/files/chat/general/message", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data


# ==========================================
# LLM CHOICE ENDPOINT TESTS
# ==========================================

class TestLLMChoiceEndpoints:
    """Test LLM choice endpoints"""
    
    def test_get_user_llm_choice(
        self,
        override_dependencies,
        mock_db
    ):
        """Test getting user LLM choice"""
        mock_user = MagicMock()
        mock_user.id = "test-user-id"
        mock_user.llm_choice_id = 2  # cloud
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user
        
        response = client.get("/files/user/llm-choice")
        
        assert response.status_code == 200
        data = response.json()
        assert "choice_id" in data
        assert "provider" in data
        assert data["choice_id"] == 2
        assert data["provider"] == "cloud"
    
    def test_update_llm_choice(
        self,
        override_dependencies,
        mock_db
    ):
        """Test updating user LLM choice"""
        mock_user = MagicMock()
        mock_user.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user
        
        payload = {"provider": "local"}  # local
        
        response = client.post("/files/user/update-llm", json=payload)
        
        assert response.status_code == 200
        assert mock_db.commit.called
        data = response.json()
        assert data["status"] == "success"
        assert data["provider"] == "local"
        assert data["choice_id"] == 1


# ==========================================
# FILE MANAGEMENT ENDPOINT TESTS
# ==========================================

class TestFileManagementEndpoints:
    """Test file management endpoints"""
    
    def test_get_user_stats(
        self,
        override_dependencies,
        mock_supabase
    ):
        """Test getting user statistics"""
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"total_files": 10, "total_summaries": 5}
        ]
        
        response = client.get("/files/user/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert "total_files" in data or "role" in data
    
    def test_list_user_files(
        self,
        override_dependencies,
        mock_db
    ):
        """Test listing user files"""
        from app.models import PDF
        mock_pdf = MagicMock()
        mock_pdf.id = 1
        mock_pdf.filename = "test.pdf"
        mock_pdf.file_size = 1024
        mock_pdf.created_at = None
        
        # Mock the query chain: db.query(PDF).filter(...).order_by(...).all()
        mock_query = MagicMock()
        mock_filter = MagicMock()
        mock_order_by = MagicMock()
        mock_order_by.all.return_value = [mock_pdf]
        mock_filter.order_by.return_value = mock_order_by
        mock_query.filter.return_value = mock_filter
        mock_db.query.return_value = mock_query
        
        response = client.get("/files/my-files")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "files" in data
        assert "total" in data
        assert isinstance(data["files"], list)
        assert len(data["files"]) == 1
    
    def test_delete_file(
        self,
        override_dependencies,
        mock_supabase
    ):
        """Test deleting a file"""
        mock_supabase.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        
        response = client.delete("/files/files/123")
        
        # Should return 200 or 204
        assert response.status_code in [200, 204]


# ==========================================
# PDF OPERATION ENDPOINT TESTS
# ==========================================

class TestPDFOperations:
    """Test PDF operation endpoints"""
    
    @patch("app.routers.files.PdfReader")
    @patch("app.routers.files.PdfWriter")
    def test_extract_pages(
        self,
        mock_writer,
        mock_reader,
        override_dependencies,
        sample_pdf
    ):
        """Test extracting pages from PDF"""
        mock_reader_instance = MagicMock()
        mock_reader_instance.pages = [MagicMock(), MagicMock()]
        mock_reader.return_value = mock_reader_instance
        
        mock_writer_instance = MagicMock()
        mock_writer_instance.write = MagicMock()
        mock_writer.return_value = mock_writer_instance
        
        # Use multipart/form-data as endpoint expects UploadFile and Form
        files = {"file": ("test.pdf", sample_pdf, "application/pdf")}
        data = {"page_range": "1-2"}
        
        response = client.post("/files/extract-pages", files=files, data=data)
        
        # Should return PDF bytes or success status
        assert response.status_code in [200, 201]
    
    @patch("app.routers.files.PdfReader")
    @patch("app.routers.files.PdfWriter")
    def test_merge_pdfs(
        self,
        mock_writer,
        mock_reader,
        override_dependencies,
        sample_pdf
    ):
        """Test merging multiple PDFs"""
        mock_reader_instance = MagicMock()
        mock_reader_instance.pages = [MagicMock()]
        mock_reader.return_value = mock_reader_instance
        
        mock_writer_instance = MagicMock()
        mock_writer_instance.write = MagicMock()
        mock_writer.return_value = mock_writer_instance
        
        # Use multipart/form-data as endpoint expects List[UploadFile]
        files = [
            ("files", ("test1.pdf", sample_pdf, "application/pdf")),
            ("files", ("test2.pdf", sample_pdf, "application/pdf"))
        ]
        
        response = client.post("/files/merge-pdfs", files=files)
        
        # Should return merged PDF or success status
        assert response.status_code in [200, 201]
