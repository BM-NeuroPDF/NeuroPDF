#!/usr/bin/env python3
"""
Seed script to create test user for E2E tests.
This script creates a test user in the database if it doesn't exist.

Usage:
    python seed_test_user.py
"""

import sys
import os
import uuid
from pathlib import Path

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent))

from app.core import security
from app.db import get_supabase
from app.config import settings

# Test user credentials (matching frontend/e2e/fixtures/test-data.ts)
TEST_USER_EMAIL = "user@test.com"
TEST_USER_PASSWORD = "test123"
TEST_USER_USERNAME = "testuser"

def seed_test_user():
    """Create test user if it doesn't exist"""
    print("🔍 Checking for test user...")
    
    try:
        supabase = get_supabase()
        
        # Check if user already exists (by email in user_auth)
        auth_check = supabase.table("user_auth").select("user_id").eq("provider", "local").eq("provider_key", TEST_USER_EMAIL).execute()
        
        if auth_check.data:
            user_id = auth_check.data[0]["user_id"]
            print(f"✅ Test user already exists with ID: {user_id}")
            return user_id
        
        print("📝 Creating test user...")
        
        # Generate new user ID
        new_id = str(uuid.uuid4())
        
        # Hash password
        password_hash = security.hash_password(TEST_USER_PASSWORD)
        print(f"🔐 Password hashed successfully")
        
        # 1. Create User record
        user_insert = {
            "id": new_id,
            "username": TEST_USER_USERNAME,
            "llm_choice_id": 2,  # Cloud LLM (matching register_user default)
            "role_id": 0  # Default user (not pro, matching test expectations)
        }
        user_response = supabase.table("users").insert(user_insert).execute()
        
        if not user_response.data:
            raise Exception("Failed to create user record")
        
        print(f"✅ User record created: {new_id}")
        
        # 2. Create Auth record
        auth_insert = {
            "user_id": new_id,
            "provider": "local",
            "provider_key": TEST_USER_EMAIL,
            "password_hash": password_hash
        }
        auth_response = supabase.table("user_auth").insert(auth_insert).execute()
        
        if not auth_response.data:
            raise Exception("Failed to create auth record")
        
        print(f"✅ Auth record created")
        
        # 3. Create Settings record
        settings_insert = {
            "user_id": new_id,
            "eula_accepted": True,
            "active_avatar_url": None
        }
        settings_response = supabase.table("user_settings").insert(settings_insert).execute()
        
        if not settings_response.data:
            raise Exception("Failed to create settings record")
        
        print(f"✅ Settings record created")
        
        # 4. Create Stats record
        stats_insert = {
            "user_id": new_id,
            "summary_count": 0,
            "tools_count": 0
        }
        stats_response = supabase.table("user_stats").insert(stats_insert).execute()
        
        if not stats_response.data:
            raise Exception("Failed to create stats record")
        
        print(f"✅ Stats record created")
        
        print(f"\n🎉 Test user created successfully!")
        print(f"   Email: {TEST_USER_EMAIL}")
        print(f"   Password: {TEST_USER_PASSWORD}")
        print(f"   User ID: {new_id}")
        
        return new_id
        
    except Exception as e:
        print(f"❌ Error creating test user: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    seed_test_user()
