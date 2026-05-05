from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi.responses import PlainTextResponse
from supabase import Client

from app.config import settings
from app.db import get_db, get_supabase
from app.deps import get_current_user as get_current_user_dep
from app.schemas import auth as auth_schemas
from app.utils import helpers

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/eula", response_class=PlainTextResponse)
def get_eula(lang: str = "tr"):
    return helpers.get_eula_content(lang)


@router.post("/accept-eula")
def accept_eula(
    payload: auth_schemas.AcceptEulaIn,
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db),
):
    uid = current_user["sub"]
    if settings.USE_SUPABASE:
        supabase.table("user_settings").update({"eula_accepted": payload.accepted}).eq(
            "user_id", uid
        ).execute()
    else:
        db.execute(
            text("UPDATE user_settings SET eula_accepted = :accepted WHERE user_id = :uid"),
            {"accepted": payload.accepted, "uid": uid},
        )
        db.commit()
    return {"message": "Success"}
