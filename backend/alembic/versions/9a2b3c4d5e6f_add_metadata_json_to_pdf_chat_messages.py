"""add_metadata_json_to_pdf_chat_messages

Revision ID: 9a2b3c4d5e6f
Revises: f4a5b6c7d8e9
Create Date: 2026-04-26 20:45:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9a2b3c4d5e6f"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pdf_chat_messages",
        sa.Column("metadata_json", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pdf_chat_messages", "metadata_json")
