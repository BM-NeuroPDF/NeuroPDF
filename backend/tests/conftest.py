"""
Global pytest configuration and fixtures for backend tests.

- test_db: Session with transaction rollback (never commits to DB; real DB untouched).
- Test DB is separate (TEST_DB_NAME / test_db); Alembic runs against it in session setup.
- Optional deps (e.g. pypdf) are checked at session start; tests can skip if missing.
"""

import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine import URL
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
import subprocess
import sys
from typing import Generator

# Set test environment before importing app modules
os.environ["ENVIRONMENT"] = "test"

from app.db import get_db, get_supabase
from app.main import app
from app.models import (
    User,
    UserAuth,
    PDF,
    LLMChoice,
    UserRole,
)
from app.core.security import create_jwt


# ==========================================
# DEPENDENCY / ENV CHECKS (fail fast, e.g. ModuleNotFoundError: pypdf)
# ==========================================


def _check_optional_deps():
    """Check optional dependencies; set flags for skipif."""
    try:
        import pypdf  # noqa: F401

        _pypdf_available = True
    except ImportError:
        _pypdf_available = False
    return _pypdf_available


_pypdf_available = _check_optional_deps()

requires_pypdf = pytest.mark.skipif(
    not _pypdf_available,
    reason="pypdf not installed (pip install pypdf)",
)


# ==========================================
# PYTEST MARKERS
# ==========================================


def pytest_configure(config):
    config.addinivalue_line("markers", "unit: Unit tests (no DB).")
    config.addinivalue_line("markers", "integration: Integration tests (real test DB).")
    config.addinivalue_line("markers", "api: API endpoint tests (TestClient).")


# ==========================================
# TEST DATABASE CONFIGURATION
# ==========================================


def build_test_db_url() -> URL:
    """Build test database URL from environment variables."""
    user = os.getenv("TEST_DB_USER") or os.getenv("DB_USER", "postgres")
    password = os.getenv("TEST_DB_PASSWORD") or os.getenv("DB_PASSWORD", "")
    host = os.getenv("TEST_DB_HOST") or os.getenv("DB_HOST", "localhost")
    port = os.getenv("TEST_DB_PORT") or os.getenv("DB_PORT", "5432")
    name = os.getenv("TEST_DB_NAME", "test_db")
    sslmode = os.getenv("TEST_DB_SSLMODE") or os.getenv("DB_SSLMODE", "disable")

    return URL.create(
        "postgresql+psycopg2",
        username=user,
        password=password,
        host=host,
        port=int(port),
        database=name,
        query={"sslmode": sslmode},
    )


def run_alembic_migrations():
    """Run Alembic migrations on test database."""
    test_db_url = build_test_db_url()

    # Temporarily set environment variables for Alembic
    original_env = {}
    env_vars_to_set = {
        "DB_USER": test_db_url.username,
        "DB_PASSWORD": test_db_url.password or "",
        "DB_HOST": test_db_url.host,
        "DB_PORT": str(test_db_url.port),
        "DB_NAME": test_db_url.database,
        "DB_SSLMODE": test_db_url.query.get("sslmode", "disable"),
    }

    for key, value in env_vars_to_set.items():
        original_env[key] = os.environ.get(key)
        os.environ[key] = value

    try:
        # Run Alembic upgrade
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"Alembic migration error: {result.stderr}")
            raise RuntimeError(f"Failed to run migrations: {result.stderr}")
    finally:
        # Restore original environment
        for key, original_value in original_env.items():
            if original_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original_value


def create_test_database():
    """Create test database if it doesn't exist."""
    test_db_url = build_test_db_url()

    # Connect to postgres database to create test_db
    admin_url = URL.create(
        "postgresql+psycopg2",
        username=test_db_url.username,
        password=test_db_url.password or "",
        host=test_db_url.host,
        port=test_db_url.port,
        database="postgres",
        query={"sslmode": test_db_url.query.get("sslmode", "disable")},
    )

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")

    try:
        with admin_engine.connect() as conn:
            # Check if database exists
            result = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
                {"dbname": test_db_url.database},
            )
            exists = result.fetchone()

            if not exists:
                conn.execute(text(f'CREATE DATABASE "{test_db_url.database}"'))
                print(f"Created test database: {test_db_url.database}")
    finally:
        admin_engine.dispose()


# ==========================================
# FIXTURES
# ==========================================


@pytest.fixture(scope="session")
def test_db_engine():
    """Create test database engine (session-scoped). Skips if test DB unreachable."""
    try:
        create_test_database()
    except Exception as e:
        pytest.skip(
            f"Could not create test database (is PostgreSQL running?): {e}. "
            "Set TEST_DB_NAME/test_db or create DB manually."
        )

    try:
        run_alembic_migrations()
    except Exception as e:
        pytest.skip(
            f"Alembic migrations failed on test DB: {e}. "
            "Check TEST_DB_* / DB_* and that test_db exists."
        )

    test_db_url = build_test_db_url()
    try:
        engine = create_engine(
            test_db_url,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
        )
        # Verify connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        pytest.skip(
            f"Test DB connection failed: {e}. "
            "Start PostgreSQL, create test_db, or set TEST_DB_*."
        )

    yield engine
    engine.dispose()


@pytest.fixture(scope="function")
def test_db_session(test_db_engine) -> Generator[Session, None, None]:
    """
    Database session with transaction rollback. Never commits; rollback at teardown
    so the test database is not left with data (real DB is never used).
    """
    connection = test_db_engine.connect()
    transaction = connection.begin()
    TestSessionLocal = sessionmaker(bind=connection, expire_on_commit=False)
    session = TestSessionLocal()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="function")
def test_db(test_db_session: Session) -> Generator[Session, None, None]:
    """
    Test database session with base data (LLMChoice, UserRole) seeded in the same
    transaction. Use this when tests need DB; no commits, rollback at teardown.
    """
    ensure_base_data(test_db_session)
    yield test_db_session


@pytest.fixture(scope="function")
def clean_db(test_db_session: Session):
    """Alias: ensure base data in session. Prefer test_db for rollback-only isolation."""
    ensure_base_data(test_db_session)
    yield test_db_session


def ensure_base_data(session: Session) -> None:
    """Seed LLMChoice and UserRole in the current transaction (flush only, no commit)."""
    llm_choices = session.query(LLMChoice).all()
    if not llm_choices:
        session.add(LLMChoice(id=0, name="local llm"))
        session.add(LLMChoice(id=1, name="cloud llm"))
        session.flush()
    user_roles = session.query(UserRole).all()
    if not user_roles:
        session.add(UserRole(id=0, name="default user"))
        session.add(UserRole(id=1, name="pro user"))
        session.add(UserRole(id=2, name="admin"))
        session.flush()


@pytest.fixture(scope="function")
def test_supabase_client():
    """Mock Supabase client for tests."""
    mock_client = MagicMock()

    # Setup common mock responses
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table

    yield mock_client


@pytest.fixture(scope="function")
def test_client(test_db: Session, test_supabase_client):
    """FastAPI TestClient with get_db and get_supabase overridden (test_db = rollback-only session)."""

    def override_get_db():
        yield test_db

    def override_get_supabase():
        return test_supabase_client

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_supabase] = override_get_supabase

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(test_db: Session) -> User:
    """Create a test user in the current transaction (flush only; rolled back at teardown)."""
    import uuid

    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        username="testuser",
        llm_choice_id=0,
        role_id=0,
    )
    test_db.add(user)
    test_db.flush()
    test_db.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_user_with_auth(test_db: Session, test_user: User) -> tuple[User, UserAuth]:
    """Create a test user with local auth (flush only; rolled back at teardown)."""
    from app.core.security import hash_password

    auth = UserAuth(
        user_id=test_user.id,
        provider="local",
        provider_key="test@example.com",
        password_hash=hash_password("TestPassword123"),
    )
    test_db.add(auth)
    test_db.flush()
    test_db.refresh(auth)
    return test_user, auth


@pytest.fixture(scope="function")
def auth_headers(test_user: User) -> dict:
    """Create authorization headers with JWT token."""
    token = create_jwt({"sub": test_user.id, "email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def sample_pdf_content() -> bytes:
    """Sample PDF file content for testing."""
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 0\ntrailer\n<< /Size 0 /Root 1 0 R >>\nstartxref\n9\n%%EOF"


@pytest.fixture(scope="function")
def sample_pdf_file(sample_pdf_content: bytes):
    """Create a mock PDF file for testing."""
    from io import BytesIO
    from fastapi import UploadFile

    file_content = BytesIO(sample_pdf_content)
    return UploadFile(
        filename="test.pdf",
        file=file_content,
        headers={"content-type": "application/pdf"},
    )


# ==========================================
# TEST HELPER FUNCTIONS
# ==========================================


def create_test_pdf(
    db: Session, user_id: str, filename: str = "test.pdf", pdf_data: bytes = None
) -> PDF:
    """Helper function to create a test PDF record."""
    import uuid
    from app.models import PDF

    if pdf_data is None:
        pdf_data = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 0\ntrailer\n<< /Size 0 /Root 1 0 R >>\nstartxref\n9\n%%EOF"

    pdf = PDF(
        id=str(uuid.uuid4()),
        user_id=user_id,
        pdf_data=pdf_data,
        filename=filename,
        file_size=len(pdf_data),
    )
    db.add(pdf)
    db.commit()
    db.refresh(pdf)
    return pdf
