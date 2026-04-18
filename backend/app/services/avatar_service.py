# app/services/avatar_service.py

import logging
import uuid
import io
import base64
import json
import os
import requests  # HTTP isteği için gerekli
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from PIL import Image, ImageDraw, ImageFont


def create_storage_path(user_id: str) -> str:
    return f"{user_id}/{uuid.uuid4().hex}.png"


# Google AI - Kaldırıldı, XAI kullanılacak
# import google.generativeai as genai

from app.db import get_supabase
from app.models import User, UserAvatar
from app.config import settings
from app.redis_client import redis_client

logger = logging.getLogger(__name__)

BUCKET_NAME = "avatars"
TEMP_AVATAR_TTL = 3600


def _local_avatar_root() -> Path:
    if (
        getattr(settings, "LOCAL_AVATAR_STORAGE_ROOT", "")
        and str(settings.LOCAL_AVATAR_STORAGE_ROOT).strip()
    ):
        return Path(settings.LOCAL_AVATAR_STORAGE_ROOT).expanduser().resolve()
    return (Path(__file__).resolve().parent.parent / "static" / "avatars").resolve()


def load_avatar_bytes_from_storage(image_path: str) -> bytes:
    """
    USE_SUPABASE=true: Supabase Storage bucket 'avatars'.
    USE_SUPABASE=false: files under LOCAL_AVATAR_STORAGE_ROOT or static/avatars.
    """
    if not image_path or ".." in image_path:
        raise HTTPException(status_code=400, detail="Invalid avatar path")

    if settings.USE_SUPABASE:
        supabase = get_supabase()
        avatar_data = supabase.storage.from_(BUCKET_NAME).download(image_path)
        if isinstance(avatar_data, dict):
            err = avatar_data.get("error") or avatar_data.get(
                "message", "Storage error"
            )
            raise HTTPException(status_code=404, detail=str(err))
        return avatar_data

    root = _local_avatar_root()
    root.mkdir(parents=True, exist_ok=True)
    dest = (root / image_path).resolve()
    try:
        dest.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid avatar path") from exc
    if not dest.is_file():
        raise FileNotFoundError(str(dest))
    return dest.read_bytes()


# ==========================================
# YARDIMCI FONKSİYONLAR
# ==========================================


def validate_image_response(content: bytes) -> tuple[bool, Optional[str]]:
    """
    Validates that response content is a valid image.
    Returns (is_valid, error_message)
    """
    if not content or len(content) < 100:
        return False, "Response too small or empty"

    # Magic bytes check
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        # PNG format - validate with PIL
        try:
            img = Image.open(io.BytesIO(content))
            img.verify()
            return True, None
        except Exception as e:
            return False, f"PIL validation failed for PNG: {str(e)}"
    elif content.startswith(b"\xff\xd8\xff"):
        # JPEG format - validate with PIL
        try:
            img = Image.open(io.BytesIO(content))
            img.verify()
            return True, None
        except Exception as e:
            return False, f"PIL validation failed for JPEG: {str(e)}"
    else:
        return False, f"Invalid image format (magic bytes: {content[:10].hex()})"


def parse_hf_error_response(response: requests.Response) -> dict:
    """Parse Hugging Face error response"""
    error_info = {
        "status_code": response.status_code,
        "headers": dict(response.headers),
        "body": None,
        "error_type": "unknown",
        "error_message": None,
    }

    try:
        content_type = response.headers.get("content-type", "")
        if content_type.startswith("application/json"):
            error_info["body"] = response.json()
            # Try to extract error information
            if isinstance(error_info["body"], dict):
                error_info["error_type"] = (
                    error_info["body"].get("error", {}).get("type", "unknown")
                    if isinstance(error_info["body"].get("error"), dict)
                    else str(error_info["body"].get("error", "unknown"))
                )
                error_info["error_message"] = (
                    error_info["body"].get("error", {}).get("message", None)
                    if isinstance(error_info["body"].get("error"), dict)
                    else str(error_info["body"].get("error", None))
                )
        else:
            error_info["body"] = response.text[:500]
            error_info["error_message"] = response.text[:200]
    except Exception as e:
        error_info["body"] = (
            response.text[:500]
            if hasattr(response, "text")
            else str(response.content[:500])
        )
        error_info["error_message"] = f"Failed to parse error response: {str(e)}"

    return error_info


# ==========================================
# 1. HUGGING FACE STABLE DIFFUSION (ÜCRETSİZ, YÜKSEK KALİTE)
# ==========================================
async def generate_image_huggingface(
    prompt: str, max_retries: int = 3
) -> Optional[bytes]:
    """
    Hugging Face Inference API kullanarak Stable Diffusion ile yüksek kaliteli resim üretir.
    Ücretsiz ve kaliteli sonuçlar verir.

    Improved with retry mechanism, exponential backoff, better error handling,
    response validation, and portrait-optimized models and prompts.
    """
    # Hugging Face model seçenekleri (profil fotoğrafı için optimize edilmiş)
    models = [
        "stabilityai/stable-diffusion-xl-base-1.0",  # En yüksek kalite
        "runwayml/stable-diffusion-v1-5",  # İyi kalite, hızlı
        "CompVis/stable-diffusion-v1-4",  # Fallback
    ]

    # API key opsiyonel ama rate limit için önerilir
    hf_token = getattr(settings, "HUGGINGFACE_API_KEY", None) or os.getenv(
        "HUGGINGFACE_API_KEY", ""
    )

    headers = {}
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"

    # Prompt'u iyileştir (profil fotoğrafı için optimize edilmiş)
    # Base prompt components for portrait/avatar
    base_prompt_parts = [
        "professional portrait",
        "headshot",
        "face focus",
        "centered composition",
        prompt,  # User's prompt
        "high quality",
        "detailed",
        "512x512",
        "square format",
    ]
    avatar_prompt = ", ".join(base_prompt_parts)

    for model in models:
        for attempt in range(max_retries):
            try:
                # Hugging Face yeni router endpoint'ini kullanıyor
                url = f"https://router.huggingface.co/models/{model}"

                # Negative prompt to avoid unwanted elements in portrait
                negative_prompt = "full body, multiple people, text, watermark, signature, low quality, blurry, distorted, deformed"

                payload = {
                    "inputs": avatar_prompt,
                    "parameters": {
                        "num_inference_steps": 30,
                        "guidance_scale": 7.5,
                        "width": 512,
                        "height": 512,
                        "negative_prompt": negative_prompt,  # Negative prompt for better portrait quality
                    },
                }

                logger.info(
                    f"Hugging Face ({model}) ile resim üretiliyor (attempt {attempt + 1}/{max_retries}): {prompt[:50]}..."
                )
                # Increased timeout for model loading scenarios
                response = requests.post(url, headers=headers, json=payload, timeout=90)

                # Check content-type header
                content_type = response.headers.get("content-type", "")

                if response.status_code == 200:
                    # Validate response is actually an image
                    is_valid, validation_error = validate_image_response(
                        response.content
                    )
                    if not is_valid:
                        logger.warning(
                            f"❌ Hugging Face ({model}) geçersiz resim döndürdü: {validation_error}"
                        )
                        if attempt < max_retries - 1:
                            wait_time = (attempt + 1) * 5
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            break  # Try next model

                    # Check content-type
                    if not content_type.startswith("image/"):
                        logger.warning(
                            f"⚠️ Hugging Face ({model}) beklenmeyen content-type döndürdü: {content_type}"
                        )

                    logger.info(
                        f"✅ Hugging Face ({model}) başarıyla resim üretti (size: {len(response.content)} bytes, type: {content_type})."
                    )
                    return response.content
                elif response.status_code == 503:
                    # Model loading - wait and retry with exponential backoff
                    wait_time = min(60, (attempt + 1) * 10)  # 10s, 20s, 30s (max 60s)
                    error_info = parse_hf_error_response(response)
                    logger.info(
                        f"⏳ Model {model} yükleniyor, {wait_time}s bekleniyor (attempt {attempt + 1}/{max_retries}). Error: {error_info.get('error_message', 'N/A')}"
                    )
                    await asyncio.sleep(wait_time)
                    continue  # Retry same model
                elif response.status_code == 429:
                    # Rate limit - check Retry-After header
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            wait_time = int(retry_after)
                            wait_time = min(300, wait_time)  # Max 5 minutes
                        except (ValueError, TypeError):
                            wait_time = min(
                                120, (2**attempt) * 5
                            )  # Fallback to exponential backoff
                    else:
                        wait_time = min(120, (2**attempt) * 5)  # Exponential backoff

                    error_info = parse_hf_error_response(response)
                    logger.warning(
                        f"⚠️ Rate limit hatası, {wait_time}s bekleniyor (Retry-After: {retry_after}, attempt {attempt + 1}/{max_retries}). Error: {error_info.get('error_message', 'N/A')}"
                    )
                    await asyncio.sleep(wait_time)
                    continue  # Retry same model
                elif response.status_code == 500:
                    # Server error - try next model
                    error_info = parse_hf_error_response(response)
                    logger.warning(
                        f"❌ Hugging Face Server Error ({response.status_code}) for {model}. Error type: {error_info.get('error_type')}, Message: {error_info.get('error_message', response.text[:200])}"
                    )
                    break  # Try next model
                else:
                    # Other errors - log detailed error info and try next model
                    error_info = parse_hf_error_response(response)
                    logger.warning(
                        f"❌ Hugging Face Error ({response.status_code}) for {model}. Error type: {error_info.get('error_type')}, Message: {error_info.get('error_message', response.text[:200])}"
                    )
                    # Log full error context for debugging
                    logger.debug(
                        f"Full error context: {json.dumps(error_info, indent=2, default=str)}"
                    )
                    break  # Try next model

            except requests.exceptions.Timeout:
                logger.warning(
                    f"⏱️ Hugging Face timeout ({model}, attempt {attempt + 1}/{max_retries})"
                )
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 5
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.warning(
                        f"❌ Hugging Face timeout after {max_retries} attempts for {model}, trying next model"
                    )
                    break  # Try next model
            except requests.exceptions.RequestException as e:
                logger.warning(
                    f"❌ Hugging Face Request Error ({model}, attempt {attempt + 1}/{max_retries}): {type(e).__name__}: {str(e)}"
                )
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 5
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.warning(
                        f"❌ Hugging Face Request Error after {max_retries} attempts for {model}, trying next model"
                    )
                    break  # Try next model
            except Exception as e:
                logger.error(
                    f"❌ Hugging Face API Hatası ({model}, attempt {attempt + 1}/{max_retries}): {type(e).__name__}: {str(e)}",
                    exc_info=True,
                )
                # Log full exception context
                import traceback

                logger.debug(f"Full traceback: {traceback.format_exc()}")
                break  # Try next model

    logger.warning(
        "❌ Tüm Hugging Face modelleri başarısız oldu. Avatar oluşturulamadı."
    )
    return None


# ==========================================
# 2. POLLINATIONS.AI (FALLBACK - ÜCRETSİZ RESİM ÜRETİMİ)
# ==========================================
async def generate_image_pollinations(prompt: str) -> Optional[bytes]:
    """
    Pollinations.ai kullanarak ücretsiz resim üretir.
    Prompt'u URL üzerinden gönderiyoruz.
    """
    import urllib.parse

    # Prompt'u URL güvenli formata çevir
    encoded_prompt = urllib.parse.quote(prompt)

    # Sabit seed ekleyerek tutarlılığı artırabiliriz veya tamamen rastgele bırakabiliriz
    import random

    seed = random.randint(1, 100000)

    # Pollinations URL formatı
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?seed={seed}&width=512&height=512&nologo=true"

    # SSRF Protection: Validate URL
    # Note: validate_api_url is defined below, but will be available at runtime
    # For now, we know this URL is safe as it's hardcoded to pollinations.ai

    try:
        # Prompt'u string'e çeviririz ki loglarken hata alınmasın
        safe_prompt = str(prompt)
        logger.info(f"Pollinations.ai'dan resim isteniyor: {safe_prompt[:50]}...")
        # timeout ekleyelim, ücretsiz API bazen yavaş olabilir
        response = requests.get(url, timeout=45)

        if response.status_code == 200:
            return response.content
        else:
            logger.error(
                f"Pollinations Error ({response.status_code}): {response.text}"
            )
            return None

    except Exception as e:
        logger.error(f"Pollinations API Hatası: {e}")
        return None


# ==========================================
# 2. xAI (GROK) VISION (RESİM ANALİZİ)
# ==========================================
# SSRF Protection: Allowed API domains
ALLOWED_API_DOMAINS = [
    "api.x.ai",
    "generativelanguage.googleapis.com",  # Gemini
    "api.pollinations.ai",
    "api-inference.huggingface.co",  # Hugging Face Inference API
]


def validate_api_url(url: str) -> bool:
    """Validate that URL is from an allowed domain (SSRF protection)"""
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
        return parsed.netloc in ALLOWED_API_DOMAINS
    except Exception:
        return False


async def analyze_and_rewrite_prompt(image_bytes: bytes, user_prompt: str) -> str:
    """
    xAI (Grok Vision) kullanarak resmi analiz eder ve değişiklikle birlikte yeni prompt üretir.
    """
    if not settings.XAI_API_KEY:
        logger.warning("XAI_API_KEY eksik, orijinal prompt döndürülüyor.")
        return user_prompt

    try:
        # Resmi Base64 formatına çevir
        base64_image = base64.b64encode(image_bytes).decode("utf-8")

        url = "https://api.x.ai/v1/chat/completions"

        # SSRF Protection: Validate URL
        if not validate_api_url(url):
            logger.error(
                f"SSRF Protection: Blocked request to unauthorized domain: {url}"
            )
            return user_prompt
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.XAI_API_KEY}",
        }

        prompt_instruction = (
            f"Bu resme bak ve kullanıcının şu isteğini uygula: '{user_prompt}'. "
            "Görevin: Bu resmin GÖRSEL STİLİNİ KORUYARAK kullanıcının istediği değişikliği "
            "içeren YENİ bir resim çizdirmek için bir AI resim üretecine (örn. Midjourney) verilecek "
            "çok detaylı İngilizce bir prompt yazmak. "
            "SADECE PROMPT'U YAZ, başka hiçbir açıklama yapma."
        )

        payload = {
            "model": "grok-vision-beta",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_instruction},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                                "detail": "high",
                            },
                        },
                    ],
                }
            ],
            "temperature": 0.7,
        }

        response = requests.post(url, headers=headers, json=payload, timeout=30)

        if response.status_code == 200:
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        else:
            logger.error(f"xAI Vision Hatası: {response.text}")
            return user_prompt

    except Exception as e:
        logger.error(f"xAI Vision Analiz Hatası: {e}")
        return user_prompt


async def improve_text_prompt(user_prompt: str) -> str:
    """
    xAI (Grok) ile metin promptunu geliştirir.
    """
    if not settings.XAI_API_KEY:
        logger.warning("XAI_API_KEY eksik, orijinal prompt döndürülüyor.")
        return user_prompt

    try:
        url = "https://api.x.ai/v1/chat/completions"

        # SSRF Protection: Validate URL
        if not validate_api_url(url):
            logger.error(
                f"SSRF Protection: Blocked request to unauthorized domain: {url}"
            )
            return user_prompt

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.XAI_API_KEY}",
        }

        prompt_instruction = (
            f"Convert this user request into a high-quality, highly detailed, "
            f"masterpiece English image generation prompt for an AI image generator: '{user_prompt}'. "
            f"DO NOT add any conversational text. Output ONLY the raw prompt itself."
        )

        payload = {
            "model": "grok-beta",
            "messages": [{"role": "user", "content": prompt_instruction}],
            "temperature": 0.7,
        }

        response = requests.post(url, headers=headers, json=payload, timeout=15)

        if response.status_code == 200:
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        else:
            logger.error(f"xAI Text Hatası: {response.text}")
            return user_prompt

    except Exception as e:
        logger.error(f"xAI Text İyileştirme Hatası: {e}")
        return user_prompt


# ==========================================
# ANA SERVİS FONKSİYONLARI
# ==========================================


async def generate_avatar_with_prompt(
    username: str, prompt: str, use_pollinations_fallback: bool = True
) -> bytes:
    """
    Avatar oluşturma ana fonksiyonu.
    Hugging Face birincil yöntemdir, Pollinations fallback olarak kullanılır.

    Args:
        username: Kullanıcı adı (fallback için)
        prompt: Avatar oluşturma prompt'u
        use_pollinations_fallback: Pollinations fallback kullanılsın mı? (default: True - Hugging Face endpoint sorunları nedeniyle geçici olarak açık)
    """
    # 1. Prompt'u iyileştir (xAI varsa)
    improved_prompt = await improve_text_prompt(prompt)

    # 2. Hugging Face Stable Diffusion ile üret (birincil yöntem, retry mekanizması ile)
    logger.info("🎨 Hugging Face ile avatar üretiliyor (birincil yöntem)...")
    image_bytes = await generate_image_huggingface(improved_prompt, max_retries=3)

    if image_bytes:
        logger.info("✅ Hugging Face ile resim başarıyla üretildi.")
        return image_bytes

    # 3. Hugging Face başarısız olursa, sadece açıkça izin verilirse Pollinations.ai'yi dene
    if use_pollinations_fallback:
        logger.info("⚠️ Hugging Face başarısız, Pollinations.ai deneniyor (fallback)...")
        image_bytes = await generate_image_pollinations(improved_prompt)

        if image_bytes:
            logger.info("✅ Pollinations.ai ile resim başarıyla üretildi.")
            return image_bytes
    else:
        logger.info("⚠️ Hugging Face başarısız, Pollinations fallback devre dışı.")

    # 4. Tüm AI servisleri başarısız olursa Fallback (Harf Avatarı)
    logger.warning("❌ Tüm AI servisleri başarısız, harf avatarı kullanılıyor.")
    return generate_avatar_from_name(username, bg_color=(50, 50, 50))


async def edit_avatar_with_prompt(
    image_bytes: bytes, prompt: str, use_pollinations_fallback: bool = False
) -> bytes:
    """
    Mevcut avatarı prompt ile düzenler.
    Hugging Face birincil yöntemdir, Pollinations sadece açıkça izin verilirse kullanılır.

    Args:
        image_bytes: Mevcut avatar resmi
        prompt: Düzenleme prompt'u
        use_pollinations_fallback: Pollinations fallback kullanılsın mı? (default: False)
    """
    # 1. Yeni Prompt Oluştur
    new_prompt = await analyze_and_rewrite_prompt(image_bytes, prompt)

    # 2. Hugging Face ile üret (birincil yöntem, retry mekanizması ile)
    logger.info("🎨 Hugging Face ile avatar düzenleniyor (birincil yöntem)...")
    edited_bytes = await generate_image_huggingface(new_prompt, max_retries=3)

    if edited_bytes:
        logger.info("✅ Hugging Face ile avatar başarıyla düzenlendi.")
        return edited_bytes

    # 3. Hugging Face başarısız olursa, sadece açıkça izin verilirse Pollinations'ı dene
    if use_pollinations_fallback:
        logger.info("⚠️ Hugging Face başarısız, Pollinations.ai deneniyor (fallback)...")
        edited_bytes = await generate_image_pollinations(new_prompt)

        if edited_bytes:
            logger.info("✅ Pollinations.ai ile avatar başarıyla düzenlendi.")
            return edited_bytes
    else:
        logger.info("⚠️ Hugging Face başarısız, Pollinations fallback devre dışı.")

    # 4. Tüm AI servisleri başarısız olursa orijinal resmi döndür
    logger.warning("❌ Tüm AI servisleri başarısız, orijinal avatar döndürülüyor.")
    return image_bytes


# ==========================================
# YARDIMCI FONKSİYONLAR (DEĞİŞMEDİ)
# ==========================================


def generate_avatar_from_name(
    name: str, size: int = 512, bg_color=None, text_color=None, style="default"
) -> bytes:
    name = name.strip() if name else "U"
    initials = name[:2].upper()

    if bg_color is None:
        color_seed = hash(name) % 360
        import colorsys

        rgb = colorsys.hsv_to_rgb(color_seed / 360, 0.7, 0.9)
        bg_color = tuple(int(c * 255) for c in rgb)

    if text_color is None:
        text_color = (255, 255, 255) if sum(bg_color) < 400 else (0, 0, 0)

    img = Image.new("RGB", (size, size), bg_color)
    draw = ImageDraw.Draw(img)

    try:
        font_size = int(size * 0.4)
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()

    draw.text((size / 2, size / 2), initials, fill=text_color, font=font, anchor="mm")

    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)
    return img_bytes.read()


def save_temp_avatar(user_id: str, avatar_bytes: bytes, prompt: str) -> str:
    temp_avatar_id = str(uuid.uuid4())
    if redis_client:
        try:
            avatar_base64 = base64.b64encode(avatar_bytes).decode("utf-8")
            data = {
                "avatar_bytes_base64": avatar_base64,
                "prompt": prompt,
                "created_at": datetime.utcnow().isoformat(),
            }
            redis_key = f"temp_avatar:{user_id}:{temp_avatar_id}"
            redis_client.setex(redis_key, TEMP_AVATAR_TTL, json.dumps(data))
            return temp_avatar_id
        except Exception as e:
            logger.error(f"Redis error: {e}")
    return temp_avatar_id


def get_temp_avatar(user_id: str, temp_avatar_id: str) -> Optional[bytes]:
    if not redis_client:
        return None
    try:
        data_str = redis_client.get(f"temp_avatar:{user_id}:{temp_avatar_id}")
        if not data_str:
            return None
        data = json.loads(data_str)
        return base64.b64decode(data.get("avatar_bytes_base64"))
    except:
        return None


def create_initial_avatar_for_user(
    db: Session, user_id: str, username: Optional[str] = None
) -> UserAvatar:
    # (Bu fonksiyon aynı kalabilir, sadece import hatası olmasın diye buraya koydum)
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404)
        if not username:
            username = user.username or user.email or "User"
        avatar_bytes = generate_avatar_from_name(username)
        storage_path = create_storage_path(user_id)
        upload_avatar_png_to_storage(storage_path, avatar_bytes)
        avatar = save_avatar_record_and_set_active(
            db, user_id, storage_path, is_ai=True
        )
        return avatar
    except:
        return None


def upload_avatar_png_to_storage(storage_path: str, file_bytes: bytes):
    if not storage_path or ".." in storage_path:
        raise HTTPException(status_code=400, detail="Invalid storage path")

    if settings.USE_SUPABASE:
        supabase = get_supabase()
        res = supabase.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        if isinstance(res, dict) and res.get("error"):
            raise HTTPException(
                status_code=500, detail=f"Storage error: {res['error']}"
            )
        return res

    root = _local_avatar_root()
    root.mkdir(parents=True, exist_ok=True)
    dest = (root / storage_path).resolve()
    try:
        dest.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid storage path") from exc
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(file_bytes)
    return {"path": storage_path}


def save_avatar_record_and_set_active(
    db: Session, user_id: str, image_path: str, is_ai: bool = False
) -> UserAvatar:
    from app.models import UserSettings

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404)
    avatar = UserAvatar(user_id=user_id, image_path=image_path, is_ai_generated=is_ai)
    db.add(avatar)
    # active_avatar_url UserSettings tablosunda
    if not user.settings:
        user.settings = UserSettings(user_id=user_id, eula_accepted=False)
    user.settings.active_avatar_url = image_path
    db.commit()
    db.refresh(avatar)
    return avatar


def get_latest_avatar(db: Session, user_id: str) -> Optional[UserAvatar]:
    return (
        db.query(UserAvatar)
        .filter(UserAvatar.user_id == user_id)
        .order_by(desc(UserAvatar.created_at))
        .first()
    )


# Gerekli olmayan eski importlar için boş fonksiyonlar (import hatası almamak için)
async def improve_prompt_with_gemini(p, u):
    return p


async def extract_colors_from_prompt(p, u):
    return {}
