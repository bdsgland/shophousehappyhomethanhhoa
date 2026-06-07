"""Schema booking — đặt lịch xem nhà (flow chốt giá trị của dự án).

Lưu tạm JSON store (data/_runtime/bookings.json); sau Sprint 1.1 sẽ map sang
PostgreSQL. Giữ cùng convention với schema lead/user.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# MVP: dùng `str` thay vì `EmailStr` để chấp nhận mọi domain (.net/.local…)
# và đồng nhất với app/schemas/user.py.
EmailStr = str

BookingStatus = Literal["pending", "confirmed", "completed", "cancelled", "no_show"]


class BookingCreate(BaseModel):
    """Payload khách (đăng nhập hoặc ẩn danh) gửi khi đặt lịch xem nhà."""

    unit_id: str
    scheduled_at: datetime  # ngày giờ xem nhà
    customer_name: str = Field(min_length=1, max_length=120)
    customer_phone: str = Field(min_length=3, max_length=20)
    customer_email: EmailStr
    notes: Optional[str] = Field(default=None, max_length=1000)
    referral_code: Optional[str] = None  # nếu khách đến qua link share của sale


class BookingUpdate(BaseModel):
    """Đổi trạng thái booking (admin + sale + client tuỳ quyền)."""

    status: BookingStatus


class BookingReschedule(BaseModel):
    """Đổi giờ hẹn (sale + client cho phép)."""

    scheduled_at: datetime


class Booking(BaseModel):
    """Booking trả về cho client/sale/admin."""

    id: str
    unit_id: str
    unit_summary: str = ""
    lead_id: str
    sale_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    customer_email: str
    scheduled_at: datetime
    status: BookingStatus = "pending"
    notes: Optional[str] = None
    ai_score: int = Field(default=0, ge=0, le=100)
    referral_code: Optional[str] = None
    created_by_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
