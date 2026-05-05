"""Local-development-only seed script.

Usage:
  cd backend
  python dev_only/seed.py
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from app.core.security import hash_password, verify_password
from app.db import SessionLocal
from app.models import LLMChoice, User, UserAuth, UserRole, UserSettings, UserStats


def ensure_llm_choices(db) -> None:
    llm_defaults = {
        0: "local llm",
        1: "cloud llm",
    }
    for llm_id, llm_name in llm_defaults.items():
        row = db.query(LLMChoice).filter(LLMChoice.id == llm_id).first()
        if row:
            if row.name != llm_name:
                row.name = llm_name
            continue
        db.add(LLMChoice(id=llm_id, name=llm_name))


def ensure_roles(db) -> None:
    role_defaults = {
        0: "Standart",
        1: "Pro",
        2: "Admin",
    }
    for role_id, role_name in role_defaults.items():
        row = db.query(UserRole).filter(UserRole.id == role_id).first()
        if row:
            if row.name != role_name:
                row.name = role_name
            continue
        db.add(UserRole(id=role_id, name=role_name))


def ensure_user(
    db,
    *,
    email: str,
    password: str,
    role_id: int,
    username: str,
) -> None:
    auth = (
        db.query(UserAuth)
        .filter(UserAuth.provider == "local", UserAuth.provider_key == email)
        .first()
    )

    if auth and auth.user:
        user = auth.user
    else:
        user = User(
            id=str(uuid.uuid4()),
            username=username,
            llm_choice_id=0,
            role_id=role_id,
        )
        db.add(user)
        db.flush()
        auth = UserAuth(
            user_id=user.id,
            provider="local",
            provider_key=email,
            password_hash="",
        )
        db.add(auth)

    user.role_id = role_id
    user.llm_choice_id = 0
    if not user.username:
        user.username = username

    pw_hash = hash_password(password)
    if not verify_password(password, pw_hash):
        raise RuntimeError(f"Password hashing validation failed for {email}")
    auth.password_hash = pw_hash

    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not settings:
        db.add(
            UserSettings(user_id=user.id, eula_accepted=True, active_avatar_url=None)
        )
    else:
        settings.eula_accepted = True

    stats = db.query(UserStats).filter(UserStats.user_id == user.id).first()
    if not stats:
        db.add(UserStats(user_id=user.id, summary_count=0, tools_count=0))


def main() -> None:
    if SessionLocal is None:
        raise RuntimeError("SessionLocal is not initialized. Check DATABASE_URL/env.")

    # Prefer DEV_SEED_PASSWORD; literal fallback is allowlisted in .gitleaks.toml (dev_only/).
    seed_password = os.environ.get("DEV_SEED_PASSWORD") or "Test1234!"

    db = SessionLocal()
    try:
        ensure_llm_choices(db)
        ensure_roles(db)

        ensure_user(
            db,
            email="admin@test.com",
            password=seed_password,
            role_id=2,
            username="admin_test",
        )
        ensure_user(
            db,
            email="pro@test.com",
            password=seed_password,
            role_id=1,
            username="pro_test",
        )
        ensure_user(
            db,
            email="std@test.com",
            password=seed_password,
            role_id=0,
            username="std_test",
        )

        db.commit()
        print("Veritabanı başarıyla tohumlandı!")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
