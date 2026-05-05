#!/usr/bin/env python3
"""
Local-development-only script to create an E2E test user.

Usage:
  cd backend
  python dev_only/create_test_user.py
"""

import os
import sys
import uuid
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from app.core import security
from app.db import get_supabase


def create_test_user():
    email = os.environ.get("E2E_TEST_EMAIL", "test1@gmail.com")
    # Prefer DEV_SEED_PASSWORD; literal fallback allowlisted in .gitleaks.toml (dev_only/).
    password = os.environ.get("DEV_SEED_PASSWORD") or "Test1234."
    username = "testuser"

    supabase = get_supabase()

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

    new_id = str(uuid.uuid4())
    password_hash = security.hash_password(password)

    try:
        user_insert = {
            "id": new_id,
            "username": username,
            "llm_choice_id": 1,
            "role_id": 1,
        }
        user_response = supabase.table("users").insert(user_insert).execute()

        if not user_response.data:
            print("❌ Failed to create user record")
            return

        auth_insert = {
            "user_id": new_id,
            "provider": "local",
            "provider_key": email,
            "password_hash": password_hash,
        }
        supabase.table("user_auth").insert(auth_insert).execute()

        settings_insert = {
            "user_id": new_id,
            "eula_accepted": True,
            "active_avatar_url": None,
        }
        supabase.table("user_settings").insert(settings_insert).execute()

        stats_insert = {"user_id": new_id, "summary_count": 0, "tools_count": 0}
        supabase.table("user_stats").insert(stats_insert).execute()

        print("\n🎉 Successfully created local test user!")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print(f"   User ID: {new_id}")

    except Exception as e:
        print(f"❌ Error creating user: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    create_test_user()
