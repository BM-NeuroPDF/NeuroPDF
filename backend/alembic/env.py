from logging.config import fileConfig
from alembic import context
from sqlalchemy import pool, create_engine
from dotenv import load_dotenv
import os
import sys

# =========================
# PATH + ENV LOAD
# =========================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

load_dotenv(os.path.join(BASE_DIR, ".env"))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# =========================
# DB URL: same resolution as runtime (LOCAL_DATABASE_URL, DATABASE_URL, DB_*)
# =========================
from sqlalchemy.engine import make_url

from app.db import build_db_url

db_url_obj = make_url(build_db_url())
masked = db_url_obj.render_as_string(hide_password=True)
print(f"Alembic using DB URL: {masked}")

# Alembic configparser '%' sevmez → escape
config.set_main_option(
    "sqlalchemy.url",
    db_url_obj.render_as_string(hide_password=False).replace("%", "%%"),
)

# =========================
# METADATA
# =========================
from app.models import Base

target_metadata = Base.metadata


# =========================
# MIGRATIONS
# =========================
def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url").replace("%%", "%")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    # engine’i URL objesiyle kur
    connectable = create_engine(
        db_url_obj,
        poolclass=pool.NullPool,
        pool_pre_ping=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
