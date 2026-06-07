"""Schema cho các endpoint quản trị Phase 2 (users / inventory / settings)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

UserRole = Literal["admin", "sale", "client"]


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class AdminUserCreate(BaseModel):
    """Admin tạo user trực tiếp (bỏ qua luồng đăng ký công khai)."""

    email: str = Field(min_length=3, max_length=160)
    full_name: str = Field(min_length=2, max_length=120)
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)
    role: UserRole = "sale"
    region: Optional[str] = Field(default=None, max_length=80)
    upline_email: Optional[str] = Field(default=None, max_length=160)


class AdminUserUpdate(BaseModel):
    """Cập nhật thông tin user (tất cả tuỳ chọn)."""

    full_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = Field(default=None, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=20)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    region: Optional[str] = Field(default=None, max_length=80)
    upline_email: Optional[str] = Field(default=None, max_length=160)


class ResetPasswordOut(BaseModel):
    user_id: str
    temp_password: str


class BulkImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

class UnitPosition(BaseModel):
    x: float
    y: float


class InventoryUnitCreate(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    lo: Optional[str] = None
    phan_khu: Optional[str] = None
    loai: Optional[str] = None
    dien_tich: Optional[float] = Field(default=None, ge=0)
    mat_tien: Optional[float] = Field(default=None, ge=0)
    trang_thai: Optional[str] = None
    gia_tri: Optional[float] = Field(default=None, ge=0)
    position: Optional[UnitPosition] = None


class InventoryUnitUpdate(BaseModel):
    phan_khu: Optional[str] = None
    loai: Optional[str] = None
    dien_tich: Optional[float] = Field(default=None, ge=0)
    mat_tien: Optional[float] = Field(default=None, ge=0)
    trang_thai: Optional[str] = None
    gia_tri: Optional[float] = Field(default=None, ge=0)
    position: Optional[UnitPosition] = None


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class GeneralSettings(BaseModel):
    site_name: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    working_hours: Optional[str] = None


class NotificationSettings(BaseModel):
    email_on_hot_lead: Optional[bool] = None
    telegram_on_hot_lead: Optional[bool] = None
    notify_sale_on_assignment: Optional[bool] = None
    daily_briefing: Optional[bool] = None


class SettingsUpdate(BaseModel):
    general: Optional[GeneralSettings] = None
    notifications: Optional[NotificationSettings] = None
