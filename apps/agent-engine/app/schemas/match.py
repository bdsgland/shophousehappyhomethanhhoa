"""Schemas cho tính năng Live Match — kết nối khách ↔ sale realtime qua Google Meet.

Mô hình "Uber cho tư vấn BĐS": khách online → hệ thống tìm sale online tốt nhất →
ping qua WebSocket (timeout 15s) → sale Accept → tạo Google Meet → cả hai vào call.

Toàn bộ schema dùng chung convention với app/schemas/* (Pydantic v2, Enum str,
datetime ISO8601). File này TÁCH RIÊNG khỏi CRM — không phụ thuộc app/schemas/crm.py.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class SaleAvailability(str, Enum):
    """Trạng thái sẵn sàng của sale trong hệ thống Live Match."""

    ONLINE = "online"  # sẵn sàng nhận khách
    BUSY = "busy"  # đang trong call
    AWAY = "away"  # offline / mất kết nối
    DO_NOT_DISTURB = "dnd"  # online nhưng không nhận match tự động


class MatchStatus(str, Enum):
    """Vòng đời một yêu cầu match."""

    PENDING = "pending"  # đang tìm sale
    INVITED = "invited"  # đã ping 1 sale, chờ accept (15s)
    ACCEPTED = "accepted"  # sale accept, đang tạo Meet
    LIVE = "live"  # Meet đã sẵn sàng, link gửi cho cả hai
    COMPLETED = "completed"  # call kết thúc (sale điền outcome)
    DECLINED = "declined"  # tất cả sale từ chối / không có sale
    EXPIRED = "expired"  # hết hạn invite mà không có ai accept
    CANCELLED = "cancelled"  # khách huỷ


class MatchOutcome(str, Enum):
    """Kết quả call do sale điền sau khi kết thúc (đổ về CRM ở Phase 2)."""

    INTERESTED = "interested"
    NOT_INTERESTED = "not_interested"
    BOOKED = "booked"  # đã chốt lịch xem nhà / đặt cọc
    FOLLOW_UP = "follow_up"  # cần gọi lại


class SalePresence(BaseModel):
    """Trạng thái hiện diện realtime của 1 sale (lưu in-memory ở presence.py)."""

    sale_id: str
    sale_name: str
    availability: SaleAvailability = SaleAvailability.ONLINE
    last_heartbeat_at: datetime
    active_calls: int = 0  # số call đang active
    last_match_at: Optional[datetime] = None  # cho round-robin fairness
    schedule_start: str = "08:00"  # giờ bắt đầu làm việc (giờ VN)
    schedule_end: str = "22:00"  # giờ kết thúc
    eligibility_score: float = 0.0  # điểm xếp hạng (từ sale_task_store)


class MatchRequest(BaseModel):
    """Một yêu cầu match đầy đủ (khớp record lưu match_store.json)."""

    id: str
    customer_id: str
    customer_name: str
    customer_email: str
    sale_id: Optional[str] = None
    sale_name: Optional[str] = None
    status: MatchStatus = MatchStatus.PENDING
    meet_link: Optional[str] = None
    meet_event_id: Optional[str] = None
    invited_sales: list[str] = []  # đã ping những sale nào
    declined_by: list[str] = []  # ai đã decline / expire
    invite_expires_at: Optional[datetime] = None  # hạn 15s của invite hiện tại
    created_at: datetime
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    outcome: Optional[MatchOutcome] = None
    outcome_note: Optional[str] = None


class CompleteMatchBody(BaseModel):
    """Body khi sale POST kết quả call (/match/{id}/complete)."""

    outcome: MatchOutcome
    note: Optional[str] = None


class MatchStats(BaseModel):
    """Thống kê tổng hợp cho dashboard admin."""

    period: str
    total: int = 0
    accepted: int = 0
    declined: int = 0
    expired: int = 0
    cancelled: int = 0
    live: int = 0
    completed: int = 0
    avg_duration_seconds: float = 0.0
    avg_accept_seconds: float = 0.0
    conversion_rate: float = 0.0  # completed / total
    online_sales: int = 0
    online_customers: int = 0
    active_calls: int = 0
