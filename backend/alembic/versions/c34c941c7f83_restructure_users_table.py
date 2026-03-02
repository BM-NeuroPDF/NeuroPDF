"""restructure_users_table

Revision ID: c34c941c7f83
Revises: a3b4c5d6e7f8
Create Date: 2026-03-01 13:57:09.591731

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c34c941c7f83'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Yeni tabloları oluştur
    op.create_table('user_auth',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('provider_key', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=True)
    )
    
    op.create_table('user_settings',
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('eula_accepted', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('active_avatar_url', sa.String(), nullable=True)
    )

    # 2. Verileri Users'dan Taşı (Gelişmiş Veri Aktarımı)
    # COALESCE kullanarak veri kaybını engelliyoruz
    op.execute("""
        INSERT INTO user_auth (user_id, provider, provider_key) 
        SELECT 
            id, 
            provider, 
            COALESCE(provider_user_id, email, id) 
        FROM users
    """)
    
    op.execute("""
        INSERT INTO user_settings (user_id, eula_accepted, active_avatar_url) 
        SELECT id, eula_accepted, active_avatar_url FROM users
    """)

    # 3. Users tablosunu sadeleştir
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("provider")
        batch_op.drop_column("provider_user_id")
        batch_op.drop_column("email")
        batch_op.drop_column("eula_accepted")
        batch_op.drop_column("active_avatar_url")

def downgrade() -> None:
    # İhtiyaç durumunda geri alma kodları buraya eklenebilir
    pass