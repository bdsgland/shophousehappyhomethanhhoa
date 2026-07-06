"""SQLAlchemy models — schema Postgres cho Agent Proptech (Sprint 1.1).

Dùng style `Column(...)` cổ điển (không phải `Mapped[]`) để tương thích cả
Python 3.9 (máy local) lẫn 3.11 (Railway) mà không phụ thuộc cách đánh giá
annotation PEP 563.

Quy ước:
- Khoá chính là UUID dạng chuỗi (đồng bộ với user_store JSON đang dùng uuid4).
- Cột JSON dùng kiểu `JSON` trung lập (PG → json, SQLite → text) để test offline.
- created_at/updated_at đặt mặc định phía Python (DB-agnostic).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class User(Base):
    """Người dùng hệ thống: admin / sale / client (khách hàng).

    Superset của schema JSON hiện tại (user_store) + field phục vụ import:
    `source` (nguồn data) và `facebook_url` (từ file quảng cáo Happy Home).
    """

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, nullable=False, unique=True, index=True)
    full_name = Column(String, nullable=False, default="")
    phone = Column(String, nullable=True, index=True)
    role = Column(String, nullable=False, default="sale")
    is_active = Column(Boolean, nullable=False, default=True)
    password_hash = Column(String, nullable=True)

    # Hệ thống giới thiệu / hoa hồng
    referral_code = Column(String, nullable=True, unique=True, index=True)
    upline_email = Column(String, nullable=True, index=True)

    # Hồ sơ mở rộng
    dob = Column(String, nullable=True)
    region = Column(String, nullable=True)
    source = Column(String, nullable=True)  # vd "Happy Home Quảng cáo"
    facebook_url = Column(String, nullable=True)
    telegram_chat_id = Column(String, nullable=True, index=True)
    projects_interested = Column(JSON, nullable=False, default=list)
    favorites = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)

    leads = relationship("Lead", back_populates="sale", foreign_keys="Lead.sale_id")


class Lead(Base):
    """Khách tiềm năng do AI/agent thu thập, gán cho 1 sale."""

    __tablename__ = "leads"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True, index=True)
    email = Column(String, nullable=True, index=True)
    source = Column(String, nullable=True)
    ai_score = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="new")
    sale_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)

    sale = relationship("User", back_populates="leads", foreign_keys=[sale_id])
    conversations = relationship("Conversation", back_populates="lead")
    bookings = relationship("Booking", back_populates="lead")


class Conversation(Base):
    """Lịch sử hội thoại của 1 lead trên 1 kênh (web/zalo/chatwoot...)."""

    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_uuid)
    lead_id = Column(String, ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)
    channel = Column(String, nullable=False, default="web")
    started_at = Column(DateTime, nullable=False, default=_now)
    last_message_at = Column(DateTime, nullable=True)
    messages_json = Column(JSON, nullable=False, default=list)

    lead = relationship("Lead", back_populates="conversations")


class Booking(Base):
    """Lịch hẹn xem nhà / đặt cọc cho 1 lead, do 1 sale phụ trách."""

    __tablename__ = "bookings"

    id = Column(String, primary_key=True, default=_uuid)
    lead_id = Column(String, ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)
    unit_id = Column(String, ForeignKey("units.id", ondelete="SET NULL"), nullable=True)
    sale_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    scheduled_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="pending")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)

    lead = relationship("Lead", back_populates="bookings")
    unit = relationship("Unit")


class Commission(Base):
    """Hoa hồng theo từng tầng (tier) của 1 giao dịch."""

    __tablename__ = "commissions"

    id = Column(String, primary_key=True, default=_uuid)
    deal_id = Column(String, nullable=True, index=True)
    sale_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tier_role = Column(String, nullable=True)  # vd "direct" / "upline" / "leader"
    amount = Column(Numeric(18, 2), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)


class Unit(Base):
    """Căn hộ / sản phẩm trong rổ hàng (inventory)."""

    __tablename__ = "units"

    id = Column(String, primary_key=True, default=_uuid)
    code = Column(String, nullable=False, unique=True, index=True)
    type = Column(String, nullable=True)
    area = Column(Float, nullable=True)
    view = Column(String, nullable=True)
    price = Column(Numeric(18, 2), nullable=True)
    status = Column(String, nullable=False, default="available")
    position_x = Column(Float, nullable=True)
    position_y = Column(Float, nullable=True)
    images_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, nullable=False, default=_now)


# Index phụ trợ truy vấn theo phone (khử trùng lặp khi import) + role.
Index("ix_users_role", User.role)
