"""FastAPI dependencies — auth current user.

Ngoài JWT của user, hệ thống còn hỗ trợ "service token" qua header
`X-Internal-Token` để n8n / middleware gọi vào các endpoint nội bộ mà không cần
đăng nhập. So khớp với settings.internal_webhook_token (compare_digest).
"""

from __future__ import annotations

import secrets
from fastapi import Depends, Header, HTTPException, status
from typing import Optional

import jwt

from app.core import user_store
from app.core.security import decode_access_token
from app.core.settings import settings

# User "ảo" trả về khi xác thực bằng service token (không phải user thật).
_SERVICE_PRINCIPAL = {"id": "service", "role": "service", "full_name": "n8n service"}


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu token Bearer",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token thiếu subject")
    user = user_store.find_by_id(sub)
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khoá")
    return user


CurrentUser = Depends(get_current_user)


def get_user_from_token(token: Optional[str]) -> Optional[dict]:
    """Xác thực JWT lấy từ query param (dùng cho WebSocket — không có header).

    Trả user dict nếu hợp lệ + tài khoản còn mở; None nếu sai/hết hạn/khoá.
    KHÔNG raise HTTPException (WS không dùng được) — caller tự đóng socket.
    """
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    user = user_store.find_by_id(sub)
    if not user or not user.get("is_active", True):
        return None
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency đảm bảo user hiện tại có role admin."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền quản trị viên",
        )
    return user


def require_sale(user: dict = Depends(get_current_user)) -> dict:
    """Dependency đảm bảo user hiện tại là sale (admin cũng được phép thao tác).

    Admin được coi là "super sale" để thao tác trên CRM của chính mình khi cần
    test; phân tách dữ liệu (sale chỉ thấy lead của mình) xử lý ở tầng endpoint.
    """
    if user.get("role") not in ("sale", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền sale",
        )
    return user


def _is_valid_service_token(token: Optional[str]) -> bool:
    """So khớp X-Internal-Token với secret cấu hình (an toàn timing)."""
    if not token or not settings.internal_webhook_token:
        return False
    return secrets.compare_digest(token, settings.internal_webhook_token)


def require_admin_or_service(
    authorization: Optional[str] = Header(default=None),
    x_internal_token: Optional[str] = Header(default=None),
) -> dict:
    """Cho phép admin (JWT) HOẶC n8n/middleware (service token) gọi vào."""
    if _is_valid_service_token(x_internal_token):
        return dict(_SERVICE_PRINCIPAL)
    user = get_current_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền quản trị viên",
        )
    return user


def require_user_or_service(
    authorization: Optional[str] = Header(default=None),
    x_internal_token: Optional[str] = Header(default=None),
) -> dict:
    """Cho phép user đã đăng nhập HOẶC service token (n8n) gọi vào."""
    if _is_valid_service_token(x_internal_token):
        return dict(_SERVICE_PRINCIPAL)
    return get_current_user(authorization)


# ---------------------------------------------------------------------------
# OpenClaw "God-Mode" — token đặc biệt cho AI Assistant của CEO (prefix /openclaw)
# ---------------------------------------------------------------------------

# Principal "ảo" trả về khi xác thực bằng OPENCLAW_GOD_TOKEN. KHÔNG phải user
# thật — role "god" bypass mọi kiểm tra phân quyền, chỉ dùng nội bộ cho bridge.
_OPENCLAW_PRINCIPAL = {
    "id": "openclaw",
    "principal": "openclaw_ceo",
    "role": "god",
    "full_name": "OpenClaw — Trợ lý AI CEO",
    "email": "openclaw@eurowindowlightcity.net",
}


def verify_openclaw_token(
    x_openclaw_token: Optional[str] = Header(default=None),
) -> dict:
    """Xác thực OpenClaw God-Mode token (header X-Openclaw-Token).

    So khớp an toàn timing với settings.openclaw_god_token. Nếu token CHƯA được
    cấu hình (trống) thì TOÀN BỘ bridge bị khoá (403) — fail closed, tránh để hở
    quyền god khi quên set env.
    """
    expected = settings.openclaw_god_token
    if not expected or not x_openclaw_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OpenClaw token required",
        )
    if not secrets.compare_digest(x_openclaw_token, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid OpenClaw token",
        )
    return dict(_OPENCLAW_PRINCIPAL)


def optional_service_guard(
    x_internal_token: Optional[str] = Header(default=None),
) -> dict:
    """Bảo vệ webhook nội bộ.

    - Nếu đã cấu hình INTERNAL_WEBHOOK_TOKEN → bắt buộc khớp (401 nếu sai).
    - Nếu chưa cấu hình (dev) → cho qua nhưng coi là chưa xác thực.
    """
    if not settings.internal_webhook_token:
        return {"authenticated": False, "role": "service"}
    if _is_valid_service_token(x_internal_token):
        return {"authenticated": True, "role": "service"}
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Thiếu hoặc sai X-Internal-Token",
    )
