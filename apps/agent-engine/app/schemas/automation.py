"""Schema cho automation: webhook nội bộ → n8n, và lưu hoa hồng từ n8n."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Workflow 1 — Hot Lead Alert (POST /webhooks/internal/booking-created)
# ---------------------------------------------------------------------------

class BookingCreatedIn(BaseModel):
    """Payload frontend/middleware gửi khi tạo booking.

    Chỉ `lead_id` + `unit_id` là bắt buộc; các field còn lại nếu thiếu sẽ được
    backend tự bù từ store lead / user trước khi forward sang n8n.
    """

    model_config = ConfigDict(extra="ignore")

    lead_id: str
    unit_id: str
    unit_summary: str = ""
    booking_time: str = ""

    sale_id: Optional[str] = None
    conversation_url: str = ""
    ai_score: int = Field(default=0, ge=0, le=100)
    ai_summary: str = ""

    # Override tuỳ chọn (nếu caller đã có sẵn, khỏi tra store).
    lead_name: Optional[str] = None
    lead_phone: Optional[str] = None
    lead_email: Optional[str] = None
    sale_name: Optional[str] = None
    sale_email: Optional[str] = None
    sale_telegram_chat_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Workflow 2 — Commission Calculator (POST /webhooks/internal/deal-closed)
# ---------------------------------------------------------------------------

class DealClosedIn(BaseModel):
    """Admin mark deal đã chốt → forward sang n8n commission-calc."""

    model_config = ConfigDict(extra="ignore")

    deal_id: str
    deal_amount: int = Field(gt=0, description="Giá trị deal (VND)")
    deal_closed_at: Optional[str] = None

    sale_id: str
    sale_name: Optional[str] = None
    sale_monthly_volume_before: int = Field(default=0, ge=0)

    leader_id: Optional[str] = None
    manager_id: Optional[str] = None
    director_id: Optional[str] = None


# ---------------------------------------------------------------------------
# POST /commissions/distribute — n8n gửi kết quả tính hoa hồng về để lưu
# ---------------------------------------------------------------------------

class CommissionTier(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str  # company | director | manager | leader | frontline
    user_id: Optional[str] = None
    pct: float = Field(ge=0, description="% trên commission_pool")
    amount: float = Field(ge=0, description="Số tiền hoa hồng (VND)")


class CommissionDistributeIn(BaseModel):
    """Bản ghi phân bổ hoa hồng 5 bậc do n8n Function node tính."""

    model_config = ConfigDict(extra="ignore")

    deal_id: str
    deal_amount: int = Field(gt=0)
    commission_pool: float = Field(ge=0, description="deal_amount × 4%")
    sale_id: str
    sale_monthly_volume_after: int = Field(default=0, ge=0)
    frontline_tier_pct: int = Field(default=0, description="Bậc lũy tiến frontline (50..65)")
    tiers: list[CommissionTier] = Field(default_factory=list)
