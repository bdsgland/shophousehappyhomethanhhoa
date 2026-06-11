"""Schemas cho tính năng AI Marketing (admin) — chiến dịch + sản xuất nội dung.

Tách 3 nhóm:
  • Campaign: CRUD chiến dịch đa kênh (facebook/zalo/google/email/tiktok/other).
  • Performance: hiệu suất từng campaign + tổng quan ROI theo kênh (tính từ lead).
  • Content (AI): yêu cầu sinh nội dung tiếng Việt + bản ghi lịch sử đã tạo.

Convention: *Create / *Update / *Out như app/schemas/admin.py. Field optional cho
update; validate nhẹ ở store/endpoint (không raise 500).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# Kênh quảng cáo hỗ trợ. "other" để chừa chỗ cho kênh mới mà không vỡ schema.
CampaignChannel = Literal["facebook", "zalo", "google", "email", "tiktok", "other"]
CampaignStatus = Literal["draft", "running", "paused", "done"]

# Loại nội dung AI có thể sinh.
ContentType = Literal["post", "ad", "email", "script"]
ContentLength = Literal["short", "medium", "long"]


# ---------------------------------------------------------------------------
# Campaign (chiến dịch)
# ---------------------------------------------------------------------------

class CampaignCreate(BaseModel):
    """Tạo chiến dịch mới."""

    name: str = Field(min_length=2, max_length=160)
    channel: CampaignChannel = "facebook"
    objective: Optional[str] = Field(default=None, max_length=200)
    budget: float = Field(default=0, ge=0)
    spent: float = Field(default=0, ge=0)
    start_date: Optional[str] = Field(default=None, max_length=40)
    end_date: Optional[str] = Field(default=None, max_length=40)
    status: CampaignStatus = "draft"
    # utm_source dùng để gắn lead (lead.source == utm_source). Trống → khớp theo name.
    utm_source: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=2000)


class CampaignUpdate(BaseModel):
    """Cập nhật chiến dịch (tất cả tuỳ chọn)."""

    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    channel: Optional[CampaignChannel] = None
    objective: Optional[str] = Field(default=None, max_length=200)
    budget: Optional[float] = Field(default=None, ge=0)
    spent: Optional[float] = Field(default=None, ge=0)
    start_date: Optional[str] = Field(default=None, max_length=40)
    end_date: Optional[str] = Field(default=None, max_length=40)
    status: Optional[CampaignStatus] = None
    utm_source: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=2000)


class SpendUpdate(BaseModel):
    """Cập nhật chi tiêu — đặt tuyệt đối (set) hoặc cộng thêm (add)."""

    spent: Optional[float] = Field(default=None, ge=0)
    add: Optional[float] = Field(default=None)


class Campaign(BaseModel):
    """Bản ghi chiến dịch trả về FE."""

    id: str
    name: str
    channel: CampaignChannel
    objective: Optional[str] = None
    budget: float = 0
    spent: float = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: CampaignStatus = "draft"
    utm_source: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Performance (hiệu suất)
# ---------------------------------------------------------------------------

class CampaignPerformance(BaseModel):
    """Hiệu suất 1 chiến dịch — gắn lead theo source/utm."""

    campaign_id: str
    name: str
    channel: CampaignChannel
    status: CampaignStatus
    budget: float = 0
    spent: float = 0
    leads: int = 0
    customers: int = 0
    cpl: float = 0  # chi phí / lead
    conversion_rate: float = 0  # tỉ lệ lead → khách (0-1)
    est_revenue: float = 0  # doanh thu quy đổi (ước tính)
    roi: float = 0  # (doanh thu - chi tiêu) / chi tiêu


class ChannelStat(BaseModel):
    """Thống kê gộp theo kênh."""

    channel: CampaignChannel
    campaigns: int = 0
    spent: float = 0
    leads: int = 0
    customers: int = 0
    cpl: float = 0
    est_revenue: float = 0
    roi: float = 0


class MarketingOverview(BaseModel):
    """Tổng quan toàn bộ marketing — KPI + theo kênh + theo campaign."""

    total_campaigns: int = 0
    running_campaigns: int = 0
    total_budget: float = 0
    total_spent: float = 0
    total_leads: int = 0
    total_customers: int = 0
    avg_cpl: float = 0
    est_revenue: float = 0
    roi: float = 0
    est_revenue_per_customer: float = 0
    by_channel: list[ChannelStat] = Field(default_factory=list)
    campaigns: list[CampaignPerformance] = Field(default_factory=list)
    generated_at: str


# ---------------------------------------------------------------------------
# Content (AI sản xuất nội dung)
# ---------------------------------------------------------------------------

class ContentGenerateRequest(BaseModel):
    """Brief để AI sinh nội dung marketing tiếng Việt."""

    content_type: ContentType = "post"
    channel: CampaignChannel = "facebook"
    # Sản phẩm / dự án + đối tượng khách hàng (gộp tự do để prompt linh hoạt).
    product: str = Field(min_length=2, max_length=600)
    audience: Optional[str] = Field(default=None, max_length=400)
    tone: Optional[str] = Field(default=None, max_length=80)
    length: ContentLength = "medium"
    # Số biến thể muốn AI tạo (chặn để bảo vệ chi phí token).
    variants: int = Field(default=3, ge=1, le=5)
    # Liên kết tuỳ chọn với 1 campaign (chỉ lưu để tra cứu).
    campaign_id: Optional[str] = Field(default=None, max_length=80)


class ContentItem(BaseModel):
    """Bản ghi nội dung đã tạo (lịch sử)."""

    id: str
    content_type: ContentType
    channel: CampaignChannel
    product: str
    audience: Optional[str] = None
    tone: Optional[str] = None
    length: ContentLength
    variants: list[str] = Field(default_factory=list)
    used_llm: bool = False
    campaign_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str


class ContentGenerateResponse(BaseModel):
    """Kết quả sinh nội dung — kèm cờ used_llm để FE báo fallback nếu cần."""

    item: ContentItem
    used_llm: bool
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# Gợi ý chiến dịch bằng AI
# ---------------------------------------------------------------------------

class CampaignSuggestion(BaseModel):
    channel: CampaignChannel
    idea: str
    rationale: Optional[str] = None


class CampaignSuggestResponse(BaseModel):
    suggestions: list[CampaignSuggestion] = Field(default_factory=list)
    used_llm: bool = False
    message: Optional[str] = None
