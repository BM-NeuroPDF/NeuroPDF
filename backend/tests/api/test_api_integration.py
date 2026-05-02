"""
API integration tests using TestClient with test_db (rollback-only session).
These tests run when the test DB is available; they verify Auth, Profile, and File endpoints.
"""

import pytest
from io import BytesIO
from pypdf import PdfWriter


@pytest.mark.api
class TestHealthEndpoints:
    """Health and root endpoints (no DB required once app is loaded)."""

    def test_root_ok(self, test_client):
        """GET / returns status ok."""
        response = test_client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"


@pytest.mark.api
class TestFileUploadWithTestDb:
    """POST /files/upload with real test_db (session rolled back after test)."""

    def test_upload_pdf_authenticated(
        self, test_client, auth_headers, sample_pdf_content
    ):
        """Authenticated user can upload a PDF; file is stored in DB for the request (then rolled back)."""
        files = {"file": ("test.pdf", BytesIO(sample_pdf_content), "application/pdf")}
        response = test_client.post("/files/upload", files=files, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "file_id" in data
        assert data.get("filename") == "test.pdf"

    def test_upload_valid_pdf_then_my_files_has_page_count(
        self, test_client, auth_headers
    ):
        """Yüklemede sayfa sayısı kaydedilir; my-files blob çekmeden döner."""
        buf = BytesIO()
        w = PdfWriter()
        w.add_blank_page(width=72, height=72)
        w.write(buf)
        content = buf.getvalue()
        files = {"file": ("pages.pdf", BytesIO(content), "application/pdf")}
        up = test_client.post("/files/upload", files=files, headers=auth_headers)
        assert up.status_code == 200
        file_id = up.json()["file_id"]

        listed = test_client.get("/files/my-files", headers=auth_headers)
        assert listed.status_code == 200
        payload = listed.json()
        assert payload["total"] >= 1
        row = next(f for f in payload["files"] if f["id"] == file_id)
        assert row["page_count"] == 1


@pytest.mark.api
class TestProfileWithTestDb:
    """Profile/avatar and my-files with real test_db."""

    def test_my_files_empty(self, test_client, auth_headers):
        """GET /files/my-files returns paginated shape (empty for new test user)."""
        response = test_client.get("/files/my-files", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert data.get("files") == []
        assert data.get("total") == 0
