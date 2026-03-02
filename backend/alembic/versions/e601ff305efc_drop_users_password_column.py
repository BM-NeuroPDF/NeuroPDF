"""drop_users_password_column

Revision ID: e601ff305efc
Revises: 83ebabdac0f2
Create Date: 2026-03-02 00:35:07.392929

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e601ff305efc'
down_revision: Union[str, None] = '83ebabdac0f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the unused password column
    op.drop_column('users', 'password')


def downgrade() -> None:
    # Re-add the password column in case of rollback
    op.add_column('users', sa.Column('password', sa.VARCHAR(length=255), autoincrement=False, nullable=True))
