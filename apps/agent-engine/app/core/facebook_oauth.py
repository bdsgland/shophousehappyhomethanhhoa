"""Verify Facebook Login access_token + lấy thông tin user qua Graph API.

Luồng (server-side verification):
1. Frontend dùng FB SDK → user click Login → SDK trả `accessToken` + `userID`.
2. Frontend POST `/auth/facebook/token` { access_token, role?, ref?, next? }.
3. Backend gọi Graph `debug_token` để verify token thuộc app này, chưa hết hạn,
   user_id khớp.
4. Backend gọi Graph `/me?fields=id,name,email,picture` → lấy user info.
5. Backend create/link user_store → issue JWT → trả `TokenOut`.

KHÔNG signup user nếu token không verify được hoặc trỏ về app khác.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.settings import settings

log = logging.getLogger("facebook_oauth")

_GRAPH = "https://graph.facebook.com/v19.0"


class FacebookAuthError(RuntimeError):
    """Lỗi xác thực Facebook (token sai, app_id mismatch, network)."""


def is_configured() -> bool:
    return bool(settings.facebook_app_id and settings.facebook_app_secret)


def _app_access_token() -> str:
    """App access token format: '<app_id>|<app_secret>'."""
    return f"{settings.facebook_app_id}|{settings.facebook_app_secret}"


async def verify_access_token(access_token: str) -> dict[str, Any]:
    """Gọi debug_token → trả payload data nếu token hợp lệ.

    Raise FacebookAuthError nếu invalid / expired / wrong app.
    """
    if not is_configured():
        raise FacebookAuthError(
            "Đăng nhập Facebook chưa được cấu hình (thiếu FACEBOOK_APP_ID/SECRET)."
        )
    if not access_token:
        raise FacebookAuthError("Thiếu access_token từ Facebook SDK.")

    async with httpx.AsyncClient(timeout=10.0) as http:
        res = await http.get(
            f"{_GRAPH}/debug_token",
            params={
                "input_token": access_token,
                "access_token": _app_access_token(),
            },
        )
    if res.status_code != 200:
        raise FacebookAuthError(
            f"Facebook debug_token lỗi {res.status_code}: {res.text[:200]}"
        )
    body = res.json().get("data") or {}
    if not body.get("is_valid"):
        raise FacebookAuthError(f"Token Facebook không hợp lệ: {body.get('error', {}).get('message', 'unknown')}")
    if str(body.get("app_id")) != str(settings.facebook_app_id):
        raise FacebookAuthError(
            "Token Facebook thuộc app khác — không khớp FACEBOOK_APP_ID của hệ thống."
        )
    return body


async def fetch_userinfo(access_token: str) -> dict[str, Any]:
    """Gọi Graph /me lấy id, name, email, picture (kèm verify token trước)."""
    debug = await verify_access_token(access_token)
    fb_user_id = debug.get("user_id")
    if not fb_user_id:
        raise FacebookAuthError("Facebook không trả user_id sau verify token.")

    async with httpx.AsyncClient(timeout=10.0) as http:
        res = await http.get(
            f"{_GRAPH}/me",
            params={
                "fields": "id,name,email,picture.width(256).height(256)",
                "access_token": access_token,
            },
        )
    if res.status_code != 200:
        raise FacebookAuthError(
            f"Facebook /me lỗi {res.status_code}: {res.text[:200]}"
        )
    me = res.json()
    if str(me.get("id")) != str(fb_user_id):
        raise FacebookAuthError("Facebook /me trả user_id khác với debug_token.")
    picture_url: Optional[str] = None
    pic = me.get("picture") or {}
    pic_data = pic.get("data") if isinstance(pic, dict) else None
    if isinstance(pic_data, dict):
        picture_url = pic_data.get("url")
    return {
        "facebook_id": str(me.get("id")),
        "email": (me.get("email") or "").strip().lower() or None,
        "name": (me.get("name") or "").strip() or None,
        "picture": picture_url,
    }
