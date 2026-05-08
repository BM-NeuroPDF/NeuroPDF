"""drop users password column
Revision ID: e601ff305efc
Revises: 83ebabdac0f2
Create Date: 2026-01-01 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e601ff305efc"
down_revision: Union[str, None] = "83ebabdac0f2"
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
