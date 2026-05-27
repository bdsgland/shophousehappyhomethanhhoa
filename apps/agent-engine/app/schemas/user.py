"""Schema user (Sale/Admin) — đăng ký, đăng nhập, hồ sơ."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

UserRole = Literal["admin", "sale"]


class UserRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)

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
