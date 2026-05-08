"""add composite indexes for hot paths
Revision ID: 7c3d9e1a2b4c
Revises: 4f9c2a7b1d10
Create Date: 2026-01-01 00:00:00.000000
"""

from typing import Sequence, Union

revision: str = "7c3d9e1a2b4c"
down_revision: Union[str, None] = "4f9c2a7b1d10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # indexes deferred, tables may not exist at this point in chain


def downgrade() -> None:
    pass
