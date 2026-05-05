"""
Unit tests for files.py router endpoints
"""

import logging

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.db import get_supabase, get_db
from app.deps import get_current_user, get_current_user_optional
from app.repositories.dto import UserStatsDTO, GlobalStatsDTO
from app.repositories.user_repo import UserRepository

client = TestClient(app)

MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
    b"trailer\n<< /Root 1 0 R >>\n%%EOF"
)


# ==========================================
# FIXTURES
# ==========================================


@pytest.fixture
def mock_ai_http_client():
    """Replace lifespan AI HTTP client with an AsyncMock for router tests."""
    mock_client = AsyncMock()
    previous = getattr(app.state, "ai_http_client", None)
    app.state.ai_http_client = mock_client
    yield mock_client
    if previous is not None:
        app.state.ai_http_client = previous


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
    return MINIMAL_PDF


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

    @patch("app.routers.files._legacy.check_summarize_cache")
    @patch("app.routers.files._legacy.get_user_llm_choice")
    def test_summarize_file_success(
        self,
        mock_get_llm_choice,
        mock_check_cache,
        mock_ai_http_client,
        override_dependencies,
        sample_pdf,
        mock_supabase,
        mock_db,
    ):
        """Test successful PDF summarization"""
        # Setup mocks
        mock_get_llm_choice.return_value = (1, "cloud")  # llm_choice_id, provider
        mock_check_cache.return_value = None  # No cache

        # Mock AI Service response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "summary": "Test summary",
            "pdf_text": "Test PDF text",
        }

        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        # Mock user model
        mock_user_obj = MagicMock()
        mock_user_obj.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = (
            mock_user_obj
        )

        # Create test file
        files = {"file": ("test.pdf", sample_pdf, "application/pdf")}

        # Make request
        response = client.post("/files/summarize", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "summary" in data
        assert "pdf_text" in data

    @patch("app.routers.files._legacy.check_summarize_cache_by_hash")
    @patch("app.routers.files._legacy.get_user_llm_choice")
    def test_summarize_file_cached(
        self,
        mock_get_llm_choice,
        mock_check_cache,
        override_dependencies,
        sample_pdf,
        mock_db,
    ):
        """Test PDF summarization with cached result"""
        # Setup mocks
        mock_get_llm_choice.return_value = (1, "cloud")

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

    @patch(
        "app.repositories.user_repo.UserRepository.get_llm_provider",
        new_callable=AsyncMock,
    )
    def test_start_chat_from_text(
        self, mock_get_provider, mock_ai_http_client, override_dependencies, mock_db
    ):
        """Test starting chat session from text"""
        mock_get_provider.return_value = "cloud"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "test-session-123"}

        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        payload = {"pdf_text": "Test PDF content", "filename": "test.pdf"}

        response = client.post("/files/chat/start-from-text", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["session_id"] == "test-session-123"

    @patch(
        "app.repositories.user_repo.UserRepository.get_llm_provider",
        new_callable=AsyncMock,
    )
    def test_start_chat_session(
        self, mock_get_provider, mock_ai_http_client, override_dependencies, sample_pdf
    ):
        """Test starting chat session with file upload"""
        mock_get_provider.return_value = "cloud"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "test-session-456"}

        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        files = {"file": ("test.pdf", sample_pdf, "application/pdf")}

        response = client.post("/files/chat/start", files=files)

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data

    @patch("app.routers.files.routes_chat.append_chat_turn")
    def test_send_chat_message(
        self, mock_append_chat_turn, mock_ai_http_client, override_dependencies
    ):
        """Test sending chat message"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"answer": "Test AI response"}

        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        payload = {
            "session_id": "test-session-123",
            "message": "Test message",
            "message_payload": {
                "id": "msg-user-1",
                "sourceLanguage": "tr",
                "translations": {"tr": "Test message"},
            },
        }

        response = client.post("/files/chat/message", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        mock_append_chat_turn.assert_called_once()
        kwargs = mock_append_chat_turn.call_args.kwargs
        assert kwargs["user_metadata"]["id"] == "msg-user-1"
        assert kwargs["user_metadata"]["translations"]["tr"] == "Test message"
        assert kwargs["assistant_metadata"]["sourceLanguage"] == "tr"
        assert kwargs["assistant_metadata"]["translations"]["tr"] == "Test AI response"

    def test_send_chat_message_missing_fields(self, override_dependencies):
        """Test send chat message with missing fields"""
        payload = {"session_id": "test-session"}
        response = client.post("/files/chat/message", json=payload)
        assert response.status_code == 400

    @patch("app.routers.files.routes_chat.get_chat_session_by_db_id")
    @patch("app.routers.files.routes_chat.get_session_messages_ordered")
    def test_get_session_messages_includes_metadata(
        self, mock_get_messages, mock_get_session, override_dependencies
    ):
        mock_get_session.return_value = MagicMock(id="row-1")
        mock_get_messages.return_value = [
            MagicMock(
                role="assistant",
                content="Merhaba",
                metadata_json={
                    "id": "m-1",
                    "sourceLanguage": "tr",
                    "translations": {"tr": "Merhaba", "en": "Hello"},
                },
                created_at=None,
            )
        ]

        response = client.get("/files/chat/sessions/row-1/messages")
        assert response.status_code == 200
        item = response.json()["messages"][0]
        assert item["id"] == "m-1"
        assert item["sourceLanguage"] == "tr"
        assert item["translations"]["en"] == "Hello"

    @patch("app.routers.files.routes_chat.history_for_ai_restore")
    @patch("app.routers.files.routes_chat.get_session_messages_ordered")
    @patch("app.routers.files.routes_chat.get_chat_session_by_db_id")
    def test_resume_session_returns_message_metadata(
        self,
        mock_get_session,
        mock_get_messages,
        mock_history_restore,
        mock_ai_http_client,
        override_dependencies,
    ):
        mock_get_session.return_value = MagicMock(
            id="row-1",
            ai_session_id="ai-1",
            pdf_id=None,
            filename="doc.pdf",
            llm_provider="cloud",
            mode="flash",
            context_text="pdf text",
        )
        mock_get_messages.return_value = [
            MagicMock(
                role="assistant",
                content="Merhaba",
                metadata_json={
                    "id": "a-1",
                    "sourceLanguage": "tr",
                    "translations": {"tr": "Merhaba", "en": "Hello"},
                },
                created_at=None,
            )
        ]
        mock_history_restore.return_value = [
            {"role": "assistant", "content": "Merhaba"}
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "ai-1"}
        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        response = client.post("/files/chat/sessions/row-1/resume")
        assert response.status_code == 200
        item = response.json()["messages"][0]
        assert item["id"] == "a-1"
        assert item["sourceLanguage"] == "tr"
        assert item["translations"]["en"] == "Hello"


# ==========================================
# GENERAL CHAT ENDPOINT TESTS
# ==========================================


class TestGeneralChatEndpoints:
    """Test general chat endpoints (Pro users)"""

    @patch(
        "app.repositories.user_repo.UserRepository.get_user_role_and_llm_provider",
        new_callable=AsyncMock,
    )
    def test_start_general_chat_success(
        self, mock_role_llm, mock_ai_http_client, override_dependencies, mock_supabase
    ):
        """Test starting general chat for Pro user"""
        mock_role_llm.return_value = (True, "cloud")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "general-session-123"}

        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        payload = {"llm_provider": "cloud", "mode": "flash"}

        response = client.post("/files/chat/general/start", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data

    @patch(
        "app.repositories.user_repo.UserRepository.get_user_role_and_llm_provider",
        new_callable=AsyncMock,
    )
    def test_start_general_chat_not_pro(
        self, mock_role_llm, override_dependencies, mock_supabase
    ):
        """Test starting general chat for non-Pro user"""
        mock_role_llm.return_value = (False, "local")

        payload = {"llm_provider": "cloud"}

        response = client.post("/files/chat/general/start", json=payload)

        assert response.status_code == 403
        assert "Pro" in response.json()["detail"]

    @patch(
        "app.repositories.user_repo.UserRepository.get_user_role_and_llm_provider",
        new_callable=AsyncMock,
    )
    def test_send_general_chat_message(
        self, mock_role_llm, mock_ai_http_client, override_dependencies, mock_supabase
    ):
        """Test sending general chat message"""
        mock_role_llm.return_value = (True, "cloud")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"answer": "General AI response"}

        mock_ai_http_client.post = AsyncMock(return_value=mock_response)

        payload = {"session_id": "general-session-123", "message": "Hello"}

        response = client.post("/files/chat/general/message", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "answer" in data


# ==========================================
# LLM CHOICE ENDPOINT TESTS
# ==========================================


class TestLLMChoiceEndpoints:
    """Test LLM choice endpoints"""

    def test_get_user_llm_choice(self, override_dependencies, mock_db):
        """Test getting user LLM choice"""
        mock_user = MagicMock()
        mock_user.id = "test-user-id"
        mock_user.llm_choice_id = 1  # cloud llm

        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        response = client.get("/files/user/llm-choice")

        assert response.status_code == 200
        data = response.json()
        assert "choice_id" in data
        assert "provider" in data
        assert data["choice_id"] == 1
        assert data["provider"] == "cloud"

    def test_update_llm_choice(self, override_dependencies, mock_db):
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
        assert data["choice_id"] == 0

    def test_update_llm_choice_cloud(self, override_dependencies, mock_db):
        mock_user = MagicMock()
        mock_user.id = "test-user-id"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        response = client.post("/files/user/update-llm", json={"provider": "cloud"})

        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "cloud"
        assert data["choice_id"] == 1


# ==========================================
# FILE MANAGEMENT ENDPOINT TESTS
# ==========================================


class TestFileManagementEndpoints:
    """Test file management endpoints"""

    def test_get_user_stats(self, override_dependencies, mock_supabase):
        """Test getting user statistics"""
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"total_files": 10, "total_summaries": 5}
        ]

        response = client.get("/files/user/stats")

        assert response.status_code == 200
        data = response.json()
        assert "total_files" in data or "role" in data

    def test_list_user_files(self, override_dependencies, mock_db):
        """Test listing user files"""
        mock_pdf = MagicMock()
        mock_pdf.id = 1
        mock_pdf.filename = "test.pdf"
        mock_pdf.file_size = 1024
        mock_pdf.created_at = None
        mock_pdf.page_count = 3

        # Mock: db.query(PDF).options(...).filter(...).order_by(...).all()
        mock_query = MagicMock()
        mock_after_options = MagicMock()
        mock_filter = MagicMock()
        mock_order_by = MagicMock()
        mock_order_by.all.return_value = [mock_pdf]
        mock_filter.order_by.return_value = mock_order_by
        mock_after_options.filter.return_value = mock_filter
        mock_query.options.return_value = mock_after_options
        mock_db.query.return_value = mock_query

        response = client.get("/files/my-files")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "files" in data
        assert "total" in data
        assert isinstance(data["files"], list)
        assert len(data["files"]) == 1
        assert data["files"][0]["page_count"] == 3

    def test_delete_file(self, override_dependencies, mock_supabase):
        """Test deleting a file"""
        mock_supabase.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

        response = client.delete("/files/files/123")

        # Should return 200 or 204
        assert response.status_code in [200, 204]


# ==========================================
# SLICE-1 STATS SHIM TESTS
# ==========================================


class TestStatsRepositoryShimEndpoints:
    @pytest.fixture(autouse=True)
    def _bypass_stats_redis_cache(self):
        with (
            patch("app.routers.files._legacy.stats_cache_get_json", return_value=None),
            patch("app.routers.files._legacy.stats_cache_set_json"),
        ):
            yield

    @patch("app.routers.files.stats_repo.get_user_stats", new_callable=AsyncMock)
    def test_get_user_stats_maps_pro_role_from_dto(
        self, mock_get_user_stats, override_dependencies
    ):
        mock_get_user_stats.return_value = UserStatsDTO(
            summary_count=5, tools_count=2, role_name_db="pro user"
        )

        response = client.get("/files/user/stats")

        assert response.status_code == 200
        assert response.json()["role"] == "Pro"
        assert response.json()["summary_count"] == 5
        assert response.json()["tools_count"] == 2

    @patch("app.routers.files.stats_repo.get_user_stats", new_callable=AsyncMock)
    def test_get_user_stats_maps_admin_role_from_dto(
        self, mock_get_user_stats, override_dependencies
    ):
        mock_get_user_stats.return_value = UserStatsDTO(
            summary_count=1, tools_count=3, role_name_db="admin"
        )

        response = client.get("/files/user/stats")

        assert response.status_code == 200
        assert response.json()["role"] == "Admin"

    @patch("app.routers.files.stats_repo.get_user_stats", new_callable=AsyncMock)
    def test_get_user_stats_maps_default_role_to_standart(
        self, mock_get_user_stats, override_dependencies
    ):
        mock_get_user_stats.return_value = UserStatsDTO(
            summary_count=0, tools_count=0, role_name_db="default user"
        )

        response = client.get("/files/user/stats")

        assert response.status_code == 200
        assert response.json()["role"] == "Standart"

    @patch("app.routers.files.stats_repo.get_user_stats", new_callable=AsyncMock)
    def test_get_user_stats_handles_role_name_db_none_as_standart(
        self, mock_get_user_stats, override_dependencies
    ):
        mock_get_user_stats.return_value = UserStatsDTO(
            summary_count=7, tools_count=4, role_name_db=None
        )

        response = client.get("/files/user/stats")

        assert response.status_code == 200
        assert response.json()["role"] == "Standart"

    @patch("app.routers.files.stats_repo.get_global_stats", new_callable=AsyncMock)
    def test_get_global_stats_returns_dto_fields(
        self, mock_get_global_stats, override_dependencies
    ):
        mock_get_global_stats.return_value = GlobalStatsDTO(
            total_users=10, total_processed=42, total_ai_summaries=17
        )

        response = client.get("/files/global-stats")

        assert response.status_code == 200
        assert response.json() == {
            "total_users": 10,
            "total_processed": 42,
            "total_ai_summaries": 17,
        }

    @patch("app.routers.files.stats_repo.get_global_stats", new_callable=AsyncMock)
    def test_get_global_stats_fallback_on_repo_exception(
        self, mock_get_global_stats, override_dependencies
    ):
        mock_get_global_stats.side_effect = RuntimeError("boom")

        response = client.get("/files/global-stats")

        assert response.status_code == 200
        assert response.json() == {
            "total_users": 0,
            "total_processed": 0,
            "total_ai_summaries": 0,
        }

    @patch("app.routers.files.stats_repo.get_user_stats", new_callable=AsyncMock)
    def test_get_user_stats_second_request_uses_cache_without_repo(
        self, mock_get_user_stats, override_dependencies
    ):
        mock_get_user_stats.return_value = UserStatsDTO(
            summary_count=9, tools_count=1, role_name_db="pro user"
        )
        cached_payload = {
            "summary_count": 3,
            "tools_count": 4,
            "role": "Pro",
        }

        with (
            patch(
                "app.routers.files._legacy.stats_cache_get_json",
                side_effect=[None, cached_payload],
            ),
            patch("app.routers.files._legacy.stats_cache_set_json") as mock_set_cache,
        ):
            r1 = client.get("/files/user/stats")
            r2 = client.get("/files/user/stats")

        assert r1.status_code == 200
        assert r1.json()["summary_count"] == 9
        assert mock_get_user_stats.await_count == 1
        mock_set_cache.assert_called_once()

        assert r2.status_code == 200
        assert r2.json() == cached_payload
        assert mock_get_user_stats.await_count == 1

    @patch("app.routers.files.stats_repo.get_user_stats", new_callable=AsyncMock)
    def test_get_user_stats_second_request_logs_cache_hit(
        self, mock_get_user_stats, override_dependencies, caplog
    ):
        mock_get_user_stats.return_value = UserStatsDTO(
            summary_count=1, tools_count=1, role_name_db="pro user"
        )
        cached_payload = {
            "summary_count": 3,
            "tools_count": 4,
            "role": "Pro",
        }
        caplog.set_level(logging.INFO)
        with (
            patch(
                "app.routers.files._legacy.stats_cache_get_json",
                side_effect=[None, cached_payload],
            ),
            patch("app.routers.files._legacy.stats_cache_set_json"),
        ):
            client.get("/files/user/stats")
            client.get("/files/user/stats")
        assert any(
            "event=cache_lookup" in r.message and "phase=cache_hit" in r.message
            for r in caplog.records
        )

    @patch("app.routers.files.stats_repo.get_global_stats", new_callable=AsyncMock)
    def test_get_global_stats_second_request_uses_cache_without_repo(
        self, mock_get_global_stats, override_dependencies
    ):
        dto = GlobalStatsDTO(total_users=2, total_processed=100, total_ai_summaries=40)
        mock_get_global_stats.return_value = dto
        cached = {
            "total_users": 99,
            "total_processed": 1,
            "total_ai_summaries": 1,
        }

        with (
            patch(
                "app.routers.files._legacy.stats_cache_get_json",
                side_effect=[None, cached],
            ),
            patch("app.routers.files._legacy.stats_cache_set_json") as mock_set,
        ):
            r1 = client.get("/files/global-stats")
            r2 = client.get("/files/global-stats")

        assert r1.status_code == 200
        assert r1.json() == {
            "total_users": 2,
            "total_processed": 100,
            "total_ai_summaries": 40,
        }
        assert mock_get_global_stats.await_count == 1
        mock_set.assert_called_once()

        assert r2.status_code == 200
        assert r2.json() == cached
        assert mock_get_global_stats.await_count == 1

    @patch("app.routers.files.stats_repo.get_global_stats", new_callable=AsyncMock)
    def test_get_global_stats_second_request_logs_cache_hit(
        self, mock_get_global_stats, override_dependencies, caplog
    ):
        mock_get_global_stats.return_value = GlobalStatsDTO(
            total_users=1, total_processed=2, total_ai_summaries=3
        )
        cached = {"total_users": 9, "total_processed": 8, "total_ai_summaries": 7}
        caplog.set_level(logging.INFO)
        with (
            patch(
                "app.routers.files._legacy.stats_cache_get_json",
                side_effect=[None, cached],
            ),
            patch("app.routers.files._legacy.stats_cache_set_json"),
        ):
            client.get("/files/global-stats")
            client.get("/files/global-stats")
        assert any(
            "event=cache_lookup" in r.message
            and "global_stats_redis" in r.message
            and "phase=cache_hit" in r.message
            for r in caplog.records
        )

    @pytest.mark.asyncio
    @patch(
        "app.routers.files._legacy.stats_repo.increment_usage", new_callable=AsyncMock
    )
    @patch("app.routers.files.settings.SUPABASE_URL", "http://test")
    @patch("app.routers.files.settings.USE_SUPABASE", True)
    async def test_increment_user_usage_task_uses_supabase(
        self, mock_increment_usage, mock_supabase
    ):
        from app.routers.files import increment_user_usage_task

        with patch(
            "app.routers.files._legacy.get_supabase", return_value=mock_supabase
        ):
            await increment_user_usage_task("user-1", "summary")

        mock_increment_usage.assert_awaited_once_with(
            user_id="user-1",
            operation_type="summary",
            db=None,
            supabase=mock_supabase,
        )

    @pytest.mark.asyncio
    @patch(
        "app.routers.files._legacy.stats_repo.increment_usage", new_callable=AsyncMock
    )
    @patch("app.routers.files.settings.USE_SUPABASE", False)
    async def test_increment_user_usage_task_uses_local_db(self, mock_increment_usage):
        mock_session = MagicMock()
        with patch("app.routers.files._legacy.SessionLocal", return_value=mock_session):
            from app.routers.files import increment_user_usage_task

            await increment_user_usage_task("user-1", "tool")

        mock_increment_usage.assert_awaited_once_with(
            user_id="user-1",
            operation_type="tool",
            db=mock_session,
            supabase=None,
        )
        mock_session.close.assert_called_once()


# ==========================================
# SLICE-2 USER REPO SHIM TESTS
# ==========================================


class TestUserRepositoryShimEndpoints:
    @patch(
        "app.repositories.user_repo.UserRepository.get_user_role_and_llm_provider",
        new_callable=AsyncMock,
    )
    def test_is_pro_user_delegation_in_general_chat_start(
        self, mock_role_llm, override_dependencies
    ):
        mock_role_llm.return_value = (False, "local")

        response = client.post("/files/chat/general/start", json={"mode": "flash"})

        assert response.status_code == 403
        mock_role_llm.assert_awaited_once()

    @patch(
        "app.repositories.user_repo.UserRepository.get_user_role_and_llm_provider",
        new_callable=AsyncMock,
    )
    def test_is_pro_user_delegation_in_general_chat_message(
        self, mock_role_llm, override_dependencies
    ):
        mock_role_llm.return_value = (False, "local")

        payload = {"session_id": "general-session-123", "message": "Hello"}
        response = client.post("/files/chat/general/message", json=payload)

        assert response.status_code == 403
        mock_role_llm.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_llm_provider_returns_cloud_when_db_says_1(self, mock_db):
        repo = UserRepository()
        mock_user = MagicMock()
        mock_user.llm_choice_id = 1
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        provider = await repo.get_llm_provider(
            user_id="test-user-id", db=mock_db, supabase=None
        )

        assert provider == "cloud"

    @pytest.mark.asyncio
    async def test_get_llm_provider_returns_local_when_db_says_0(self, mock_db):
        repo = UserRepository()
        mock_user = MagicMock()
        mock_user.llm_choice_id = 0
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        provider = await repo.get_llm_provider(
            user_id="test-user-id", db=mock_db, supabase=None
        )

        assert provider == "local"

    @pytest.mark.asyncio
    async def test_get_llm_provider_fallback_to_local_on_db_exception(self, mock_db):
        repo = UserRepository()
        mock_db.query.side_effect = RuntimeError("db boom")

        provider = await repo.get_llm_provider(
            user_id="test-user-id", db=mock_db, supabase=None
        )

        assert provider == "local"


# ==========================================
# PDF OPERATION ENDPOINT TESTS
# ==========================================


class TestPDFOperations:
    """Test PDF operation endpoints"""

    @patch("app.routers.files._legacy.PdfReader")
    @patch("app.routers.files._legacy.PdfWriter")
    def test_extract_pages(
        self, mock_writer, mock_reader, override_dependencies, sample_pdf
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

    @patch("app.routers.files._legacy.PdfReader")
    @patch("app.routers.files._legacy.PdfWriter")
    def test_merge_pdfs(
        self, mock_writer, mock_reader, override_dependencies, sample_pdf
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
            ("files", ("test2.pdf", sample_pdf, "application/pdf")),
        ]

        response = client.post("/files/merge-pdfs", files=files)

        # Should return merged PDF or success status
        assert response.status_code in [200, 201]
