import os
import logging
import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.engine import URL

# Supabase
from supabase import create_client, Client

# Ayarlar
from .config import settings 

logger = logging.getLogger(__name__)
Base = declarative_base()

# =================================================
# SUPABASE CLIENT (REST)
# =================================================
SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_KEY = settings.SUPABASE_KEY

def get_supabase() -> Client:
    """
    Supabase REST istemcisini döndürür. 
    SSL hatalarını aşmak için HTTP istemcisi özel olarak yapılandırılmıştır.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase client not configured. SUPABASE_URL / SUPABASE_KEY missing.")
    
    try:
        # ClientOptions karmaşasından kaçınmak için doğrudan httpx kullanıyoruz
        # SSL verification: Production'da açık, development'ta opsiyonel
        env = os.getenv("ENVIRONMENT", "development").lower()
        verify_ssl = env not in ["development", "dev", "local"]
        
        # Supabase client'ı oluştururken httpx istemcisini manuel enjekte ediyoruz
        return create_client(
            SUPABASE_URL, 
            SUPABASE_KEY,
            options={
                "http_client": httpx.Client(verify=verify_ssl),
            }
        )
    except Exception as e:
        # Eğer yukarıdaki yöntem de hata verirse (bazı sürümlerde dict kabul etmez), 
        # en yalın haliyle dene
        try:
            return create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as final_e:
            logger.error(f"Supabase bağlantı hatası: {final_e}")
            raise

# Global örnek
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = get_supabase()
    except Exception:
        pass

# =================================================
# SQLALCHEMY (Postgres)
# =================================================
# Eski Yöntem (Yorum satırı olarak korunuyor):
# def build_db_url() -> URL:
#     user = os.getenv("DB_USER")
#     password = os.getenv("DB_PASSWORD")
#     host = os.getenv("DB_HOST")
#     port = os.getenv("DB_PORT", "5432")
#     name = os.getenv("DB_NAME", "postgres")
#     ssl = os.getenv("DB_SSLMODE", "require")
#
#     return URL.create(
#         "postgresql+psycopg2",
#         username=user,
#         password=password,
#         host=host,
#         port=int(port),
#         database=name,
#         query={"sslmode": ssl},
#     )

def build_db_url() -> str:
    # Eğer DATABASE_URL tam olarak verilmişse onu kullan
    if settings.DATABASE_URL:
        # Pydantic-settings bazen tırnaklı karakterleri bozabilir, PostgreSQL için +psycopg2 ekle
        url = settings.DATABASE_URL
        if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg2://"):
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    # Yoksa bileşenlerden oluştur
    user = settings.DB_USER
    password = settings.DB_PASSWORD
    host = settings.DB_HOST
    port = settings.DB_PORT
    name = settings.DB_NAME
    ssl = settings.DB_SSLMODE

    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}?sslmode={ssl}"

try:
    engine = create_engine(
        build_db_url(),
        pool_pre_ping=True,  # Her kullanımdan önce bağlantıyı kontrol et
        pool_recycle=300,  # 5 dakikada bir bağlantıları yenile (Supabase için önerilen)
        pool_size=5,  # Minimum bağlantı sayısı
        max_overflow=10,  # Maksimum ekstra bağlantı sayısı
        connect_args={
            "connect_timeout": 30,  # Timeout'u 30 saniyeye çıkar
            "sslmode": "require",  # SSL zorunlu
            "keepalives": 1,  # TCP keepalive aktif
            "keepalives_idle": 30,  # 30 saniye idle sonra keepalive gönder
            "keepalives_interval": 10,  # Her 10 saniyede bir keepalive
            "keepalives_count": 5,  # Maksimum 5 keepalive denemesi
        },
        # Lazy loading: Bağlantıyı ilk kullanımda kur
        # Modül yüklenirken bağlantı kontrolü yapma
        echo=False,  # SQL sorgularını loglama (production'da False)
    )
    # Bağlantı kontrolünü kaldırdık - ilk kullanımda otomatik kurulacak
except Exception as e:
    logger.warning(f"Database engine creation warning: {repr(e)}")
    # Engine oluşturulamazsa bile devam et, bağlantı kullanıldığında tekrar denenecek
    engine = None

# Engine None olsa bile SessionLocal oluştur, kullanıldığında hata verecek
if engine:
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    # Fallback: Engine yoksa None döndürecek bir sessionmaker
    SessionLocal = None

def get_db():
    """
    Database session dependency. 
    Retry mekanizması ile bağlantı sorunlarını yönetir.
    Development ortamında DB bağlantısı başarısız olursa None döndürür.
    """
    env = os.getenv("ENVIRONMENT", "development").lower()
    is_development = env in ["development", "dev", "local"]
    
    if SessionLocal is None:
        if is_development:
            logger.warning("Database engine not initialized. Returning None for development.")
            yield None
            return
        raise RuntimeError("Database engine not initialized. Check database connection settings.")
    
    if engine is None:
        if is_development:
            logger.warning("Database engine not available. Returning None for development.")
            yield None
            return
        raise RuntimeError("Database engine not available. Check database connection settings.")
    
    # Bağlantıyı test et ve gerekirse yeniden dene
    max_retries = 2 if is_development else 3
    retry_delay = 1  # saniye
    db = None
    
    for attempt in range(max_retries):
        try:
            db = SessionLocal()
            # Bağlantıyı test et
            db.execute(text("SELECT 1"))
            break
        except Exception as e:
            if db:
                try:
                    db.close()
                except:
                    pass
            if attempt < max_retries - 1:
                logger.warning(f"Database connection attempt {attempt + 1} failed, retrying... Error: {repr(e)}")
                import time
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logger.error(f"Database connection failed after {max_retries} attempts: {repr(e)}")
                if is_development:
                    logger.warning("Development mode: Returning None instead of raising error.")
                    yield None
                    return
                raise RuntimeError(f"Unable to connect to database after {max_retries} attempts. Please check your database connection settings.")
    
    if db is None:
        if is_development:
            logger.warning("Failed to create database session. Returning None for development.")
            yield None
            return
        raise RuntimeError("Failed to create database session.")
    
    try:
        yield db
    except Exception as e:
        if db:
            db.rollback()
        logger.error(f"Database session error: {repr(e)}")
        raise
    finally:
        if db:
            db.close()