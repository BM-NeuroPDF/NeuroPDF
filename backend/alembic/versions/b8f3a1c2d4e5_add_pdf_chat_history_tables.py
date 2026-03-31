"""add pdf chat history tables

Revision ID: b8f3a1c2d4e5
Revises: 566010ef5fe6
Create Date: 2026-03-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8f3a1c2d4e5"
down_revision: Union[str, None] = "566010ef5fe6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pdf_chat_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("ai_session_id", sa.String(length=64), nullable=False),
        sa.Column("pdf_id", sa.String(), nullable=True),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("llm_provider", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("context_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["pdf_id"], ["pdfs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pdf_chat_sessions_user_id", "pdf_chat_sessions", ["user_id"], unique=False
    )
    op.create_index(
        "ix_pdf_chat_sessions_ai_session_id",
        "pdf_chat_sessions",
        ["ai_session_id"],
        unique=True,
    )
    op.create_index(
        "ix_pdf_chat_sessions_pdf_id", "pdf_chat_sessions", ["pdf_id"], unique=False
    )
    op.create_index(
        "ix_pdf_chat_sessions_user_updated",
        "pdf_chat_sessions",
        ["user_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "pdf_chat_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["pdf_chat_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pdf_chat_messages_session_id",
        "pdf_chat_messages",
        ["session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_pdf_chat_messages_session_id", table_name="pdf_chat_messages")
    op.drop_table("pdf_chat_messages")
    op.drop_index("ix_pdf_chat_sessions_user_updated", table_name="pdf_chat_sessions")
    op.drop_index("ix_pdf_chat_sessions_pdf_id", table_name="pdf_chat_sessions")
    op.drop_index("ix_pdf_chat_sessions_ai_session_id", table_name="pdf_chat_sessions")
    op.drop_index("ix_pdf_chat_sessions_user_id", table_name="pdf_chat_sessions")
    op.drop_table("pdf_chat_sessions")
