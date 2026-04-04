"""
Integration tests for GuestSession operations.
"""

import pytest
from app.models import GuestSession


@pytest.mark.integration
class TestGuestSessionOperations:
    """Test GuestSession CRUD operations."""

    def test_create_guest_session(self, db_session, clean_db):
        """Test creating guest session."""
        session = GuestSession(usage_count=0)
        db_session.add(session)
        db_session.commit()

        assert session.id is not None
        assert session.usage_count == 0
        assert session.created_at is not None

    def test_increment_usage_count(self, db_session, clean_db):
        """Test incrementing usage count."""
        session = GuestSession(usage_count=0)
        db_session.add(session)
        db_session.commit()

        session.usage_count += 1
        db_session.commit()

        updated = (
            db_session.query(GuestSession).filter(GuestSession.id == session.id).first()
        )
        assert updated.usage_count == 1

    def test_update_last_used_at(self, db_session, clean_db):
        """Test updating last_used_at timestamp."""
        session = GuestSession(usage_count=0)
        db_session.add(session)
        db_session.commit()

        # Update usage count to trigger onupdate
        session.usage_count = 1
        db_session.commit()

        updated = (
            db_session.query(GuestSession).filter(GuestSession.id == session.id).first()
        )
        # last_used_at should be updated (onupdate triggers)
        assert updated.last_used_at is not None

    def test_guest_session_defaults(self, db_session, clean_db):
        """Test guest session default values."""
        session = GuestSession()
        db_session.add(session)
        db_session.commit()

        assert session.usage_count == 0
        assert session.created_at is not None
