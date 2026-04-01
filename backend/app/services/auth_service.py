from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from ..config import settings
from ..db import SessionLocal
from .avatar_service import create_initial_avatar_for_user


def verify_google_token(token: str):
    return id_token.verify_oauth2_token(
        token, grequests.Request(), settings.GOOGLE_CLIENT_ID
    )


def create_user_avatar(user_id: str, username: str):
    db = SessionLocal()
    try:
        create_initial_avatar_for_user(db, str(user_id), username)
    except Exception:
        # Avatar creation should never block auth flow.
        pass
    finally:
        db.close()
