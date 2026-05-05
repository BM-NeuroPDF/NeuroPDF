import uuid
from datetime import datetime
from sqlalchemy import (
    String,
    Integer,
    DateTime,
    ForeignKey,
    Boolean,
    func,
    LargeBinary,
    Text,
    Index,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base
from pydantic import BaseModel


# ==========================================
# 1. LLM CHOICE TABLOSU (KVKK için)
# ==========================================
class LLMChoice(Base):
    __tablename__ = "llm_choices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    # İlişki: Bu LLM choice'u kullanan kullanıcılar
    users = relationship("User", back_populates="llm_choice")


# ==========================================
# 2. USER ROLE TABLOSU
# ==========================================
class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    # İlişki: Bu role sahip kullanıcılar
    users = relationship("User", back_populates="role")


# ==========================================
# 3. KULLANICI TABLOSU
# ==========================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)

    # LLM Choice Foreign Key (KVKK için: 0=local llm, 1=cloud llm)
    llm_choice_id: Mapped[int] = mapped_column(
        ForeignKey("llm_choices.id", ondelete="RESTRICT"),
        nullable=False,
        default=0,  # Default: local llm
    )

    # User Role Foreign Key (0=default user, 1=pro user, 2=admin)
    role_id: Mapped[int] = mapped_column(
        ForeignKey("user_roles.id", ondelete="RESTRICT"),
        nullable=False,
        default=0,  # Default: default user
    )

    is_email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    # Relationships
    llm_choice = relationship("LLMChoice", back_populates="users")
    role = relationship("UserRole", back_populates="users")

    # Yeni tablolarla ilişkiler
    auth_records = relationship(
        "UserAuth", back_populates="user", cascade="all, delete-orphan"
    )
    settings = relationship(
        "UserSettings",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    avatars = relationship(
        "UserAvatar", back_populates="user", cascade="all, delete-orphan"
    )
    stats = relationship(
        "UserStats",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    pdfs = relationship("PDF", back_populates="user", cascade="all, delete-orphan")
    pdf_chat_sessions = relationship(
        "PdfChatSession", back_populates="user", cascade="all, delete-orphan"
    )


# ==========================================
# 3A. USER AUTH TABLOSU
# ==========================================
class UserAuth(Base):
    __tablename__ = "user_auth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_key: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="auth_records")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_jti: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User")


# ==========================================
# 3B. USER SETTINGS TABLOSU
# ==========================================
class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    eula_accepted: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    active_avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)

    user = relationship("User", back_populates="settings")


# ==========================================
# 4. KULLANICI İSTATİSTİKLERİ TABLOSU
# ==========================================
class UserStats(Base):
    __tablename__ = "user_stats"

    # users.id (varchar) ile birebir
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    summary_count: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False
    )
    tools_count: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="stats")


# ==========================================
# 5. USER STATS RESPONSE (API)
# ==========================================
class UserStatsResponse(BaseModel):
    summary_count: int
    tools_count: int
    role: str = "Standart"


# ==========================================
# 6. MİSAFİR (GUEST) OTURUM TABLOSU
# ==========================================
class GuestSession(Base):
    __tablename__ = "guest_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


# ==========================================
# 7. USER AVATAR TABLOSU
# ==========================================
class UserAvatar(Base):
    __tablename__ = "user_avatars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Dosya yolu: static/profiles/{userId}/{userId}_profilepicture_{timestamp}.png
    image_path: Mapped[str] = mapped_column(String, nullable=False)

    # Fotoğrafın kaynağı
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user = relationship("User", back_populates="avatars")


# ==========================================
# 8. PDF TABLOSU (DB'de saklanacak)
# ==========================================
class PDF(Base):
    __tablename__ = "pdfs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True
    )  # UUID string olarak saklanacak
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # PDF dosyası binary olarak saklanacak
    pdf_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # Metadata (opsiyonel)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # bytes cinsinden

    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="pdfs")
    chat_sessions = relationship("PdfChatSession", back_populates="pdf")


# ==========================================
# 8B. PDF CHAT SESSION (kalıcı sohbet geçmişi)
# ==========================================
class PdfChatSession(Base):
    __tablename__ = "pdf_chat_sessions"
    __table_args__ = (
        Index("ix_pdf_chat_sessions_user_updated", "user_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ai_session_id: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    pdf_id: Mapped[str | None] = mapped_column(
        ForeignKey("pdfs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(
        String(512), nullable=False, default="document.pdf"
    )
    llm_provider: Mapped[str] = mapped_column(
        String(32), nullable=False, default="local"
    )
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="flash")
    # pdf_id yokken start-from-text metninin snapshot'ı (restore için)
    context_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="pdf_chat_sessions")
    pdf = relationship("PDF", back_populates="chat_sessions")
    messages = relationship(
        "PdfChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="PdfChatMessage.created_at",
    )


class PdfChatMessage(Base):
    __tablename__ = "pdf_chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("pdf_chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session = relationship("PdfChatSession", back_populates="messages")


# ==========================================
# 9. SUMMARY CACHE TABLOSU
# ==========================================
class SummaryCache(Base):
    __tablename__ = "summary_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    pdf_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    summary: Mapped[str] = mapped_column(String, nullable=False)

    # provider yerine llm_choice_id kullanıyoruz
    llm_choice_id: Mapped[int] = mapped_column(
        ForeignKey("llm_choices.id", ondelete="CASCADE"), nullable=False
    )

    # local summarization için user
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ilişkiler
    user = relationship("User")
    llm_choice = relationship("LLMChoice")
