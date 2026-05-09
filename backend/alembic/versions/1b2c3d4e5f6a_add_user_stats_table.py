"""add user_stats table

Revision ID: 1b2c3d4e5f6a
Revises: eca356e7a032
Create Date: 2026-05-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1b2c3d4e5f6a"
down_revision: Union[str, None] = "eca356e7a032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_stats",
        sa.Column("user_id", sa.String(), primary_key=True, nullable=False),
        sa.Column(
            "summary_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "tools_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_activity",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("user_stats")
