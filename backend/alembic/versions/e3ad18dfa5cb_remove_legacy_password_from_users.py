"""remove_legacy_password_from_users
Revision ID: e3ad18dfa5cb
Revises: e0b4dd6cf5d3
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e3ad18dfa5cb"
down_revision: Union[str, None] = "e0b4dd6cf5d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("users")]
    if "password" in columns:
        op.drop_column("users", "password")


def downgrade() -> None:
    pass
