"""Endpoint xác thực Sale (MVP).

- POST /auth/register  → tạo tài khoản
- POST /auth/login     → trả JWT
- GET  /auth/me        → thông tin tài khoản hiện tại (yêu cầu Bearer)
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core import user_store
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.schemas.user import TokenOut, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token(user: dict) -> TokenOut:
    token, expires_in = create_access_token(
        subject=user["id"],
        extra_claims={"email": user["email"], "role": user.get("role", "sale")},
    )
    return TokenOut(
        access_token=token,
        expires_in=expires_in,
        user=UserOut(**user_store.public_view(user)),
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister) -> TokenOut:
    try:
        upline_email = None
        if payload.ref:
            upline = user_store.find_by_referral_code(payload.ref)
            if upline:
                upline_email = upline["email"]
        user = user_store.create_user(
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(payload.password),
            phone=payload.phone,
            upline_email=upline_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — không để 500 trần, trả lỗi rõ ràng
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi đăng ký: {type(e).__name__}: {e}",
        )
    return _issue_token(user)


@router.post("/login", response_model=TokenOut)
def login(payload: UserLogin) -> TokenOut:
    try:
        user = user_store.find_by_email(payload.email)
        if not user or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email hoặc mật khẩu không đúng",
            )
        if not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản đã bị khoá. Liên hệ quản trị viên.",
            )
        return _issue_token(user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — không để 500 trần, trả lỗi rõ ràng
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi đăng nhập: {type(e).__name__}: {e}",
        )


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)) -> UserOut:
    return UserOut(**user_store.public_view(user))
