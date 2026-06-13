"""Schema HỒ SƠ ĐẠI LÝ F2 (sàn cấp dưới).

LUỒNG: đăng ký nhanh → tạo tài khoản role="agency" (pending, tier base) → khai báo
hồ sơ điều kiện F2 bên trong /agency → gửi duyệt → admin duyệt (set f2_80).
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

AgencyStatus = Literal["pending", "active", "rejected"]


# ---------------------------------------------------------------------------
# Đăng ký nhanh (public) → tạo tài khoản agency
# ---------------------------------------------------------------------------

class AgencyRegister(BaseModel):
    """Đăng ký nhanh: chỉ cần thông tin cơ bản + mật khẩu."""

    ten_san: str = Field(min_length=2, max_length=200, description="Tên sàn")
    nguoi_dai_dien: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=40)
    password: str = Field(min_length=8, max_length=128)


# ---------------------------------------------------------------------------
# Hồ sơ điều kiện F2 (chủ sàn tự cập nhật trong /agency)
# ---------------------------------------------------------------------------

class AgencySaleIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=160)


class AgencyBusinessInfo(BaseModel):
    ten_dn: Optional[str] = Field(default=None, max_length=200)
    ma_so_thue: Optional[str] = Field(default=None, max_length=40)
    dia_chi: Optional[str] = Field(default=None, max_length=300)
    nguoi_dai_dien_phap_luat: Optional[str] = Field(default=None, max_length=120)


class AgencyProfileUpdate(BaseModel):
    """Cập nhật hồ sơ F2 — mọi field tuỳ chọn (cập nhật dần)."""

    ten_san: Optional[str] = Field(default=None, max_length=200)
    nguoi_dai_dien: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    business_info: Optional[AgencyBusinessInfo] = None
    brokerage_declared: Optional[bool] = None
    gpkd_so: Optional[str] = Field(default=None, max_length=80)
    sales: Optional[List[AgencySaleIn]] = None
    ghi_chu: Optional[str] = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# View output
# ---------------------------------------------------------------------------

class AgencySaleOut(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None


class AgencyBusinessOut(BaseModel):
    ten_dn: Optional[str] = None
    ma_so_thue: Optional[str] = None
    dia_chi: Optional[str] = None
    nguoi_dai_dien_phap_luat: Optional[str] = None


class AgencyProgress(BaseModel):
    business_ok: bool = False
    brokerage_ok: bool = False
    sales_count: int = 0
    sales_required: int = 5
    sales_ok: bool = False
    eligible: bool = False


class AgencyOut(BaseModel):
    id: str
    owner_user_id: str
    ten_san: str
    nguoi_dai_dien: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: AgencyStatus = "pending"
    commission_tier: str = "base"
    commission_pct: Optional[int] = None
    business_info: AgencyBusinessOut = Field(default_factory=AgencyBusinessOut)
    brokerage_declared: bool = False
    gpkd_so: Optional[str] = None
    sales: List[AgencySaleOut] = Field(default_factory=list)
    can_config_sale_commission: bool = False
    submitted_for_review: bool = False
    eligible: bool = False
    progress: AgencyProgress = Field(default_factory=AgencyProgress)
    review_note: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    ghi_chu: Optional[str] = None
    created_at: str
    updated_at: str


class AgencyReviewIn(BaseModel):
    review_note: Optional[str] = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# Khu QUẢN TRỊ SÀN F2 (đa-tenant) — cấu hình hoa hồng cho sale của sàn (NỀN)
# ---------------------------------------------------------------------------

class AgencyCommissionUpdate(BaseModel):
    """Cập nhật cấu hình hoa hồng cho ĐỘI SALE của sàn (bước nền).

    `frontline_pct`: % chia cho sale frontline của sàn (trong phần sàn hưởng)."""

    frontline_pct: Optional[int] = Field(default=None, ge=0, le=100)
    note: Optional[str] = Field(default=None, max_length=2000)
