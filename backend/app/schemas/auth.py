from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
import re
from ..core.security import validate_password_strength

class GoogleExchangeIn(BaseModel):
    id_token: str

class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str | None = None
    username: str | None = None
    eula_accepted: bool | None = None
    created_at: datetime | None = None

class RegisterIn(BaseModel):
    username: str
    email: EmailStr
    password: str
    eula_accepted: bool

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid: raise ValueError(error_msg)
        return v

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 50:
            raise ValueError("Username must be between 3 and 50 characters")
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        return v

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AcceptEulaIn(BaseModel):
    accepted: bool