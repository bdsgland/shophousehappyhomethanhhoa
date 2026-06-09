"""Google Sign-in (OAuth2) — Authorization Code flow.

Luồng:
  1. GET /auth/google/login → build URL Google + `state` (JWT ký, hết hạn 5')
  2. Google redirect về /auth/google/callback?code=...&state=...
  3. verify_state(state) chống CSRF/replay → exchange_code_for_userinfo(code)
  4. Lookup/tạo user → issue access token → redirect về frontend.

Chỉ xin scope non-sensitive `openid email profile` (không cần Google verify
app). Để trống GOOGLE_OAUTH_CLIENT_ID → `is_configured()` = False, endpoint trả
503; luồng email+password không bị ảnh hưởng.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
import jwt

from app.core.security import get_jwt_secret
from app.core.settings import settings

# Endpoint chuẩn của Google OAuth2 / OpenID Connect.
_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

_SCOPES = "openid email profile"
_STATE_PURPOSE = "google_oauth_state"
_STATE_TTL_SECONDS = 5 * 60  # chống replay: state chỉ sống 5 phút
_ALGORITHM = "HS256"

# ----- Luồng "Connect Google Workspace" (Calendar + Drive, lấy refresh token) -----
# Tái dùng đúng OAuth client của Sign-in (client_id/secret), chỉ khác scope +
# access_type=offline + prompt=consent để Google trả refresh_token.
_WORKSPACE_SCOPES = (
    "https://www.googleapis.com/auth/calendar.events "
    "https://www.googleapis.com/auth/drive.readonly"
)
_WORKSPACE_STATE_PURPOSE = "google_workspace_connect"
_WORKSPACE_STATE_TTL_SECONDS = 10 * 60  # 10 phút (đủ thời gian admin đăng nhập + allow)


def is_configured() -> bool:
    """True khi đã set đủ Client ID + Secret để chạy luồng Google."""
    return bool(settings.google_oauth_client_id and settings.google_oauth_client_secret)


# ----- state JWT (chống CSRF + mang context role/ref/next) -----

def make_state(
    *,
    role: str = "client",
    ref: Optional[str] = None,
    redirect_to: Optional[str] = None,
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "purpose": _STATE_PURPOSE,
        "role": role,
        "ref": ref,
        # Chỉ giữ path nội bộ (bắt đầu bằng "/") để tránh open-redirect.
        "next": redirect_to if (redirect_to or "").startswith("/") else None,
        "nonce": secrets.token_urlsafe(16),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=_STATE_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_ALGORITHM)


def verify_state(state: str) -> dict[str, Any]:
    """Giải mã + kiểm tra state. Raise jwt.InvalidTokenError nếu sai/hết hạn."""
    payload = jwt.decode(
        state,
        get_jwt_secret(),
        algorithms=[_ALGORITHM],
        options={"require": ["exp", "iat"]},
    )
    if payload.get("purpose") != _STATE_PURPOSE:
        raise jwt.InvalidTokenError("state purpose không hợp lệ")
    return payload


# ----- build authorization URL -----

def get_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": _SCOPES,
        "state": state,
        "access_type": "online",
        # Luôn hiện chọn tài khoản để khách đổi account dễ dàng.
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    return f"{_AUTH_ENDPOINT}?{urlencode(params)}"


# ----- Workspace Connect: redirect uri + state + auth url + token exchange -----

def workspace_redirect_uri() -> str:
    """Redirect URI cho callback Connect Workspace (production-stable).

    Ưu tiên settings.google_workspace_redirect_uri; nếu trống thì suy ra từ host
    của google_oauth_redirect_uri (luồng Sign-in đã chạy) → đổi path callback.
    """
    if settings.google_workspace_redirect_uri:
        return settings.google_workspace_redirect_uri
    base = settings.google_oauth_redirect_uri.rsplit("/auth/google/callback", 1)[0]
    return f"{base}/auth/workspace/callback"


def make_workspace_state(*, admin_id: str, admin_email: Optional[str] = None) -> str:
    """State JWT cho luồng Connect (purpose riêng, mang admin id/email + nonce)."""
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "purpose": _WORKSPACE_STATE_PURPOSE,
        "role": "admin",
        "admin_id": admin_id,
        "admin_email": admin_email,
        "nonce": secrets.token_urlsafe(16),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=_WORKSPACE_STATE_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_ALGORITHM)


def verify_workspace_state(state: str) -> dict[str, Any]:
    """Giải mã + kiểm tra state Connect. Raise jwt.InvalidTokenError nếu sai/hết hạn."""
    payload = jwt.decode(
        state,
        get_jwt_secret(),
        algorithms=[_ALGORITHM],
        options={"require": ["exp", "iat"]},
    )
    if payload.get("purpose") != _WORKSPACE_STATE_PURPOSE:
        raise jwt.InvalidTokenError("workspace state purpose không hợp lệ")
    return payload


def get_workspace_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": workspace_redirect_uri(),
        "response_type": "code",
        "scope": _WORKSPACE_SCOPES,
        "state": state,
        "access_type": "offline",   # bắt buộc để Google trả refresh_token
        "prompt": "consent",        # ép màn hình đồng ý → luôn có refresh_token
        "include_granted_scopes": "true",
    }
    return f"{_AUTH_ENDPOINT}?{urlencode(params)}"


def exchange_code_for_workspace_tokens(code: str) -> dict[str, Any]:
    """Đổi authorization code lấy token Workspace (gồm refresh_token).

    Trả nguyên dict token của Google: {access_token, refresh_token, scope, ...}.
    Raise RuntimeError nếu Google trả lỗi. KHÔNG log token.
    """
    with httpx.Client(timeout=15.0) as http:
        res = http.post(
            _TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": workspace_redirect_uri(),
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
    if res.status_code != 200:
        raise RuntimeError(
            f"Google token endpoint lỗi {res.status_code}: {res.text}"
        )
    return res.json()


# ----- exchange code → userinfo -----

def exchange_code_for_userinfo(code: str) -> dict[str, Any]:
    """Đổi authorization code lấy access token rồi GET userinfo.

    Trả dict: {sub, email, email_verified, name, picture, ...}.
    Raise RuntimeError nếu Google trả lỗi.
    """
    with httpx.Client(timeout=15.0) as http:
        token_res = http.post(
            _TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        if token_res.status_code != 200:
            raise RuntimeError(
                f"Google token endpoint lỗi {token_res.status_code}: {token_res.text}"
            )
        access_token = token_res.json().get("access_token")
        if not access_token:
            raise RuntimeError("Google không trả access_token")

        userinfo_res = http.get(
            _USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_res.status_code != 200:
            raise RuntimeError(
                f"Google userinfo lỗi {userinfo_res.status_code}: {userinfo_res.text}"
            )
        return userinfo_res.json()
