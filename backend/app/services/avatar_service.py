# app/services/avatar_service.py

import logging
import uuid
import io
import base64
import json
import os
import requests  # HTTP isteği için gerekli
from datetime import datetime
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

# ==========================================
# 1. HUGGING FACE STABLE DIFFUSION (ÜCRETSİZ, YÜKSEK KALİTE)
# ==========================================
async def generate_image_huggingface(prompt: str) -> Optional[bytes]:
    """
    Hugging Face Inference API kullanarak Stable Diffusion ile yüksek kaliteli resim üretir.
    Ücretsiz ve kaliteli sonuçlar verir.
    """
    # Hugging Face model seçenekleri (en iyi kalite için SDXL)
    models = [
        "stabilityai/stable-diffusion-xl-base-1.0",  # En yüksek kalite
        "runwayml/stable-diffusion-v1-5",  # Fallback
        "CompVis/stable-diffusion-v1-4",  # Fallback 2
    ]
    
    # API key opsiyonel ama rate limit için önerilir
    hf_token = getattr(settings, 'HUGGINGFACE_API_KEY', None) or os.getenv("HUGGINGFACE_API_KEY", "")
    
    headers = {}
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"
    
    # Prompt'u iyileştir (avatar için optimize edilmiş)
    avatar_prompt = f"professional portrait avatar, {prompt}, high quality, detailed, 512x512, square format"
    
    for model in models:
        try:
            url = f"https://api-inference.huggingface.co/models/{model}"
            
            payload = {
                "inputs": avatar_prompt,
                "parameters": {
                    "num_inference_steps": 30,
                    "guidance_scale": 7.5,
                    "width": 512,
                    "height": 512,
                }
            }
            
            logger.info(f"Hugging Face ({model}) ile resim üretiliyor: {prompt[:50]}...")
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            
            if response.status_code == 200:
                # Image bytes döner
                return response.content
            elif response.status_code == 503:
                # Model yükleniyor, bir sonraki modeli dene
                logger.warning(f"Model {model} yükleniyor, bir sonraki model deneniyor...")
                continue
            else:
                logger.warning(f"Hugging Face Error ({response.status_code}): {response.text[:200]}")
                continue
                
        except Exception as e:
            logger.warning(f"Hugging Face API Hatası ({model}): {e}")
            continue
    
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
            logger.error(f"Pollinations Error ({response.status_code}): {response.text}")
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
    "api-inference.huggingface.co"  # Hugging Face Inference API
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
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        
        url = "https://api.x.ai/v1/chat/completions"
        
        # SSRF Protection: Validate URL
        if not validate_api_url(url):
            logger.error(f"SSRF Protection: Blocked request to unauthorized domain: {url}")
            return user_prompt
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.XAI_API_KEY}"
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
                        {
                            "type": "text",
                            "text": prompt_instruction
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.7
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
            logger.error(f"SSRF Protection: Blocked request to unauthorized domain: {url}")
            return user_prompt
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.XAI_API_KEY}"
        }
        
        prompt_instruction = (
            f"Convert this user request into a high-quality, highly detailed, "
            f"masterpiece English image generation prompt for an AI image generator: '{user_prompt}'. "
            f"DO NOT add any conversational text. Output ONLY the raw prompt itself."
        )
        
        payload = {
            "model": "grok-beta",
            "messages": [
                {"role": "user", "content": prompt_instruction}
            ],
            "temperature": 0.7
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

async def generate_avatar_with_prompt(username: str, prompt: str) -> bytes:
    # 1. Prompt'u iyileştir (xAI varsa)
    improved_prompt = await improve_text_prompt(prompt)
    
    # 2. Önce Hugging Face Stable Diffusion ile üret (en yüksek kalite)
    image_bytes = await generate_image_huggingface(improved_prompt)
    
    if image_bytes:
        logger.info("Hugging Face ile resim başarıyla üretildi.")
        return image_bytes
    
    # 3. Hugging Face başarısız olursa Pollinations.ai'yi dene (fallback)
    logger.info("Hugging Face başarısız, Pollinations.ai deneniyor...")
    image_bytes = await generate_image_pollinations(improved_prompt)
    
    if image_bytes:
        logger.info("Pollinations.ai ile resim başarıyla üretildi.")
        return image_bytes
    
    # 4. Her ikisi de başarısız olursa Fallback (Harf Avatarı)
    logger.warning("Tüm AI servisleri başarısız, harf avatarı kullanılıyor.")
    return generate_avatar_from_name(username, bg_color=(50, 50, 50))

async def edit_avatar_with_prompt(image_bytes: bytes, prompt: str) -> bytes:
    # 1. Yeni Prompt Oluştur
    new_prompt = await analyze_and_rewrite_prompt(image_bytes, prompt)
    
    # 2. Önce Hugging Face ile üret
    edited_bytes = await generate_image_huggingface(new_prompt)
    
    if edited_bytes:
        return edited_bytes
    
    # 3. Hugging Face başarısız olursa Pollinations'ı dene
    edited_bytes = await generate_image_pollinations(new_prompt)
    
    if edited_bytes:
        return edited_bytes
        
    return image_bytes

# ==========================================
# YARDIMCI FONKSİYONLAR (DEĞİŞMEDİ)
# ==========================================

def generate_avatar_from_name(name: str, size: int = 512, bg_color=None, text_color=None, style="default") -> bytes:
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
    
    draw.text((size/2, size/2), initials, fill=text_color, font=font, anchor="mm")
    
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)
    return img_bytes.read()

def save_temp_avatar(user_id: str, avatar_bytes: bytes, prompt: str) -> str:
    temp_avatar_id = str(uuid.uuid4())
    if redis_client:
        try:
            avatar_base64 = base64.b64encode(avatar_bytes).decode('utf-8')
            data = {"avatar_bytes_base64": avatar_base64, "prompt": prompt, "created_at": datetime.utcnow().isoformat()}
            redis_key = f"temp_avatar:{user_id}:{temp_avatar_id}"
            redis_client.setex(redis_key, TEMP_AVATAR_TTL, json.dumps(data))
            return temp_avatar_id
        except Exception as e:
            logger.error(f"Redis error: {e}")
    return temp_avatar_id

def get_temp_avatar(user_id: str, temp_avatar_id: str) -> Optional[bytes]:
    if not redis_client: return None
    try:
        data_str = redis_client.get(f"temp_avatar:{user_id}:{temp_avatar_id}")
        if not data_str: return None
        data = json.loads(data_str)
        return base64.b64decode(data.get("avatar_bytes_base64"))
    except: return None

def create_initial_avatar_for_user(db: Session, user_id: str, username: Optional[str] = None) -> UserAvatar:
    # (Bu fonksiyon aynı kalabilir, sadece import hatası olmasın diye buraya koydum)
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user: raise HTTPException(status_code=404)
        if not username: username = user.username or user.email or "User"
        avatar_bytes = generate_avatar_from_name(username)
        storage_path = create_storage_path(user_id)
        upload_avatar_png_to_storage(storage_path, avatar_bytes)
        avatar = save_avatar_record_and_set_active(db, user_id, storage_path, is_ai=True)
        return avatar
    except:
        return None

def upload_avatar_png_to_storage(storage_path: str, file_bytes: bytes):
    supabase = get_supabase()
    res = supabase.storage.from_(BUCKET_NAME).upload(path=storage_path, file=file_bytes, file_options={"content-type": "image/png", "upsert": "true"})
    if isinstance(res, dict) and res.get("error"): raise HTTPException(status_code=500, detail=f"Storage error: {res['error']}")
    return res

def save_avatar_record_and_set_active(db: Session, user_id: str, image_path: str, is_ai: bool = False) -> UserAvatar:
    from app.models import UserSettings
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=404)
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
    return db.query(UserAvatar).filter(UserAvatar.user_id == user_id).order_by(desc(UserAvatar.created_at)).first()

# Gerekli olmayan eski importlar için boş fonksiyonlar (import hatası almamak için)
async def improve_prompt_with_gemini(p, u): return p
async def extract_colors_from_prompt(p, u): return {}
