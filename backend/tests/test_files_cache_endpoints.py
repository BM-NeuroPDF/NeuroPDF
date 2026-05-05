from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.deps import get_current_user, get_current_user_optional
from app.main import app

client = TestClient(app)


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def override_auth_and_db(mock_db):
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "u-1",
        "email": "u1@test.com",
    }
    app.dependency_overrides[get_current_user_optional] = lambda: {
        "sub": "u-1",
        "email": "u1@test.com",
    }
    yield
    app.dependency_overrides.clear()


class TestFilesListCache:
    @patch("app.routers.files._legacy.list_user_pdfs")
    @patch("app.routers.files._legacy.stats_cache_set_json")
    @patch("app.routers.files._legacy.stats_cache_get_json")
    def test_my_files_cache_miss_then_hit(
        self,
        mock_get_cache,
        _mock_set_cache,
        mock_list_user_pdfs,
        override_auth_and_db,
    ):
        mock_pdf = MagicMock()
        mock_pdf.id = "p-1"
        mock_pdf.filename = "a.pdf"
        mock_pdf.file_size = 10
        mock_pdf.created_at = None
        mock_pdf.page_count = 1
        mock_list_user_pdfs.return_value = [mock_pdf]
        mock_get_cache.side_effect = [
            None,
            {"files": [], "total": 0},
        ]

        r1 = client.get("/files/my-files")
        r2 = client.get("/files/my-files")

        assert r1.status_code == 200
        assert r1.json()["total"] == 1
        assert r2.status_code == 200
        assert r2.json() == {"files": [], "total": 0}
        assert mock_list_user_pdfs.call_count == 1

    @patch("app.routers.files._legacy.validate_file_size", new_callable=AsyncMock)
    @patch("app.routers.files._legacy.stats_cache_delete_keys")
    @patch("app.routers.files._legacy.save_pdf_to_db")
    @patch("app.routers.files._legacy.check_rate_limit", return_value=True)
    def test_upload_invalidates_my_files_cache(
        self,
        _mock_rl,
        mock_save_pdf,
        mock_delete_keys,
        _mock_validate,
        override_auth_and_db,
    ):
        pdf = MagicMock()
        pdf.id = "p-2"
        pdf.filename = "x.pdf"
        pdf.file_size = 20
        mock_save_pdf.return_value = pdf

        files = {
            "file": (
                "x.pdf",
                b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
                "application/pdf",
            )
        }
        r = client.post("/files/upload", files=files)
        assert r.status_code == 200
        mock_delete_keys.assert_called_once_with("user:u-1:files:list:v1")


class TestChatCache:
    @patch("app.routers.files.routes_chat.list_user_chat_sessions")
    @patch("app.routers.files._legacy.stats_cache_set_json")
    @patch("app.routers.files._legacy.stats_cache_get_json")
    def test_chat_sessions_cache_miss_then_hit(
        self,
        mock_get_cache,
        _mock_set_cache,
        mock_list_sessions,
        override_auth_and_db,
    ):
        row = MagicMock()
        row.id = "s-1"
        row.ai_session_id = "ai-1"
        row.filename = "f.pdf"
        row.pdf_id = "p-1"
        row.created_at = None
        row.updated_at = None
        mock_list_sessions.return_value = [row]
        mock_get_cache.side_effect = [None, {"sessions": []}]

        r1 = client.get("/files/chat/sessions")
        r2 = client.get("/files/chat/sessions")

        assert r1.status_code == 200
        assert len(r1.json()["sessions"]) == 1
        assert r2.status_code == 200
        assert r2.json() == {"sessions": []}
        assert mock_list_sessions.call_count == 1

    @patch("app.routers.files.routes_chat.get_session_messages_ordered")
    @patch("app.routers.files.routes_chat.get_chat_session_by_db_id")
    @patch("app.routers.files._legacy.stats_cache_set_json")
    @patch("app.routers.files._legacy.stats_cache_get_json")
    def test_chat_messages_cache_miss_then_hit(
        self,
        mock_get_cache,
        _mock_set_cache,
        mock_get_session,
        mock_get_messages,
        override_auth_and_db,
    ):
        mock_get_cache.side_effect = [None, {"messages": []}]
        mock_get_session.return_value = MagicMock(id="s-1")
        msg = MagicMock()
        msg.role = "assistant"
        msg.content = "hello"
        msg.metadata_json = {}
        msg.created_at = None
        mock_get_messages.return_value = [msg]

        r1 = client.get("/files/chat/sessions/s-1/messages")
        r2 = client.get("/files/chat/sessions/s-1/messages")

        assert r1.status_code == 200
        assert len(r1.json()["messages"]) == 1
        assert r2.status_code == 200
        assert r2.json() == {"messages": []}
        assert mock_get_messages.call_count == 1

    @patch("app.routers.files._legacy.stats_cache_delete_keys")
    @patch("app.routers.files.routes_chat.append_chat_turn")
    def test_send_message_invalidates_message_and_session_caches(
        self,
        _mock_append_turn,
        mock_delete_keys,
        override_auth_and_db,
    ):
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"answer": "ok"}
        mock_client.post.return_value = mock_response
        previous = getattr(app.state, "ai_http_client", None)
        app.state.ai_http_client = mock_client

        try:
            r = client.post(
                "/files/chat/message",
                json={"session_id": "ai-1", "message": "hello", "language": "tr"},
            )
        finally:
            if previous is not None:
                app.state.ai_http_client = previous

        assert r.status_code == 200
        mock_delete_keys.assert_called_once_with(
            "user:u-1:chat:session:ai-1:messages:v1",
            "user:u-1:chat:sessions:list:v1",
        )
