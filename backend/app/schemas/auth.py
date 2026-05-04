from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
import re
from typing import Literal

from ..core.security import validate_password_strength


class GoogleExchangeIn(BaseModel):
    id_token: str


class LoginRequires2FAOut(BaseModel):
    status: Literal["requires_2fa"] = "requires_2fa"
    temp_token: str


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

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 50:
            raise ValueError("Username must be between 3 and 50 characters")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError(
                "Username can only contain letters, numbers, and underscores"
            )
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Verify2FAIn(BaseModel):
    temp_token: str
    otp_code: str = Field(..., min_length=6, max_length=6)

    @field_validator("otp_code", mode="before")
    @classmethod
    def normalize_otp(cls, v: object) -> str:
        if isinstance(v, str):
            return v.replace(" ", "").strip()
        return str(v)


class AcceptEulaIn(BaseModel):
    accepted: bool


class DeleteAccountIn(BaseModel):
    password: str = Field(..., min_length=1)


class VerifyAndDeleteAccountIn(BaseModel):
    password: str | None = None
    otp: str | None = Field(None, min_length=6, max_length=6)

    @field_validator("password", mode="before")
    @classmethod
    def normalize_password(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("otp", mode="before")
    @classmethod
    def normalize_otp(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.replace(" ", "").strip()
            return s if s else None
        return str(v)


class DeletionOtpSentOut(BaseModel):
    message: str = "OTP sent"
