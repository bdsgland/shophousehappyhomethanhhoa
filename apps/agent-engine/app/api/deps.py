"""FastAPI dependencies — auth current user.

Ngoài JWT của user, hệ thống còn hỗ trợ "service token" qua header
`X-Internal-Token` để n8n / middleware gọi vào các endpoint nội bộ mà không cần
đăng nhập. So khớp với settings.internal_webhook_token (compare_digest).
"""

from __future__ import annotations

import secrets
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional

import jwt

from app.core import api_keys_store, user_store
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


# ---------------------------------------------------------------------------
# API KEYS — security scheme + principal ảo (khai báo SỚM để require_admin dùng)
# ---------------------------------------------------------------------------

# Security scheme khai báo cho OpenAPI → /docs hiện nút "Authorize" (Bearer).
# auto_error=False để dependency tự quyết (cho phép fallback X-API-Key / JWT admin).
bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="API Key hoặc JWT (Bearer)",
    description=(
        "Dán API key TOÀN QUYỀN (elc_sk_...) HOẶC JWT đăng nhập admin. "
        "Dùng để gọi trực tiếp các endpoint quản trị trên trang /docs này."
    ),
)
# Khai báo thêm header X-API-Key trong OpenAPI (tiện cho client dùng header riêng).
api_key_header_scheme = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
    scheme_name="X-API-Key",
    description="API key TOÀN QUYỀN (elc_sk_...) đặt ở header X-API-Key.",
)


def _api_key_principal(rec: dict) -> dict:
    """Principal 'ảo' khi xác thực bằng API key admin_full — role admin để bypass
    các kiểm tra phân quyền giống admin thật. Mang theo id/name khoá để audit.

    Cung cấp ĐỦ thuộc tính mà code downstream đọc từ require_admin (id, role,
    email, full_name) để KHÔNG vỡ (KeyError/AttributeError) ở finance/crm/admin..."""
    return {
        "id": f"apikey:{rec.get('id')}",
        "principal": "api_key",
        "role": "admin",
        "full_name": f"API Key — {rec.get('name')}",
        "email": "api-key@eurowindowlightcity.net",
        "api_key_id": rec.get("id"),
        "api_key_name": rec.get("name"),
        "scope": rec.get("scope"),
    }


def _resolve_api_key(
    bearer_val: Optional[str], x_api_key: Optional[str]
) -> Optional[str]:
    """Trích plaintext API key từ X-API-Key (ưu tiên) hoặc Bearer elc_sk_..."""
    if x_api_key and x_api_key.strip().startswith(api_keys_store.KEY_PREFIX):
        return x_api_key.strip()
    if bearer_val and bearer_val.startswith(api_keys_store.KEY_PREFIX):
        return bearer_val
    return None


def _api_key_admin_principal(presented_key: str) -> dict:
    """Verify API key + yêu cầu scope admin_full → trả principal admin ảo.

    api_keys_store.verify() đã cập nhật last_used_at (best-effort) khi khớp."""
    rec = api_keys_store.verify(presented_key)
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key không hợp lệ hoặc đã bị thu hồi",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if rec.get("scope") != "admin_full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key không đủ quyền (cần scope admin_full)",
        )
    return _api_key_principal(rec)


def require_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_api_key: Optional[str] = Depends(api_key_header_scheme),
) -> dict:
    """Dependency quản trị: chấp nhận JWT admin HOẶC API key scope admin_full.

    Thứ tự:
      1. API key (X-API-Key, hoặc Bearer bắt đầu bằng elc_sk_) hợp lệ + scope
         admin_full → principal admin ảo (id/email/full_name/role đầy đủ).
      2. Bearer là JWT thường → xác thực user, yêu cầu role admin.
      3. Thiếu hết → 401.

    Nhờ vậy MỌI router dùng require_admin tự động nhận API key, không phải sửa
    từng file. /docs vẫn có nút Authorize (HTTPBearer) cho cả JWT lẫn API key.
    """
    bearer_val = (
        credentials.credentials.strip()
        if credentials and credentials.credentials
        else None
    )

    presented_key = _resolve_api_key(bearer_val, x_api_key)
    if presented_key:
        return _api_key_admin_principal(presented_key)

    if bearer_val:
        user = get_current_user(f"Bearer {bearer_val}")
        if user.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Yêu cầu quyền quản trị viên",
            )
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Thiếu API key (X-API-Key / Bearer elc_sk_...) hoặc JWT admin",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_agency(user: dict = Depends(get_current_user)) -> dict:
    """Dependency cho chủ sàn ĐẠI LÝ F2 (role="agency"). Admin cũng được phép
    (để hỗ trợ/giám sát). Tài khoản agency tự đăng ký KHÔNG có quyền admin toàn
    nền tảng — chỉ thao tác trên hồ sơ/đội của CHÍNH MÌNH ở tầng endpoint."""
    if user.get("role") not in ("agency", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu tài khoản đại lý (agency)",
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


# ---------------------------------------------------------------------------
# API KEYS — khoá truy cập API/MCP TOÀN QUYỀN cho công cụ ngoài (OpenClaw, script)
# ---------------------------------------------------------------------------

# require_api_key_or_admin giữ nguyên CHỮ KÝ & hành vi cũ (MCP /admin/api-keys/whoami
# import tên này). Nay logic đã gộp hết vào require_admin nên đây chỉ là alias mỏng —
# mọi router dùng require_admin cũng tự động chấp nhận API key.
def require_api_key_or_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_api_key: Optional[str] = Depends(api_key_header_scheme),
) -> dict:
    """Alias của require_admin: API key scope admin_full HOẶC JWT admin."""
    return require_admin(credentials=credentials, x_api_key=x_api_key)


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
