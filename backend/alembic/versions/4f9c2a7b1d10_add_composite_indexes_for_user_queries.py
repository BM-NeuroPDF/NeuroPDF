"""add composite indexes for hot user queries

Revision ID: 4f9c2a7b1d10
Revises: e0b4dd6cf5d3
Create Date: 2026-05-05 15:00:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "4f9c2a7b1d10"
down_revision = "e0b4dd6cf5d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # auth lookups: WHERE user_id ... ORDER BY id
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.user_auth') IS NOT NULL THEN
                CREATE INDEX IF NOT EXISTS ix_user_auth_user_id_id
                ON user_auth (user_id, id);
            END IF;
        END
        $$;
        """
    )

    # file listing: WHERE user_id ... ORDER BY created_at DESC
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.pdfs') IS NOT NULL THEN
                CREATE INDEX IF NOT EXISTS ix_pdfs_user_id_created_at
                ON pdfs (user_id, created_at DESC);
            END IF;
        END
        $$;
        """
    )

    # chat session listing: WHERE user_id ... ORDER BY updated_at DESC
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.pdf_chat_sessions') IS NOT NULL THEN
                CREATE INDEX IF NOT EXISTS ix_pdf_chat_sessions_user_id_updated_at
                ON pdf_chat_sessions (user_id, updated_at DESC);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_pdf_chat_sessions_user_id_updated_at;")
    op.execute("DROP INDEX IF EXISTS ix_pdfs_user_id_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_user_auth_user_id_id;")
