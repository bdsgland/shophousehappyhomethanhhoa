"""Endpoint portal cá nhân cho Sale (`/me`).

- GET  /me                  → thông tin tài khoản đầy đủ
- PATCH /me                 → cập nhật full_name, phone, dob, region
- POST /me/change-password  → đổi mật khẩu
- GET  /me/commission       → số liệu hoa hồng + cơ chế 5 bậc lũy tiến
- GET  /me/referrals        → cây giới thiệu (upline + downlines)

Hoa hồng hiện ở giai đoạn khung: doanh số/giao dịch trả mock rỗng, nhưng cơ chế
bậc lũy tiến (50% → 55% → 60% → 65% theo số căn chốt) đã tính thật từ closed_count.
"""

from __future__ import annotations

import traceback
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core import user_store
from app.core.security import hash_password, verify_password

router = APIRouter(prefix="/me", tags=["me"])


# ----- Request models -----

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    dob: Optional[str] = Field(default=None, max_length=20)
    region: Optional[str] = Field(default=None, max_length=60)


class ChangePassword(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# ----- Helpers -----

# Bậc lũy tiến frontline: số căn đã chốt → % hoa hồng (trên phần 50–65% của Sale).
_LUY_TIEN = [50, 55, 60, 65]


def _frontline_tier(closed_count: int) -> tuple[int, int]:
    """Trả về (luy_tien_level 1..4, luy_tien_pct)."""
    level = min(max(closed_count + 1, 1), 4)
    return level, _LUY_TIEN[level - 1]


# ----- Endpoints -----

@router.get("")
def get_me(user: dict = Depends(get_current_user)) -> dict:
    return user_store.public_view(user)


@router.patch("")
def update_me(payload: ProfileUpdate, user: dict = Depends(get_current_user)) -> dict:
    updated = user_store.update_profile(
        user["id"],
        full_name=payload.full_name,
        phone=payload.phone,
        dob=payload.dob,
        region=payload.region,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    return user_store.public_view(updated)


@router.post("/change-password")
def change_password(
    payload: ChangePassword, user: dict = Depends(get_current_user)
) -> dict:
    if not verify_password(payload.old_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng")
    if payload.new_password.strip() != payload.new_password:
        raise HTTPException(
            status_code=400, detail="Mật khẩu mới không được có khoảng trắng đầu/cuối"
        )
    if payload.new_password.isalpha() or payload.new_password.isdigit():
        raise HTTPException(status_code=400, detail="Mật khẩu mới nên có cả chữ và số")
    try:
        user_store.set_password(user["id"], hash_password(payload.new_password))
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Lỗi đổi mật khẩu: {type(e).__name__}: {e}"
        )
    return {"ok": True, "message": "Đã cập nhật mật khẩu"}


@router.get("/commission")
def get_commission(user: dict = Depends(get_current_user)) -> dict:
    # Giai đoạn khung: chưa có giao dịch thực → mock rỗng, số liệu = 0.
    closed_count = 0
    level, pct = _frontline_tier(closed_count)
    return {
        "total_received": 0,
        "this_month": 0,
        "pending": 0,
        "closed_count": closed_count,
        "current_tier": "sale_frontline",
        "current_tier_label": "Sale Frontline",
        "luy_tien_level": level,
        "luy_tien_pct": pct,
        "referral_commission_pct": 5,  # % của hoa hồng khi mang khách (data) về
        "transactions": [],
        "referral_deals": [],
        "monthly_revenue": [0, 0, 0, 0, 0, 0],
    }


@router.get("/referrals")
def get_referrals(user: dict = Depends(get_current_user)) -> dict:
    upline = None
    if user.get("upline_email"):
        up = user_store.find_by_email(user["upline_email"])
        if up:
            upline = {
                "email": up["email"],
                "full_name": up["full_name"],
                "role": up.get("role", "sale"),
                "phone": up.get("phone"),
            }

    downline_users = user_store.list_downlines(user["email"])
    downlines = [
        {
            "email": d["email"],
            "full_name": d["full_name"],
            "role": d.get("role", "sale"),
            "phone": d.get("phone"),
            "region": d.get("region"),
            "closed_count": 0,  # mock — chưa có giao dịch
            "commission_to_me": 0,
        }
        for d in downline_users
    ]

    return {
        "referral_code": user.get("referral_code"),
        "upline": upline,
        "downlines": downlines,
        "team_size": len(downlines),
        "team_revenue": 0,
        "team_commission_to_me": 0,
    }
