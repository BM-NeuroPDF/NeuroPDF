"""merge_final_heads

Revision ID: e0b4dd6cf5d3
Revises: c34c941c7f83, 2f1855113b50
Create Date: 2026-03-01 13:59:05.073448

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0b4dd6cf5d3'
down_revision: Union[str, None] = ('c34c941c7f83', '2f1855113b50')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
