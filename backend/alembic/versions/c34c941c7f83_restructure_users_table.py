"""restructure_users_table

Revision ID: c34c941c7f83
Revises: a3b4c5d6e7f8
Create Date: 2026-03-01 13:57:09.591731

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c34c941c7f83"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 1. Yeni tabloları oluştur
    if not inspector.has_table("user_auth"):
        op.create_table(
            "user_auth",
            sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("provider", sa.String(50), nullable=False),
            sa.Column("provider_key", sa.String(255), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=True),
        )

    if not inspector.has_table("user_settings"):
        op.create_table(
            "user_settings",
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column(
                "eula_accepted", sa.Boolean(), server_default="false", nullable=False
            ),
            sa.Column("active_avatar_url", sa.String(), nullable=True),
        )

    # 2. Verileri Users'dan Taşı (Gelişmiş Veri Aktarımı)
    # COALESCE kullanarak veri kaybını engelliyoruz
    user_cols = {c["name"] for c in inspector.get_columns("users")}

    if {"id", "provider"}.issubset(user_cols):
        provider_key_expr = (
            "COALESCE(provider_user_id, email, id)"
            if "provider_user_id" in user_cols and "email" in user_cols
            else "id"
        )
        op.execute(f"""
            INSERT INTO user_auth (user_id, provider, provider_key)
            SELECT id, provider, {provider_key_expr}
            FROM users
            ON CONFLICT DO NOTHING
        """)

    if "id" in user_cols:
        eula_expr = "eula_accepted" if "eula_accepted" in user_cols else "false"
        avatar_expr = (
            "active_avatar_url" if "active_avatar_url" in user_cols else "NULL"
        )
        op.execute(f"""
            INSERT INTO user_settings (user_id, eula_accepted, active_avatar_url)
            SELECT id, {eula_expr}, {avatar_expr} FROM users
            ON CONFLICT (user_id) DO NOTHING
        """)

    # 3. Users tablosunu sadeleştir
    # Legacy Supabase notu:
    # Aşağıdaki kolonlar eski Supabase tabanlı kullanıcı modelinden geliyordu.
    # Tamamen kaybetmemek için isimleri burada yorum olarak korunuyor:
    # - provider
    # - provider_user_id
    # - email
    # - eula_accepted
    # - active_avatar_url
    #
    # Eski yaklaşım (örnek, bilinçli olarak yorumda):
    # # users tablosunda provider/provider_user_id/email alanları aktif tutuluyordu.
    # # user_auth ve user_settings ayrıştırması yoktu.
    with op.batch_alter_table("users") as batch_op:
        if "provider" in user_cols:
            batch_op.drop_column("provider")
        if "provider_user_id" in user_cols:
            batch_op.drop_column("provider_user_id")
        if "email" in user_cols:
            batch_op.drop_column("email")
        if "eula_accepted" in user_cols:
            batch_op.drop_column("eula_accepted")
        if "active_avatar_url" in user_cols:
            batch_op.drop_column("active_avatar_url")


def downgrade() -> None:
    # İhtiyaç durumunda geri alma kodları buraya eklenebilir
    pass
