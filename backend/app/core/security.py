import jwt
import re
import bcrypt
from datetime import datetime, timedelta, timezone
from ..config import settings

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'), 
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False

def validate_password_strength(password: str) -> tuple[bool, str]:
    if len(password) < 8: return False, "Şifre en az 8 karakter olmalıdır"
    if not re.search(r'[A-Z]', password): return False, "Şifre en az bir büyük harf içermelidir"
    if not re.search(r'[a-z]', password): return False, "Şifre en az bir küçük harf içermelidir"
    if not re.search(r'\d', password): return False, "Şifre en az bir rakam içermelidir"
    return True, ""

def create_jwt(user: dict) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user.get("id")),
        "email": user.get("email"),
        "username": user.get("username"),
        "eula_accepted": user.get("eula_accepted", False),
        "exp": now + timedelta(minutes=settings.JWT_EXPIRES_MIN),
        "iat": now,
        "iss": "fastapi",
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")


def verify_jwt(token: str) -> dict:
    """
    Backward-compatible JWT verifier used by older tests/helpers.
    Returns decoded payload, raises ValueError on invalid token.
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except Exception as exc:
        raise ValueError("Invalid JWT token") from exc