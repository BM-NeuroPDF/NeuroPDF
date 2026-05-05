"""add composite indexes for hot query paths

Revision ID: 7c3d9e1a2b4c
Revises: 4f9c2a7b1d10
Create Date: 2026-05-05 21:05:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "7c3d9e1a2b4c"
down_revision = "4f9c2a7b1d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction.
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pdf_chat_messages_session_id_created_at ON pdf_chat_messages (session_id, created_at);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_summary_cache_pdf_hash_llm_choice_id ON summary_cache (pdf_hash, llm_choice_id);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_auth_provider_provider_key ON user_auth (provider, provider_key);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_auth_user_id_id ON user_auth (user_id, id);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pdfs_user_id_created_at ON pdfs (user_id, created_at DESC);"
        )
        # Redundant single-column indexes are removed because left-most prefixes
        # of the new composite indexes cover the same lookup paths.
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_pdf_chat_messages_session_id;"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_summary_cache_pdf_hash;"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_pdfs_user_id;"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_pdfs_user_id_created_at;"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_user_auth_user_id_id;"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_user_auth_provider_provider_key;"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_summary_cache_pdf_hash_llm_choice_id;"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_pdf_chat_messages_session_id_created_at;"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pdf_chat_messages_session_id ON pdf_chat_messages (session_id);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_summary_cache_pdf_hash ON summary_cache (pdf_hash);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pdfs_user_id ON pdfs (user_id);"
        )
