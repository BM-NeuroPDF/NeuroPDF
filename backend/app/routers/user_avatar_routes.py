# app/routers/user_avatar_routes.py

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Body, Form
from sqlalchemy import desc, text
from sqlalchemy.orm import Session, load_only
from pydantic import BaseModel
from typing import Optional
import base64
import logging
from PIL import Image
import io

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.services.avatar_service import (
    create_storage_path,
    upload_avatar_png_to_storage,
    save_avatar_record_and_set_active,
    generate_avatar_from_name,
    create_initial_avatar_for_user,
    generate_avatar_with_prompt,
    save_temp_avatar,
    get_temp_avatar,
    edit_avatar_with_prompt,
    load_avatar_bytes_from_storage,
)

from app.models import UserAvatar

router = APIRouter(prefix="/api/v1/user", tags=["User Avatar"])

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
logger = logging.getLogger(__name__)


def _fetch_local_avatar_context(db: Session, user_id: str) -> dict | None:
    """Single JOIN (+ scalar subquery) for avatar URL + display-name sources."""
    row = (
        db.execute(
            text(
                """
            SELECT u.username AS username,
                   us.active_avatar_url AS active_avatar_url,
                   (SELECT ua.provider_key
                    FROM user_auth ua
                    WHERE ua.user_id = u.id AND ua.provider = 'local'
                    ORDER BY ua.id ASC
                    LIMIT 1) AS auth_email
            FROM users u
            LEFT JOIN user_settings us ON us.user_id = u.id
            WHERE u.id = :uid
            LIMIT 1
            """
            ),
            {"uid": user_id},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def _clear_invalid_avatar_url_local(db: Session, user_id: str) -> None:
    db.execute(
        text("UPDATE user_settings SET active_avatar_url = NULL WHERE user_id = :uid"),
        {"uid": user_id},
    )
    db.commit()


def _display_name_from_local_row(row: dict | None) -> str:
    if not row:
        return "User"
    return row.get("username") or row.get("auth_email") or "User"


# --- REQUEST MODELLERİ ---
class GenerateAvatarRequest(BaseModel):
    prompt: str


class ConfirmAvatarRequest(BaseModel):
    temp_avatar_id: str


class EditAvatarRequest(BaseModel):
    prompt: str


class AvatarResponse(BaseModel):
    id: int
    image_path: str
    is_ai_generated: bool
    created_at: str


# --- YARDIMCI FONKSİYON ---
def resolve_user_id(user_id: str, current_user: dict) -> str:
    """
    Eğer user_id 'me' ise, token'daki sub (user_id) değerini döndürür.
    Değilse ve yetki yoksa 403 fırlatır.
    """
    token_user_id = current_user["sub"]

    if user_id == "me":
        return token_user_id

    if user_id != token_user_id:
        raise HTTPException(
            status_code=403, detail="Forbidden: You can only access your own avatar."
        )

    return user_id


# --- ENDPOINTLER ---


@router.get("/{user_id}/avatar")
async def get_avatar(
    user_id: str,
    db: Optional[Session] = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Kullanıcının aktif avatarını çeker.
    Önce DB'den, DB yoksa Supabase REST API'den çeker.
    """
    # 1. Kullanıcı kimliği doğrulama ('me' kontrolü)
    target_user_id = resolve_user_id(user_id, current_user)
    logger.info(
        f"🔍 Avatar lookup started for user: {target_user_id}, DB available: {db is not None}"
    )

    active_avatar_url = None
    local_row: dict | None = None

    # 2. Önce DB'den çekmeyi dene (tek JOIN + alt sorgu — SELECT * yerine yalnızca kullanılan kolonlar)
    if db is not None:
        try:
            local_row = _fetch_local_avatar_context(db, target_user_id)
            if local_row:
                logger.info(
                    f"User found in DB: {target_user_id}, "
                    f"has_avatar_url={bool(local_row.get('active_avatar_url'))}"
                )
                temp_url = local_row.get("active_avatar_url")
                if temp_url:
                    if temp_url != "static/defaults/default_avatar.png":
                        active_avatar_url = temp_url
                        logger.info(
                            f"✅ Avatar URL found in DB for {target_user_id}: {active_avatar_url}"
                        )
                    else:
                        logger.warning(
                            f"⚠️ Invalid avatar URL in DB for {target_user_id}: {temp_url}, will create new avatar"
                        )
                        _clear_invalid_avatar_url_local(db, target_user_id)
                        local_row["active_avatar_url"] = None
                else:
                    logger.info(
                        f"⚠️ User found but no active_avatar_url in settings for {target_user_id}"
                    )
            else:
                logger.warning(f"User not found in DB: {target_user_id}")
        except Exception as e:
            logger.warning(f"Failed to get avatar from DB: {e}", exc_info=True)

    # 3. DB'den bulunamadıysa Supabase REST API'den çekmeyi dene (yalnızca USE_SUPABASE=true)
    if not active_avatar_url and settings.USE_SUPABASE:
        try:
            from app.db import get_supabase

            supabase = get_supabase()

            # user_settings tablosundan active_avatar_url çek
            logger.info(
                f"Trying to get avatar from Supabase REST API for {target_user_id}"
            )
            response = (
                supabase.table("user_settings")
                .select("active_avatar_url")
                .eq("user_id", target_user_id)
                .execute()
            )

            logger.info(f"Supabase REST API response: {response.data}")
            if response.data and len(response.data) > 0:
                temp_url = response.data[0].get("active_avatar_url")
                # Geçersiz avatar URL'lerini temizle
                if temp_url and temp_url != "static/defaults/default_avatar.png":
                    active_avatar_url = temp_url
                    logger.info(
                        f"✅ Avatar URL found in Supabase REST API for {target_user_id}: {active_avatar_url}"
                    )
                elif temp_url == "static/defaults/default_avatar.png":
                    logger.warning(
                        f"⚠️ Invalid avatar URL in Supabase for {target_user_id}: {temp_url}, will create new avatar"
                    )
                    # Geçersiz URL'i temizle
                    try:
                        supabase.table("user_settings").update(
                            {"active_avatar_url": None}
                        ).eq("user_id", target_user_id).execute()
                    except Exception as e:
                        logger.warning(f"Failed to clean invalid avatar URL: {e}")
                else:
                    logger.info(
                        f"⚠️ user_settings found but active_avatar_url is None for {target_user_id}"
                    )
            else:
                logger.info(
                    f"⚠️ No user_settings found in Supabase REST API for {target_user_id}"
                )
        except Exception as e:
            logger.warning(
                f"Failed to get avatar from Supabase REST API: {e}", exc_info=True
            )

    # 4. Avatar URL bulunamadıysa otomatik olarak oluştur
    if not active_avatar_url:
        logger.info(
            f"⚠️ No active avatar URL found for user {target_user_id}, creating default avatar..."
        )

        # DB varsa otomatik avatar oluştur
        if db is not None:
            try:
                if local_row:
                    username = _display_name_from_local_row(local_row)
                    logger.info(
                        f"Creating initial avatar for user {target_user_id} with username: {username}"
                    )
                    # Önce avatar bytes'ını oluştur (storage'a yükleme başarısız olsa bile kullanabilmek için)
                    avatar_bytes = generate_avatar_from_name(username)

                    # Storage'a yüklemeyi dene
                    try:
                        avatar = create_initial_avatar_for_user(
                            db, target_user_id, username
                        )
                        if avatar and avatar.image_path:
                            active_avatar_url = avatar.image_path
                            logger.info(
                                f"✅ Default avatar created and saved to storage: {active_avatar_url}"
                            )
                        else:
                            # Storage'a yükleme başarısız oldu, direkt bytes'ı döndür
                            logger.warning(
                                "Storage upload failed, returning generated avatar directly"
                            )
                            from fastapi.responses import Response

                            return Response(
                                content=avatar_bytes, media_type="image/png"
                            )
                    except Exception as upload_error:
                        # Storage'a yükleme başarısız oldu, direkt bytes'ı döndür
                        logger.warning(
                            f"Storage upload failed: {upload_error}, returning generated avatar directly"
                        )
                        from fastapi.responses import Response

                        return Response(content=avatar_bytes, media_type="image/png")
                else:
                    logger.warning(
                        f"User not found in DB for avatar creation: {target_user_id}"
                    )
            except Exception as e:
                logger.error(f"Error creating initial avatar: {e}", exc_info=True)

        # Hala avatar URL yoksa 404 döndür
        if not active_avatar_url:
            logger.warning(
                f"❌ No active avatar URL found for user {target_user_id} and failed to create default avatar"
            )
            raise HTTPException(status_code=404, detail="Active avatar not set")

    # 5. Supabase Storage veya yerel diskten oku
    try:
        logger.info(f"Loading active avatar for {target_user_id}: {active_avatar_url}")
        avatar_data = load_avatar_bytes_from_storage(active_avatar_url)
        from fastapi.responses import Response

        return Response(content=avatar_data, media_type="image/png")

    except FileNotFoundError:
        logger.warning(
            f"Avatar file not found in storage: {active_avatar_url}, generating default avatar"
        )
        try:
            if db is not None and local_row:
                username = _display_name_from_local_row(local_row)
                avatar_bytes = generate_avatar_from_name(username)
                from fastapi.responses import Response

                return Response(content=avatar_bytes, media_type="image/png")
        except Exception as e:
            logger.error(f"Failed to generate default avatar: {e}", exc_info=True)
        raise HTTPException(status_code=404, detail="Avatar file not found in storage")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Avatar download failed: {e}", exc_info=True)
        error_str = str(e).lower()
        if "bucket not found" in error_str or (
            "not_found" in error_str and "bucket" in error_str
        ):
            raise HTTPException(
                status_code=404,
                detail="Avatar storage bucket not configured. Please create 'avatars' bucket in Supabase Storage.",
            )
        if "object not found" in error_str or (
            "not_found" in error_str and "object" in error_str
        ):
            logger.warning(
                f"Avatar file not found in storage, generating default avatar for {target_user_id}"
            )
            try:
                if db is not None and local_row:
                    username = _display_name_from_local_row(local_row)
                    avatar_bytes = generate_avatar_from_name(username)
                    from fastapi.responses import Response

                    return Response(content=avatar_bytes, media_type="image/png")
            except Exception as gen_error:
                logger.error(
                    f"Failed to generate default avatar: {gen_error}", exc_info=True
                )
            raise HTTPException(
                status_code=404, detail="Avatar file not found in storage"
            )
        raise HTTPException(status_code=404, detail="Failed to retrieve avatar file")


@router.get("/{user_id}/avatars")
async def get_avatar_history(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    limit: int = 10,
):
    target_user_id = resolve_user_id(user_id, current_user)

    exists = db.execute(
        text("SELECT 1 FROM users WHERE id = :uid LIMIT 1"),
        {"uid": target_user_id},
    ).first()
    if exists is None:
        raise HTTPException(status_code=404, detail="User not found")

    avatars = (
        db.query(UserAvatar)
        .options(
            load_only(
                UserAvatar.id,
                UserAvatar.image_path,
                UserAvatar.is_ai_generated,
                UserAvatar.created_at,
            )
        )
        .filter(UserAvatar.user_id == target_user_id)
        .order_by(desc(UserAvatar.created_at))
        .limit(limit)
        .all()
    )

    return [
        AvatarResponse(
            id=avatar.id,
            image_path=avatar.image_path,
            is_ai_generated=avatar.is_ai_generated,
            created_at=avatar.created_at.isoformat() if avatar.created_at else "",
        )
        for avatar in avatars
    ]


@router.post("/{user_id}/avatar")
async def upload_avatar(
    user_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # 'me' kontrolü (BURASI HATAYI ÇÖZEN KISIM)
    target_user_id = resolve_user_id(user_id, current_user)

    # 1) Content-Type
    if file.content_type != "image/png":
        raise HTTPException(status_code=415, detail="Only PNG files are allowed")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    # 2) Magic bytes
    if not contents.startswith(PNG_MAGIC):
        raise HTTPException(status_code=415, detail="Only PNG files are allowed")

    # 3) Pillow doğrulama
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        if img.format != "PNG":
            raise HTTPException(status_code=415, detail="Only PNG files are allowed")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # 4) Storage path
    storage_path = create_storage_path(target_user_id)

    # 5) Upload
    try:
        upload_avatar_png_to_storage(storage_path, contents)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to upload avatar")

    # 6) DB Kayıt
    try:
        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=target_user_id,
            image_path=storage_path,
            is_ai=False,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to save avatar")

    return {
        "message": "Avatar uploaded successfully",
        "path": storage_path,
        "avatar_id": avatar.id,
    }


@router.post("/{user_id}/avatar/generate")
async def generate_avatar_preview(
    user_id: str,
    request: GenerateAvatarRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    target_user_id = resolve_user_id(user_id, current_user)

    row = _fetch_local_avatar_context(db, target_user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    username = _display_name_from_local_row(row)

    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    try:
        avatar_bytes = await generate_avatar_with_prompt(username, request.prompt)

        # Redis'e kaydet
        temp_avatar_id = save_temp_avatar(target_user_id, avatar_bytes, request.prompt)

        avatar_base64 = base64.b64encode(avatar_bytes).decode("utf-8")

        return {
            "message": "Avatar preview generated",
            "temp_avatar_id": temp_avatar_id,
            "preview_image": f"data:image/png;base64,{avatar_base64}",
            "prompt": request.prompt,
        }
    except Exception as e:
        logger.error(f"Failed to generate avatar preview: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to generate avatar: {str(e)}"
        )


@router.post("/{user_id}/avatar/edit")
async def edit_avatar(
    user_id: str,
    file: UploadFile = File(...),
    prompt: str = Form(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    target_user_id = resolve_user_id(user_id, current_user)

    exists = db.execute(
        text("SELECT 1 FROM users WHERE id = :uid LIMIT 1"),
        {"uid": target_user_id},
    ).first()
    if exists is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Dosya kontrolleri
    if file.content_type not in ["image/png", "image/jpeg", "image/jpg"]:
        raise HTTPException(status_code=415, detail="Only PNG/JPEG files are allowed")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    if not (contents.startswith(PNG_MAGIC) or contents.startswith(JPEG_MAGIC)):
        raise HTTPException(status_code=415, detail="Invalid image file")

    # PNG'ye çevir
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()

        img = Image.open(io.BytesIO(contents))
        if img.format != "PNG":
            png_buffer = io.BytesIO()
            img.convert("RGB").save(png_buffer, format="PNG")
            contents = png_buffer.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    if not prompt or not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    try:
        edited_avatar_bytes = await edit_avatar_with_prompt(contents, prompt)
        temp_avatar_id = save_temp_avatar(
            target_user_id, edited_avatar_bytes, f"Edited: {prompt}"
        )
        avatar_base64 = base64.b64encode(edited_avatar_bytes).decode("utf-8")

        return {
            "message": "Avatar edited successfully",
            "temp_avatar_id": temp_avatar_id,
            "preview_image": f"data:image/png;base64,{avatar_base64}",
            "prompt": prompt,
        }
    except Exception as e:
        logger.error(f"Failed to edit avatar: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to edit avatar: {str(e)}")


@router.post("/{user_id}/avatar/confirm")
async def confirm_avatar(
    user_id: str,
    request: ConfirmAvatarRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    target_user_id = resolve_user_id(user_id, current_user)

    temp_avatar_id = request.temp_avatar_id
    if not temp_avatar_id:
        raise HTTPException(status_code=400, detail="temp_avatar_id is required")

    avatar_bytes = get_temp_avatar(target_user_id, temp_avatar_id)
    if not avatar_bytes:
        raise HTTPException(status_code=404, detail="Temp avatar not found or expired")

    try:
        storage_path = create_storage_path(target_user_id)
        upload_avatar_png_to_storage(storage_path, avatar_bytes)

        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=target_user_id,
            image_path=storage_path,
            is_ai=True,
        )

        # Redis temizliği
        from app.redis_client import redis_client

        if redis_client:
            try:
                redis_key = f"temp_avatar:{target_user_id}:{temp_avatar_id}"
                redis_client.delete(redis_key)
            except:
                pass

        return {
            "message": "Avatar confirmed",
            "path": avatar.image_path,
            "avatar_id": avatar.id,
        }
    except Exception as e:
        logger.error(f"Failed to confirm avatar: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to confirm avatar: {str(e)}"
        )
