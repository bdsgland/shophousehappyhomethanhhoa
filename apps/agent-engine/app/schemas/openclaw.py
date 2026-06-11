"""Schemas request/response cho OpenClaw God-Mode Bridge (prefix /openclaw).

Tách riêng để bridge gọn + để FastAPI sinh tài liệu /docs rõ ràng. Mọi field
nhạy cảm (password) chỉ NHẬN vào, không bao giờ trả ra.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

class OpenClawUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "sale"  # client | sale | admin (god-mode: cho phép tạo admin)
    password: Optional[str] = None  # None → tự sinh, trả về 1 lần
    phone: Optional[str] = None
    region: Optional[str] = None
    upline_email: Optional[str] = None


class OpenClawUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    region: Optional[str] = None
    upline_email: Optional[str] = None
    password: Optional[str] = None  # đặt lại mật khẩu trực tiếp


# ---------------------------------------------------------------------------
# CRM / leads
# ---------------------------------------------------------------------------

class OpenClawLeadCreate(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    note: Optional[str] = None
    source: str = "openclaw"
    status: str = "cold"
    assigned_sale_id: Optional[str] = None


class OpenClawLeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    status: Optional[str] = None
    note: Optional[str] = None
    assigned_sale_id: Optional[str] = None


class OpenClawAssignHot(BaseModel):
    sale_id: str


class OpenClawLeadBulkAction(BaseModel):
    lead_ids: list[str] = Field(default_factory=list)
    action: Literal["assign", "mark_hot", "set_status", "soft_delete"]
    sale_id: Optional[str] = None  # cho action="assign"
    status: Optional[str] = None  # cho action="set_status"


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

class OpenClawInventoryUpdate(BaseModel):
    trang_thai: Optional[str] = None
    gia_tri: Optional[float] = None
    gia_min: Optional[float] = None
    gia_max: Optional[float] = None
    dien_tich: Optional[float] = None
    mat_tien: Optional[float] = None
    phan_khu: Optional[str] = None
    loai: Optional[str] = None
    huong: Optional[str] = None
    view: Optional[str] = None
    notes: Optional[str] = None


class OpenClawInventoryBulkUpdate(BaseModel):
    unit_ids: list[str] = Field(default_factory=list)
    changes: OpenClawInventoryUpdate


class OpenClawSheetSync(BaseModel):
    sheet_url: str
    gid: int = 0
    replace_all: bool = True


# ---------------------------------------------------------------------------
# Commission
# ---------------------------------------------------------------------------

class OpenClawCommissionDistribute(BaseModel):
    deal_id: str
    deal_amount: int
    sale_frontline_id: str
    sale_monthly_volume_before_deal: int = 0
    leader_id: Optional[str] = None
    manager_id: Optional[str] = None
    director_id: Optional[str] = None
    referrer_id: Optional[str] = None
    sale_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Database read-only query
# ---------------------------------------------------------------------------

class OpenClawSqlQuery(BaseModel):
    sql: str
    max_rows: int = Field(default=1000, ge=1, le=1000)


# ---------------------------------------------------------------------------
# Communication
# ---------------------------------------------------------------------------

class OpenClawTelegramSend(BaseModel):
    chat_id: Optional[str] = None  # None → dùng CEO chat_id mặc định
    text: str
    parse_mode: Optional[str] = "MarkdownV2"


class OpenClawEmailSend(BaseModel):
    to: list[EmailStr]
    subject: str
    body: str
    html: bool = False


class OpenClawAnnounce(BaseModel):
    audience: Literal["all_sales", "all_admins", "specific_users"]
    channels: list[Literal["telegram", "email"]] = Field(default_factory=lambda: ["telegram"])
    message: str
    subject: str = "Thông báo từ ELC"
    user_ids: list[str] = Field(default_factory=list)  # cho audience="specific_users"


# ---------------------------------------------------------------------------
# Marketing Pipeline (CEO bot điều khiển dây chuyền sản xuất content AI)
# ---------------------------------------------------------------------------

class OpenClawMarketingResearch(BaseModel):
    topic: str
    project: Optional[str] = None
    audience: Optional[str] = None
    language: Literal["vi", "en", "bilingual"] = "vi"


class OpenClawMarketingContent(BaseModel):
    brief: str
    channel: Literal["facebook", "zalo", "google", "email", "tiktok", "other"] = "facebook"
    content_format: Literal["toplist", "pov", "case_study", "howto", "generic"] = "generic"
    tone: Optional[str] = None
    language: Literal["vi", "en", "bilingual"] = "vi"
    audience: Optional[str] = None


class OpenClawMarketingRunPipeline(BaseModel):
    pipeline_id: str
    include_publish: bool = False
    confirm: bool = False  # bắt buộc True nếu include_publish
    channels: list[str] = Field(default_factory=list)


class OpenClawMarketingPublish(BaseModel):
    pipeline_id: str
    channels: list[str] = Field(default_factory=list)
    confirm: bool = False  # bắt buộc True để đăng
    email_to: list[str] = Field(default_factory=list)
    subject: Optional[str] = None
