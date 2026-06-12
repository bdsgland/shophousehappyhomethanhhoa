"""Schema CRM — quản lý khách hàng, contact log, daily task & hiệu suất sale.

Đây là CRM "đầy đủ" (sale import danh bạ + admin master view + hot lead
distribution), TÁCH BIỆT với `app/schemas/lead.py` (lead nguồn chat in-memory
dùng cho luồng booking). Khái niệm `Lead` ở đây là khách hàng trong CRM.

Lưu trữ: JSON store interim (app/core/lead_store.py + sale_task_store.py).
Sau Sprint kế tiếp migrate PostgreSQL — giữ interface store để swap dễ.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class LeadSource(str, Enum):
    """Nguồn của khách hàng trong CRM."""

    IMPORTED = "imported"  # sale import từ danh bạ
    REGISTERED = "registered"  # khách tự đăng ký landing
    REFERRAL = "referral"  # sale share link giới thiệu
    FB_ADS = "fb_ads"
    ZALO = "zalo"
    EMAIL = "email"
    MANUAL = "manual"  # admin nhập tay
    GOOGLE_SHEET = "google_sheet"  # admin import từ Google Trang tính
    FILE_UPLOAD = "file_upload"  # admin import từ file CSV/XLSX


class LeadStatus(str, Enum):
    """Vòng đời khách hàng (soft-delete = LOST)."""

    COLD = "cold"
    WARM = "warm"
    HOT = "hot"
    CUSTOMER = "customer"  # đã đặt cọc / chốt deal
    LOST = "lost"


class ContactChannel(str, Enum):
    """Kênh sale liên hệ khách."""

    CALL = "call"
    SMS = "sms"
    ZALO = "zalo"
    FACEBOOK = "facebook"
    EMAIL = "email"
    INPERSON = "inperson"
    NOTE = "note"  # ghi chú chăm sóc (không gắn kênh cụ thể)


ContactOutcome = Literal[
    "no_answer", "interested", "not_interested", "callback", "booked"
]


# ---------------------------------------------------------------------------
# Lead (khách hàng)
# ---------------------------------------------------------------------------

class LeadCreate(BaseModel):
    """Payload tạo 1 lead (sale nhập tay hoặc 1 dòng trong bulk import)."""

    name: str
    phone: str
    email: Optional[EmailStr] = None
    note: Optional[str] = None
    source: LeadSource = LeadSource.IMPORTED


class LeadBulkImport(BaseModel):
    """Payload import nhiều lead từ danh bạ (CSV / paste thô)."""

    leads: list[LeadCreate]
    skip_duplicates: bool = True


class LeadUpdate(BaseModel):
    """Payload cập nhật lead (sale: status/note)."""

    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    status: Optional[LeadStatus] = None
    note: Optional[str] = None


class LeadAdminUpdate(BaseModel):
    """Payload SỬA thông tin khách (admin) — đầy đủ trường hồ sơ.

    Mọi field Optional: chỉ field gửi lên (exclude_unset) mới được cập nhật.
    `assigned_sale_id` cho phép admin đổi người phụ trách ngay tại form sửa.
    """

    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    source: Optional[LeadSource] = None
    status: Optional[LeadStatus] = None
    note: Optional[str] = None
    assigned_sale_id: Optional[str] = None
    # Trường phân loại / hồ sơ mở rộng (Customer 360) — admin sửa được.
    region: Optional[str] = None
    customer_group: Optional[str] = None
    product_type: Optional[str] = None
    budget: Optional[str] = None
    purpose: Optional[str] = None
    project: Optional[str] = None


class Lead(BaseModel):
    """Khách hàng trong CRM. `days_since_contact` là computed cho UI."""

    id: str
    name: str
    phone: str
    email: Optional[str] = None
    source: LeadSource
    status: LeadStatus
    assigned_sale_id: Optional[str] = None  # ai đang phụ trách
    imported_by_sale_id: Optional[str] = None  # ai nhập đầu tiên
    ai_score: int = 0  # 0-100, AI tính dựa trên engagement
    booking_count: int = 0
    contact_count: int = 0
    registered: bool = False  # đã liên kết tài khoản web chưa
    last_contact_at: Optional[datetime] = None
    hot_marker_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    note: Optional[str] = None
    # Trường phân loại / hồ sơ mở rộng (Customer 360) — đều tuỳ chọn.
    region: Optional[str] = None          # Vùng miền / khu vực
    customer_group: Optional[str] = None  # Tệp khách / nhóm khách (nhãn tab import)
    product_type: Optional[str] = None    # Phân khúc / sản phẩm quan tâm
    budget: Optional[str] = None          # Ngân sách
    purpose: Optional[str] = None         # Mục đích (ở / đầu tư)
    project: Optional[str] = None         # Dự án quan tâm
    # Computed fields cho UI
    days_since_contact: Optional[int] = None


class LeadDetail(Lead):
    """Lead + lịch sử contact log (admin/sale detail view)."""

    contact_logs: list["ContactLog"] = Field(default_factory=list)
    assigned_sale_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Contact log
# ---------------------------------------------------------------------------

class ContactLogCreate(BaseModel):
    channel: ContactChannel
    note: str
    outcome: ContactOutcome


class CareLogCreate(BaseModel):
    """Payload "đăng 1 hoạt động chăm sóc" lên dòng thời gian (care feed).

    Giống ContactLogCreate nhưng `outcome` TUỲ CHỌN (ghi chú thuần không cần kết
    quả) và `note` là nội dung bài đăng. created_by lấy từ user hiện tại ở endpoint.
    """

    channel: ContactChannel = ContactChannel.NOTE
    note: str
    outcome: Optional[ContactOutcome] = None


class ContactLog(BaseModel):
    id: str
    lead_id: str
    sale_id: str
    channel: ContactChannel
    note: str
    outcome: ContactOutcome
    created_by_name: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Sale daily task & performance
# ---------------------------------------------------------------------------

class SaleTaskDaily(BaseModel):
    sale_id: str
    date: date
    new_leads_added: int = 0  # số lead import hôm nay
    contacts_made: int = 0  # số contact log hôm nay
    meetings_attended: int = 0  # bookings completed hôm nay
    hot_leads_received: int = 0  # hot lead được phân bổ
    hot_leads_closed: int = 0  # chuyển sang customer
    score: int = 0  # 0-100, computed
    target_new_leads: int = 10
    target_contacts: int = 20
    target_meetings: int = 1
    checked_in: bool = False  # sale đã check-in chưa


class SalePerformance(BaseModel):
    sale_id: str
    sale_name: str
    week_start: date
    avg_daily_score: float
    total_leads_added: int
    total_hot_leads_received: int
    total_deals_closed: int
    eligibility_score: float  # dựa trên score → ưu tiên nhận hot lead
    rank: int


class SaleSuggestion(BaseModel):
    """Gợi ý sale khi PHÂN CÔNG chăm sóc 1 khách (trong hồ sơ 360°).

    Gộp hiệu suất (sale_task_store) + trạng thái online realtime (presence của
    Live Match) để admin chọn người MẠNH hoặc đang TRỰC. FE sắp xếp online + điểm
    cao lên trên (đã sort sẵn từ backend).
    """

    sale_id: str
    sale_name: str
    eligibility_score: float
    avg_daily_score: float
    total_deals_closed: int
    rank: int
    online: bool = False
    availability: Optional[str] = None  # online / busy / away / None
    active_calls: int = 0


# ---------------------------------------------------------------------------
# Admin dashboard stats
# ---------------------------------------------------------------------------

class CrmStats(BaseModel):
    total_leads: int
    hot_leads: int
    customers: int
    cold_leads: int
    warm_leads: int
    lost_leads: int
    conversion_rate: float  # customers / total (đã bỏ lost)
    top_sources: list[dict]  # [{source, count}]


LeadDetail.model_rebuild()
