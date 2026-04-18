"""normalize legacy llm_choice_id 2 to seeded cloud id 1

Revision ID: c9d8e7f6a5b4
Revises: f1c2d3e4b5a6
Create Date: 2026-04-17

llm_choices is seeded with id 0 (local) and 1 (cloud). Older code inserted
users with llm_choice_id=2, which violates FK on fresh DBs and breaks register.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, None] = "f1c2d3e4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("llm_choices"):
        op.execute(
            sa.text(
                """
                UPDATE users SET llm_choice_id = 1
                WHERE llm_choice_id = 2
                  AND EXISTS (SELECT 1 FROM llm_choices WHERE id = 1)
                """
            )
        )
    if insp.has_table("summary_cache"):
        op.execute(
            sa.text(
                "UPDATE summary_cache SET llm_choice_id = 1 WHERE llm_choice_id = 2"
            )
        )


def downgrade() -> None:
    pass
