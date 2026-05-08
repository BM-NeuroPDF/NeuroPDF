"""add user avatar table
Revision ID: 0dbd5915a0b1
Revises: e1abc1f14621
Create Date: 2025-12-28 17:27:05.174158
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0dbd5915a0b1"
down_revision: Union[str, None] = "e1abc1f14621"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guest_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("usage_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "user_avatars",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("image_path", sa.String(), nullable=False),
        sa.Column("is_ai_generated", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("users", sa.Column("active_avatar_url", sa.String(), nullable=True))
    op.drop_constraint("ux_provider_provider_user", "users", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "ux_provider_provider_user", "users", ["provider", "provider_user_id"]
    )
    op.drop_column("users", "active_avatar_url")
    op.drop_table("user_avatars")
    op.drop_table("guest_sessions")
