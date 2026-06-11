"""Schema cho module NHÂN SỰ (HR) — phân quyền theo vai trò, mục tiêu KPI,
báo cáo hiệu suất AI cho từng nhân sự.

Tách riêng schema HR (KHÔNG sửa app/schemas/admin.py) để mở rộng không phá vỡ
phân quyền hiện có. Bộ vai trò HR mở rộng hơn UserRole gốc (admin/sale/client):
thêm manager / marketing / accountant / support.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# Bộ vai trò đầy đủ cho HR. Tương thích ngược với UserRole gốc (admin/sale/client)
# — user_store.create_user/update_user nhận role dạng chuỗi tự do nên các vai trò
# mới lưu được ngay mà không phải sửa store.
HRRole = Literal[
    "admin",
    "manager",
    "sale",
    "marketing",
    "accountant",
    "support",
    "client",
]

# Chỉ số KPI hỗ trợ tính "thực tế" tự động từ dữ liệu sẵn có.
KPIMetric = Literal[
    "revenue",      # doanh số (VND) — từ commission_store (tổng deal_amount)
    "commission",   # hoa hồng nhận (VND) — từ commission_store (tổng tier amount)
    "deals",        # số deal đóng — số deal_id phân biệt trong commission_store
    "leads",        # số lead thêm mới — sale_task_store.new_leads_added
    "contacts",     # số cuộc gọi/liên hệ — sale_task_store.contacts_made
    "meetings",     # số cuộc hẹn — sale_task_store.meetings_attended
]


# ---------------------------------------------------------------------------
# Nhân sự (staff) — view + tạo/sửa (gán vai trò)
# ---------------------------------------------------------------------------

class StaffCreate(BaseModel):
    """Admin tạo nhân sự mới (bỏ qua luồng đăng ký công khai)."""

    email: str = Field(min_length=3, max_length=160)
    full_name: str = Field(min_length=2, max_length=120)
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)
    role: HRRole = "sale"
    region: Optional[str] = Field(default=None, max_length=80)
    upline_email: Optional[str] = Field(default=None, max_length=160)


class StaffUpdate(BaseModel):
    """Cập nhật nhân sự (tất cả tuỳ chọn) — gán lại vai trò / bật-tắt."""

    full_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = Field(default=None, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=20)
    role: Optional[HRRole] = None
    is_active: Optional[bool] = None
    region: Optional[str] = Field(default=None, max_length=80)
    upline_email: Optional[str] = Field(default=None, max_length=160)


class StaffStatusUpdate(BaseModel):
    """Bật/tắt (khoá/mở) nhân sự."""

    is_active: bool


# ---------------------------------------------------------------------------
# Ma trận quyền (role × permission)
# ---------------------------------------------------------------------------

class PermissionDef(BaseModel):
    key: str
    label_vi: str


class RolePermissionRow(BaseModel):
    role: str
    label_vi: str
    permissions: dict[str, bool]


class PermissionMatrix(BaseModel):
    permissions_catalog: list[PermissionDef]
    roles: list[RolePermissionRow]


class RolePermissionUpdate(BaseModel):
    """Cập nhật quyền cho 1 vai trò (bật/tắt từng quyền)."""

    role: str = Field(min_length=2, max_length=40)
    permissions: dict[str, bool]


# ---------------------------------------------------------------------------
# Mục tiêu / KPI
# ---------------------------------------------------------------------------

class ObjectiveCreate(BaseModel):
    staff_id: str = Field(min_length=1, max_length=64)
    period: str = Field(min_length=4, max_length=20)  # vd "2026-06" hoặc "Q2-2026"
    metric: KPIMetric
    target: float = Field(ge=0)
    note: Optional[str] = Field(default=None, max_length=300)


class ObjectiveUpdate(BaseModel):
    period: Optional[str] = Field(default=None, min_length=4, max_length=20)
    metric: Optional[KPIMetric] = None
    target: Optional[float] = Field(default=None, ge=0)
    # Cho phép admin ghi đè thực tế (vd dữ liệu ngoài hệ thống). None = dùng auto.
    actual_override: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=300)


class ObjectiveOut(BaseModel):
    id: str
    staff_id: str
    staff_name: Optional[str] = None
    period: str
    metric: KPIMetric
    target: float
    actual: float           # thực tế (auto hoặc override)
    actual_auto: float      # thực tế tính tự động từ dữ liệu
    actual_override: Optional[float] = None
    completion_pct: float   # % hoàn thành (0-100+)
    note: Optional[str] = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Báo cáo hiệu suất AI
# ---------------------------------------------------------------------------

class PerformanceReport(BaseModel):
    staff_id: str
    staff_name: str
    role: str
    generated_at: str
    ai_used: bool                 # True nếu dùng Claude thật; False = fallback
    summary: str                  # nhận xét tổng quan (tiếng Việt)
    strengths: list[str]          # điểm mạnh
    weaknesses: list[str]         # điểm cần cải thiện
    recommendations: list[str]    # đề xuất hành động
    metrics: dict                 # số liệu thô đã tổng hợp
