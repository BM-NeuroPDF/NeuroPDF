"""remove_legacy_password_from_users

Revision ID: e3ad18dfa5cb
Revises: e0b4dd6cf5d3
Create Date: 2026-03-02 00:29:10.600384

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3ad18dfa5cb'
down_revision: Union[str, None] = 'e0b4dd6cf5d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
