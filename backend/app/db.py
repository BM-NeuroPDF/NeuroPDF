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
        # verify=False SSL sertifika kontrolünü atlar
        verify_ssl = False
        
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
def build_db_url() -> URL:
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    host = os.getenv("DB_HOST")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "postgres")
    ssl = os.getenv("DB_SSLMODE", "require")

    return URL.create(
        "postgresql+psycopg2",
        username=user,
        password=password,
        host=host,
        port=int(port),
        database=name,
        query={"sslmode": ssl},
    )

try:
    engine = create_engine(
        build_db_url(),
        pool_pre_ping=True,
        pool_recycle=180, 
        connect_args={"connect_timeout": 10},
        # Lazy loading: Bağlantıyı ilk kullanımda kur
        # Modül yüklenirken bağlantı kontrolü yapma
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
    if SessionLocal is None:
        raise RuntimeError("Database engine not initialized. Check database connection settings.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()