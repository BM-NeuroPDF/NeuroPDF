"""Kalıcı PDF sohbet oturumu ve mesaj kayıtları."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from .models import PdfChatMessage, PdfChatSession

logger = logging.getLogger(__name__)

# start-from-text için context snapshot üst sınırı
CONTEXT_TEXT_MAX_CHARS = 200_000


def truncate_context_text(text: str | None) -> str | None:
    if text is None:
        return None
    if len(text) <= CONTEXT_TEXT_MAX_CHARS:
        return text
    return text[:CONTEXT_TEXT_MAX_CHARS]


def create_pdf_chat_session_record(
    db: Session,
    *,
    user_id: str,
    ai_session_id: str,
    filename: str,
    llm_provider: str,
    mode: str,
    pdf_id: Optional[str] = None,
    context_text: Optional[str] = None,
) -> PdfChatSession:
    row = PdfChatSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        ai_session_id=ai_session_id,
        pdf_id=pdf_id,
        filename=filename or "document.pdf",
        llm_provider=llm_provider,
        mode=mode,
        context_text=truncate_context_text(context_text) if not pdf_id else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_chat_session_by_db_id(
    db: Session, session_db_id: str, user_id: str
) -> Optional[PdfChatSession]:
    return (
        db.query(PdfChatSession)
        .filter(PdfChatSession.id == session_db_id, PdfChatSession.user_id == user_id)
        .first()
    )


def get_chat_session_by_ai_id(
    db: Session, ai_session_id: str, user_id: str
) -> Optional[PdfChatSession]:
    return (
        db.query(PdfChatSession)
        .filter(
            PdfChatSession.ai_session_id == ai_session_id,
            PdfChatSession.user_id == user_id,
        )
        .first()
    )


def append_chat_turn(
    db: Session,
    *,
    ai_session_id: str,
    user_id: str,
    user_message: str,
    assistant_message: str,
) -> None:
    session = get_chat_session_by_ai_id(db, ai_session_id, user_id)
    if not session:
        logger.debug("No pdf_chat_session for ai_session_id=%s user=%s", ai_session_id, user_id)
        return
    db.add(
        PdfChatMessage(session_id=session.id, role="user", content=user_message)
    )
    db.add(
        PdfChatMessage(
            session_id=session.id, role="assistant", content=assistant_message
        )
    )
    session.updated_at = datetime.now(timezone.utc)
    db.commit()


def list_user_chat_sessions(db: Session, user_id: str) -> list[PdfChatSession]:
    return (
        db.query(PdfChatSession)
        .filter(PdfChatSession.user_id == user_id)
        .order_by(PdfChatSession.updated_at.desc())
        .all()
    )


def get_session_messages_ordered(
    db: Session, session_db_id: str, user_id: str
) -> list[PdfChatMessage]:
    session = get_chat_session_by_db_id(db, session_db_id, user_id)
    if not session:
        return []
    return (
        db.query(PdfChatMessage)
        .filter(PdfChatMessage.session_id == session.id)
        .order_by(PdfChatMessage.created_at.asc(), PdfChatMessage.id.asc())
        .all()
    )


def history_for_ai_restore(messages: list[PdfChatMessage]) -> list[dict]:
    """AI servis restore endpoint'i için {role, content} listesi."""
    out: list[dict] = []
    for m in messages:
        if m.role not in ("user", "assistant"):
            continue
        out.append({"role": m.role, "content": m.content})
    return out
