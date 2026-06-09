"""Schema cho các stub endpoint phục vụ n8n workflow (04-34).

Chỉ khai báo payload của các endpoint POST mà n8n gọi vào. Các endpoint GET
trả dict tự do nên không cần model riêng. Giữ field tối thiểu — đủ để n8n
gửi dữ liệu và backend ghi audit; Phase 3 sẽ siết validation khi nối Postgres.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class EscalationIn(BaseModel):
    """Workflow 13 — sale không phản hồi lead nóng → escalate lên manager."""

    lead_id: Optional[str] = None
    sale_id: Optional[str] = None
    reason: str = Field(default="", max_length=500)
    severity: str = Field(default="medium", description="low | medium | high")


class LeaderboardUpdateIn(BaseModel):
    """Workflow 15 — deal mới chốt → cập nhật leaderboard team."""

    deal_id: Optional[str] = None
    sale_id: str
    deal_amount: float = Field(default=0, ge=0, description="Giá trị deal (tỷ)")


class TierUpgradeIn(BaseModel):
    """Workflow 14 — hoàn thành training → mở khoá bậc hoa hồng cao hơn."""

    tier: Optional[int] = Field(default=None, ge=1, le=5)
    reason: str = Field(default="training_completed", max_length=200)


class BonusIn(BaseModel):
    """Workflow 34 — thưởng giới thiệu cho sale."""

    amount: float = Field(default=0, ge=0)
    reason: str = Field(default="referral_reward", max_length=200)


class InboxRouteIn(BaseModel):
    """Workflow 24 — email/inbound message → phân loại & định tuyến phòng ban."""

    subject: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=5000)
    from_email: Optional[str] = None
    channel: str = Field(default="email", max_length=40)


class PostLogIn(BaseModel):
    """Workflow 25 — log bài đã auto-publish lên kênh marketing."""

    channel: str = Field(default="facebook", max_length=40)
    content: str = Field(default="", max_length=10000)
    unit_id: Optional[str] = None
    external_post_id: Optional[str] = None


class SegmentPreviewIn(BaseModel):
    """Workflow 32 — preview tệp khách theo tiêu chí trước khi gửi campaign."""

    role: Optional[str] = Field(default="client", description="Lọc theo role")
    has_favorites: Optional[bool] = None
    min_age_days: Optional[int] = Field(default=None, ge=0)


class AudienceMatchIn(BaseModel):
    """Workflow 33 — match danh sách khách cho sự kiện/quảng cáo."""

    criteria: dict[str, Any] = Field(default_factory=dict)
    limit: int = Field(default=50, ge=1, le=500)


class CampaignLogIn(BaseModel):
    """Workflow 32 — log kết quả gửi campaign."""

    sent: int = Field(default=0, ge=0)
    opened: int = Field(default=0, ge=0)
    clicked: int = Field(default=0, ge=0)
    note: str = Field(default="", max_length=500)
