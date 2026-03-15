"""
Integration tests for user operations (User, UserAuth, UserSettings, UserStats).
"""
import pytest
import uuid
from app.models import User, UserAuth, UserSettings, UserStats
from app.core.security import hash_password


@pytest.mark.integration
class TestUserOperations:
    """Test user CRUD operations."""
    
    def test_create_user_with_auth(self, test_db_session, clean_db):
        """Test creating user with authentication."""
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            username="authuser",
            llm_choice_id=0,
            role_id=0
        )
        test_db_session.add(user)
        test_db_session.commit()
        
        auth = UserAuth(
            user_id=user_id,
            provider="local",
            provider_key="authuser@example.com",
            password_hash=hash_password("Password123")
        )
        test_db_session.add(auth)
        test_db_session.commit()
        
        assert user.id == user_id
        assert len(user.auth_records) == 1
        assert user.auth_records[0].provider == "local"
    
    def test_create_user_with_settings(self, test_db_session, clean_db):
        """Test creating user with settings."""
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            username="settingsuser",
            llm_choice_id=0,
            role_id=0
        )
        test_db_session.add(user)
        test_db_session.commit()
        
        settings = UserSettings(
            user_id=user_id,
            eula_accepted=True,
            active_avatar_url="/avatar.png"
        )
        test_db_session.add(settings)
        test_db_session.commit()
        
        assert user.settings is not None
        assert user.settings.eula_accepted is True
    
    def test_create_user_with_stats(self, test_db_session, clean_db):
        """Test creating user with stats."""
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            username="statsuser",
            llm_choice_id=0,
            role_id=0
        )
        test_db_session.add(user)
        test_db_session.commit()
        
        stats = UserStats(
            user_id=user_id,
            summary_count=10,
            tools_count=5
        )
        test_db_session.add(stats)
        test_db_session.commit()
        
        assert user.stats is not None
        assert user.stats.summary_count == 10
    
    def test_update_user_stats(self, test_db_session, clean_db, test_user):
        """Test updating user stats."""
        stats = UserStats(
            user_id=test_user.id,
            summary_count=5,
            tools_count=3
        )
        test_db_session.add(stats)
        test_db_session.commit()
        
        stats.summary_count = 15
        stats.tools_count = 8
        test_db_session.commit()
        
        updated = test_db_session.query(UserStats).filter(UserStats.user_id == test_user.id).first()
        assert updated.summary_count == 15
        assert updated.tools_count == 8
    
    def test_user_cascade_delete(self, test_db_session, clean_db):
        """Test cascade delete when user is deleted."""
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            username="cascadeuser",
            llm_choice_id=0,
            role_id=0
        )
        test_db_session.add(user)
        test_db_session.commit()
        
        # Add related records
        auth = UserAuth(
            user_id=user_id,
            provider="local",
            provider_key="cascade@example.com",
            password_hash="hashed"
        )
        settings = UserSettings(user_id=user_id, eula_accepted=False)
        stats = UserStats(user_id=user_id, summary_count=0, tools_count=0)
        
        test_db_session.add_all([auth, settings, stats])
        test_db_session.commit()
        
        # Delete user
        test_db_session.delete(user)
        test_db_session.commit()
        
        # Verify cascade delete
        assert test_db_session.query(UserAuth).filter(UserAuth.id == auth.id).first() is None
        assert test_db_session.query(UserSettings).filter(UserSettings.user_id == user_id).first() is None
        assert test_db_session.query(UserStats).filter(UserStats.user_id == user_id).first() is None
