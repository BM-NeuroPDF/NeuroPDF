"""Chat-related files router facades."""

from ._legacy import (
    append_chat_turn,
    get_pdf_chat_session_messages,
    get_session_messages_ordered,
    history_for_ai_restore,
    list_pdf_chat_sessions,
    resume_pdf_chat_session,
    send_chat_message,
    send_general_chat_message,
    start_chat_from_text,
    start_chat_session,
    start_general_chat,
    translate_chat_message,
)

__all__ = [
    "append_chat_turn",
    "get_pdf_chat_session_messages",
    "get_session_messages_ordered",
    "history_for_ai_restore",
    "list_pdf_chat_sessions",
    "resume_pdf_chat_session",
    "send_chat_message",
    "send_general_chat_message",
    "start_chat_from_text",
    "start_chat_session",
    "start_general_chat",
    "translate_chat_message",
]
