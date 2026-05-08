"""merge conflicting migrations

Revision ID: eca356e7a032
Revises: a1b2c3d4e5f6, c1a2b3d4e5f6
Create Date: 2026-05-08 13:03:08.300252

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "eca356e7a032"
down_revision: Union[str, None] = ("a1b2c3d4e5f6", "c1a2b3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
