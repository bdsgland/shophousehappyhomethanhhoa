"""Schema user (Sale/Admin) — đăng ký, đăng nhập, hồ sơ."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# MVP: dùng `str` thay vì `EmailStr` để chấp nhận mọi domain (.net/.local…)
# và tránh phụ thuộc cứng vào package email-validator khi đăng nhập.
EmailStr = str

UserRole = Literal["admin", "sale", "client"]

# Role được phép đăng ký công khai (admin chỉ tạo qua seed/quản trị).
PublicRole = Literal["sale", "client"]


class UserRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)
    # Vai trò đăng ký: 'sale' (mặc định) hoặc 'client'. Admin không cho công khai.
    role: PublicRole = "sale"
    # Mã giới thiệu của upline (nếu đăng ký qua link ?ref=...)
    ref: Optional[str] = Field(default=None, max_length=32)
    # Khách hàng: danh sách dự án quan tâm (slug hoặc tên).
    projects_interested: list[str] = Field(default_factory=list)

    @field_validator("password")
    @classmethod
    def _strength(cls, v: str) -> str:
        if v.strip() != v:
            raise ValueError("Mật khẩu không được có khoảng trắng đầu/cuối")
        if v.isalpha() or v.isdigit():
            raise ValueError("Mật khẩu nên có cả chữ và số")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: UserRole = "sale"
    is_active: bool = True
    dob: Optional[str] = None
    region: Optional[str] = None
    referral_code: Optional[str] = None
    upline_email: Optional[str] = None
    projects_interested: list[str] = Field(default_factory=list)
    favorites: list[str] = Field(default_factory=list)
    telegram_chat_id: Optional[str] = None
    picture: Optional[str] = None
    created_at: datetime


class UserUpdate(BaseModel):
    """Payload PATCH /admin/users/{id} — admin đổi role / khoá-mở."""

    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ----- Google Sign-in -----

GoogleRole = Literal["client", "sale", "admin"]


class GoogleCallbackResponse(BaseModel):
    """Trả về cho endpoint POST /auth/google/verify (frontend gọi để lấy user)."""

    access_token: str
    user: UserOut
    is_new_user: bool = False
