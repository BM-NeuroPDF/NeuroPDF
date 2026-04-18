#!/usr/bin/env python3
"""
Script to create test user for E2E tests
Usage: python3 create_test_user.py
"""

import sys
import uuid
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from app.db import get_supabase
from app.core import security


def create_test_user():
    """Create test user test1@gmail.com with password Test1234."""
    email = "test1@gmail.com"
    password = "Test1234."
    username = "testuser"

    supabase = get_supabase()

    # Check if user already exists
    auth_res = (
        supabase.table("user_auth")
        .select("*")
        .eq("provider_key", email)
        .eq("provider", "local")
        .execute()
    )
    if auth_res.data:
        print(f"✅ User {email} already exists!")
        return

    # Generate UUID for user
    new_id = str(uuid.uuid4())

    # Hash password
    password_hash = security.hash_password(password)

    try:
        # 1. Create user record
        user_insert = {
            "id": new_id,
            "username": username,
            "llm_choice_id": 1,  # cloud llm (seed id 1)
            "role_id": 1,  # Default role
        }
        user_response = supabase.table("users").insert(user_insert).execute()

        if not user_response.data:
            print("❌ Failed to create user record")
            return

        print(f"✅ Created user record: {new_id}")

        # 2. Create auth record
        auth_insert = {
            "user_id": new_id,
            "provider": "local",
            "provider_key": email,
            "password_hash": password_hash,
        }
        supabase.table("user_auth").insert(auth_insert).execute()
        print(f"✅ Created auth record for {email}")

        # 3. Create settings record
        settings_insert = {
            "user_id": new_id,
            "eula_accepted": True,
            "active_avatar_url": None,
        }
        supabase.table("user_settings").insert(settings_insert).execute()
        print("✅ Created settings record")

        # 4. Create stats record
        stats_insert = {"user_id": new_id, "summary_count": 0, "tools_count": 0}
        supabase.table("user_stats").insert(stats_insert).execute()
        print("✅ Created stats record")

        print("\n🎉 Successfully created test user!")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print(f"   User ID: {new_id}")

    except Exception as e:
        print(f"❌ Error creating user: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    create_test_user()
