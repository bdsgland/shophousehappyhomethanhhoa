"""Endpoint xác thực Sale (MVP).

- POST /auth/register  → tạo tài khoản
- POST /auth/login     → trả JWT
- GET  /auth/me        → thông tin tài khoản hiện tại (yêu cầu Bearer)
"""

from __future__ import annotations

import traceback
from typing import Optional
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse

from app.api.deps import get_current_user
from app.core import google_oauth, user_store
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.core.settings import settings
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
        # Chặn tự đăng ký admin — chỉ cho 'sale' hoặc 'client'.
        role = payload.role if payload.role in ("sale", "client") else "sale"
        upline_email = None
        # Khách hàng (client) không tham gia hệ thống giới thiệu/hoa hồng.
        if role == "sale" and payload.ref:
            upline = user_store.find_by_referral_code(payload.ref)
            if upline:
                upline_email = upline["email"]
        user = user_store.create_user(
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(payload.password),
            phone=payload.phone,
            role=role,
            upline_email=upline_email,
            projects_interested=payload.projects_interested,
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


# =====================================================================
# Google Sign-in (OAuth2) — addon, KHÔNG thay thế luồng email+password.
# =====================================================================

def _frontend_base(role: str) -> str:
    """Portal nào đọc token sau callback: admin → admin_url, còn lại → web."""
    return settings.admin_url if role == "admin" else settings.frontend_url


def _redirect_error(base: str, code: str) -> RedirectResponse:
    """Quay về trang callback frontend với mã lỗi để hiển thị thông báo."""
    return RedirectResponse(f"{base}/auth/callback#error={code}", status_code=302)


@router.get("/google/login")
def google_login(
    role: str = "client",
    ref: Optional[str] = None,
    redirect_to: Optional[str] = None,
) -> RedirectResponse:
    """Khởi tạo luồng OAuth — redirect 302 sang trang đồng ý của Google."""
    if not google_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Đăng nhập Google chưa được cấu hình trên máy chủ.",
        )
    role = role if role in ("client", "sale", "admin") else "client"
    state = google_oauth.make_state(role=role, ref=ref, redirect_to=redirect_to)
    url = google_oauth.get_authorization_url(state)
    return RedirectResponse(url, status_code=302)


@router.get("/google/callback")
def google_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
) -> RedirectResponse:
    """Google redirect về đây. Exchange code → user → issue JWT → về frontend."""
    if error:
        return _redirect_error(settings.frontend_url, error)
    if not code or not state:
        return _redirect_error(settings.frontend_url, "missing_params")

    # Verify state (chống CSRF/replay) — role chưa tin cậy trước bước này.
    try:
        st = google_oauth.verify_state(state)
    except jwt.InvalidTokenError:
        return _redirect_error(settings.frontend_url, "invalid_state")

    role = st.get("role") or "client"
    base = _frontend_base(role)
    next_path = st.get("next")

    try:
        info = google_oauth.exchange_code_for_userinfo(code)
    except Exception:  # noqa: BLE001 — lỗi mạng/Google → báo lỗi rõ ràng
        traceback.print_exc()
        return _redirect_error(base, "google_exchange_failed")

    email = (info.get("email") or "").strip().lower()
    google_id = info.get("sub")
    if not email or not google_id:
        return _redirect_error(base, "no_email")
    # Google trả email_verified=False rất hiếm; chỉ chặn khi rõ ràng False.
    if info.get("email_verified") is False:
        return _redirect_error(base, "email_unverified")

    full_name = (info.get("name") or "").strip() or email.split("@")[0]
    picture = info.get("picture")

    # Bảo vệ cổng admin: chỉ email thuộc workspace mới được role=admin.
    if role == "admin" and email.split("@")[-1] != settings.google_workspace_domain:
        return _redirect_error(base, "not_workspace")

    existing = user_store.find_by_google_id(google_id) or user_store.find_by_email(email)
    is_new = False
    try:
        if existing:
            # Chống leo thang quyền: client/sale không thành admin qua nút admin.
            if role == "admin" and existing.get("role") != "admin":
                return _redirect_error(base, "not_admin")
            user = (
                user_store.link_google_account(
                    existing["id"], google_id=google_id, picture=picture
                )
                or existing
            )
        else:
            upline_email = None
            if role == "sale" and st.get("ref"):
                upline = user_store.find_by_referral_code(st["ref"])
                if upline:
                    upline_email = upline["email"]
            new_role = role if role in ("client", "sale", "admin") else "client"
            user = user_store.create_user_from_google(
                email=email,
                full_name=full_name,
                google_id=google_id,
                picture=picture,
                role=new_role,
                upline_email=upline_email,
            )
            is_new = True
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return _redirect_error(base, "user_create_failed")

    if not user.get("is_active", True):
        return _redirect_error(base, "account_disabled")

    token, _ = create_access_token(
        subject=user["id"],
        extra_claims={"email": user["email"], "role": user.get("role", "client")},
    )
    fragment = {"token": token, "new_user": str(is_new).lower()}
    if next_path:
        fragment["next"] = next_path
    return RedirectResponse(
        f"{base}/auth/callback#{urlencode(fragment)}", status_code=302
    )


@router.post("/google/verify", response_model=UserOut)
def google_verify(user: dict = Depends(get_current_user)) -> UserOut:
    """Frontend gọi (kèm Bearer token) để xác thực + lấy thông tin user đầy đủ."""
    return UserOut(**user_store.public_view(user))
