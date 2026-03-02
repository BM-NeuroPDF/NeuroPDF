"""remove_legacy_password_from_users

Revision ID: 83ebabdac0f2
Revises: e3ad18dfa5cb
Create Date: 2026-03-02 00:29:32.877462

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83ebabdac0f2'
down_revision: Union[str, None] = 'e3ad18dfa5cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
