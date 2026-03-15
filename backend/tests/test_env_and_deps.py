"""
Environment and dependency checks so we fail fast (e.g. ModuleNotFoundError: pypdf).
Run early to ensure test environment is valid.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


class TestOptionalDependencies:
    """Check optional deps used by the app (e.g. files router uses pypdf)."""

    def test_pypdf_import(self):
        """Fail fast if pypdf is missing (required for PDF operations)."""
        try:
            from pypdf import PdfReader  # noqa: F401
        except ImportError as e:
            pytest.fail(
                f"pypdf is required for PDF tests. Install with: pip install pypdf. Original: {e}"
            )


class TestAlembicMigrations:
    """Verify Alembic migrations can run and test DB has expected tables."""

    def test_migrations_applied_tables_exist(self, test_db_engine):
        """After session-scoped migrations, core tables must exist."""
        from sqlalchemy import text
        with test_db_engine.connect() as conn:
            r = conn.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'llm_choices', 'user_roles', 'pdfs')"
                )
            )
            rows = r.fetchall()
        assert len(rows) >= 3, "Expected at least users, llm_choices, user_roles to exist after migrations"


class TestAppLoads:
    """Sanity: app loads and root/health respond (no test DB required)."""

    def test_root_returns_ok(self):
        """GET / returns status ok (no fixtures)."""
        with TestClient(app) as client:
            response = client.get("/")
        assert response.status_code == 200
        assert response.json().get("status") == "ok"
