"""
Integration tests for database models.
These tests use a real test database and test CRUD operations.
"""

import pytest
import uuid
from sqlalchemy.exc import IntegrityError
from app.models import (
    User,
    UserAuth,
    UserSettings,
    UserStats,
    PDF,
    GuestSession,
    LLMChoice,
    UserRole,
)


@pytest.mark.integration
class TestLLMChoiceModel:
    """Test LLMChoice model CRUD operations."""

    def test_create_llm_choice(self, test_db_session, clean_db):
        """Test creating LLMChoice."""
        llm_choice = LLMChoice(id=10, name="test_llm")
        test_db_session.add(llm_choice)
        test_db_session.commit()

        assert llm_choice.id == 10
        assert llm_choice.name == "test_llm"

    def test_read_llm_choice(self, test_db_session, clean_db):
        """Test reading LLMChoice."""
        llm_choice = LLMChoice(id=11, name="read_test")
        test_db_session.add(llm_choice)
        test_db_session.commit()

        found = test_db_session.query(LLMChoice).filter(LLMChoice.id == 11).first()
        assert found is not None
        assert found.name == "read_test"

    def test_unique_constraint_llm_choice(self, test_db_session, clean_db):
        """Test unique constraint on LLMChoice name."""
        llm1 = LLMChoice(id=12, name="unique_test")
        test_db_session.add(llm1)
        test_db_session.commit()

        llm2 = LLMChoice(id=13, name="unique_test")
        test_db_session.add(llm2)

        with pytest.raises(IntegrityError):
            test_db_session.commit()


@pytest.mark.integration
class TestUserRoleModel:
    """Test UserRole model CRUD operations."""

    def test_create_user_role(self, test_db_session, clean_db):
        """Test creating UserRole."""
        role = UserRole(id=10, name="test_role")
        test_db_session.add(role)
        test_db_session.commit()

        assert role.id == 10
        assert role.name == "test_role"

    def test_unique_constraint_user_role(self, test_db_session, clean_db):
        """Test unique constraint on UserRole name."""
        role1 = UserRole(id=11, name="unique_role")
        test_db_session.add(role1)
        test_db_session.commit()

        role2 = UserRole(id=12, name="unique_role")
        test_db_session.add(role2)

        with pytest.raises(IntegrityError):
            test_db_session.commit()


@pytest.mark.integration
class TestUserModel:
    """Test User model CRUD operations."""

    def test_create_user(self, test_db_session, clean_db):
        """Test creating User."""
        user_id = str(uuid.uuid4())
        user = User(id=user_id, username="testuser", llm_choice_id=0, role_id=0)
        test_db_session.add(user)
        test_db_session.commit()

        assert user.id == user_id
        assert user.username == "testuser"

    def test_read_user(self, test_db_session, clean_db):
        """Test reading User."""
        user_id = str(uuid.uuid4())
        user = User(id=user_id, username="readuser", llm_choice_id=0, role_id=0)
        test_db_session.add(user)
        test_db_session.commit()

        found = test_db_session.query(User).filter(User.id == user_id).first()
        assert found is not None
        assert found.username == "readuser"

    def test_update_user(self, test_db_session, clean_db):
        """Test updating User."""
        user_id = str(uuid.uuid4())
        user = User(id=user_id, username="updateuser", llm_choice_id=0, role_id=0)
        test_db_session.add(user)
        test_db_session.commit()

        user.username = "updated_username"
        test_db_session.commit()

        found = test_db_session.query(User).filter(User.id == user_id).first()
        assert found.username == "updated_username"

    def test_delete_user(self, test_db_session, clean_db):
        """Test deleting User."""
        user_id = str(uuid.uuid4())
        user = User(id=user_id, username="deleteuser", llm_choice_id=0, role_id=0)
        test_db_session.add(user)
        test_db_session.commit()

        test_db_session.delete(user)
        test_db_session.commit()

        found = test_db_session.query(User).filter(User.id == user_id).first()
        assert found is None

    def test_user_foreign_key_llm_choice(self, test_db_session, clean_db):
        """Test User foreign key constraint with LLMChoice."""
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            username="fk_test",
            llm_choice_id=999,  # Non-existent LLMChoice
            role_id=0,
        )
        test_db_session.add(user)

        with pytest.raises(IntegrityError):
            test_db_session.commit()

    def test_user_foreign_key_role(self, test_db_session, clean_db):
        """Test User foreign key constraint with UserRole."""
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            username="fk_role_test",
            llm_choice_id=0,
            role_id=999,  # Non-existent UserRole
        )
        test_db_session.add(user)

        with pytest.raises(IntegrityError):
            test_db_session.commit()

    def test_user_relationship_llm_choice(self, test_db_session, clean_db):
        """Test User relationship with LLMChoice."""
        user_id = str(uuid.uuid4())
        user = User(id=user_id, username="rel_test", llm_choice_id=0, role_id=0)
        test_db_session.add(user)
        test_db_session.commit()

        assert user.llm_choice is not None
        assert user.llm_choice.id == 0

    def test_user_relationship_role(self, test_db_session, clean_db):
        """Test User relationship with UserRole."""
        user_id = str(uuid.uuid4())
        user = User(id=user_id, username="rel_role_test", llm_choice_id=0, role_id=0)
        test_db_session.add(user)
        test_db_session.commit()

        assert user.role is not None
        assert user.role.id == 0


@pytest.mark.integration
class TestUserAuthModel:
    """Test UserAuth model CRUD operations."""

    def test_create_user_auth(self, test_db_session, clean_db, test_user):
        """Test creating UserAuth."""
        auth = UserAuth(
            user_id=test_user.id,
            provider="local",
            provider_key="test@example.com",
            password_hash="hashed_password",
        )
        test_db_session.add(auth)
        test_db_session.commit()

        assert auth.user_id == test_user.id
        assert auth.provider == "local"

    def test_user_auth_relationship_user(self, test_db_session, clean_db, test_user):
        """Test UserAuth relationship with User."""
        auth = UserAuth(
            user_id=test_user.id,
            provider="local",
            provider_key="rel_test@example.com",
            password_hash="hashed",
        )
        test_db_session.add(auth)
        test_db_session.commit()

        assert auth.user is not None
        assert auth.user.id == test_user.id

    def test_user_auth_cascade_delete(self, test_db_session, clean_db, test_user):
        """Test cascade delete when User is deleted."""
        auth = UserAuth(
            user_id=test_user.id,
            provider="local",
            provider_key="cascade_test@example.com",
            password_hash="hashed",
        )
        test_db_session.add(auth)
        test_db_session.commit()

        test_db_session.delete(test_user)
        test_db_session.commit()

        found = test_db_session.query(UserAuth).filter(UserAuth.id == auth.id).first()
        assert found is None


@pytest.mark.integration
class TestUserSettingsModel:
    """Test UserSettings model CRUD operations."""

    def test_create_user_settings(self, test_db_session, clean_db, test_user):
        """Test creating UserSettings."""
        settings = UserSettings(
            user_id=test_user.id, eula_accepted=True, active_avatar_url="/avatar.png"
        )
        test_db_session.add(settings)
        test_db_session.commit()

        assert settings.user_id == test_user.id
        assert settings.eula_accepted is True

    def test_user_settings_relationship_user(
        self, test_db_session, clean_db, test_user
    ):
        """Test UserSettings relationship with User."""
        settings = UserSettings(user_id=test_user.id, eula_accepted=False)
        test_db_session.add(settings)
        test_db_session.commit()

        assert settings.user is not None
        assert settings.user.id == test_user.id


@pytest.mark.integration
class TestUserStatsModel:
    """Test UserStats model CRUD operations."""

    def test_create_user_stats(self, test_db_session, clean_db, test_user):
        """Test creating UserStats."""
        stats = UserStats(user_id=test_user.id, summary_count=5, tools_count=10)
        test_db_session.add(stats)
        test_db_session.commit()

        assert stats.user_id == test_user.id
        assert stats.summary_count == 5
        assert stats.tools_count == 10

    def test_user_stats_default_values(self, test_db_session, clean_db, test_user):
        """Test UserStats default values."""
        stats = UserStats(user_id=test_user.id)
        test_db_session.add(stats)
        test_db_session.commit()

        assert stats.summary_count == 0
        assert stats.tools_count == 0


@pytest.mark.integration
class TestPDFModel:
    """Test PDF model CRUD operations."""

    def test_create_pdf(self, test_db_session, clean_db, test_user):
        """Test creating PDF."""
        pdf_id = str(uuid.uuid4())
        pdf = PDF(
            id=pdf_id,
            user_id=test_user.id,
            pdf_data=b"fake_pdf_data",
            filename="test.pdf",
            file_size=100,
        )
        test_db_session.add(pdf)
        test_db_session.commit()

        assert pdf.id == pdf_id
        assert pdf.user_id == test_user.id
        assert pdf.filename == "test.pdf"

    def test_pdf_relationship_user(self, test_db_session, clean_db, test_user):
        """Test PDF relationship with User."""
        pdf_id = str(uuid.uuid4())
        pdf = PDF(
            id=pdf_id,
            user_id=test_user.id,
            pdf_data=b"data",
            filename="rel_test.pdf",
            file_size=50,
        )
        test_db_session.add(pdf)
        test_db_session.commit()

        assert pdf.user is not None
        assert pdf.user.id == test_user.id

    def test_pdf_cascade_delete(self, test_db_session, clean_db, test_user):
        """Test cascade delete when User is deleted."""
        pdf_id = str(uuid.uuid4())
        pdf = PDF(
            id=pdf_id,
            user_id=test_user.id,
            pdf_data=b"data",
            filename="cascade_test.pdf",
            file_size=50,
        )
        test_db_session.add(pdf)
        test_db_session.commit()

        test_db_session.delete(test_user)
        test_db_session.commit()

        found = test_db_session.query(PDF).filter(PDF.id == pdf_id).first()
        assert found is None


@pytest.mark.integration
class TestGuestSessionModel:
    """Test GuestSession model CRUD operations."""

    def test_create_guest_session(self, test_db_session, clean_db):
        """Test creating GuestSession."""
        session = GuestSession(usage_count=0)
        test_db_session.add(session)
        test_db_session.commit()

        assert session.id is not None
        assert session.usage_count == 0

    def test_update_guest_session(self, test_db_session, clean_db):
        """Test updating GuestSession."""
        session = GuestSession(usage_count=0)
        test_db_session.add(session)
        test_db_session.commit()

        session.usage_count = 5
        test_db_session.commit()

        found = (
            test_db_session.query(GuestSession)
            .filter(GuestSession.id == session.id)
            .first()
        )
        assert found.usage_count == 5
