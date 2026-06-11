"""Stringee Tổng đài client — sinh access token (REST + client) + gọi callout.

AN TOÀN: API Key Secret KÝ JWT access token ở SERVER, KHÔNG bao giờ lộ ra FE.
FE Web SDK chỉ nhận client access token TẠM THỜI (TTL ngắn) gắn `userId` = sale.

Token JWT (HS256, header cty="stringee-api;v=1"):
  • REST token  : payload {jti, iss=apiKeySid, exp, rest_api:true}   — gọi REST API.
  • Client token: payload {jti, iss=apiKeySid, exp, userId}          — Web SDK.

Thiếu cấu hình (STRINGEE_API_KEY_SID/SECRET, hoặc FROM_NUMBER cho callout) →
raise StringeeNotConfigured để endpoint trả "chưa cấu hình Stringee" (503),
KHÔNG để 500. Tài liệu: https://developer.stringee.com/docs/client-authentication
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

import jwt

from app.core import integrations_store
from app.core.settings import settings

# REST endpoint gọi ra (Call2). Header xác thực: X-STRINGEE-AUTH.
CALLOUT_URL = "https://api.stringee.com/v1/call2/callout"

# Header JWT bắt buộc của Stringee (ngoài typ/alg mặc định của PyJWT).
_JWT_EXTRA_HEADERS = {"cty": "stringee-api;v=1"}


class StringeeNotConfigured(RuntimeError):
    """Thiếu cấu hình Stringee (API key SID/Secret hoặc số tổng đài)."""


class StringeeError(RuntimeError):
    """Lỗi khi gọi REST API Stringee (callout, ...)."""


def _cfg() -> dict:
    """{api_key_sid, api_key_secret, from_number} — store (integrations) → env."""
    return integrations_store.get_credential("stringee")


def is_configured() -> bool:
    """Đã đủ API key để sinh token chưa (SID + Secret)."""
    c = _cfg()
    return bool(c.get("api_key_sid") and c.get("api_key_secret"))


def _require_keys() -> tuple[str, str]:
    c = _cfg()
    sid = c.get("api_key_sid")
    secret = c.get("api_key_secret")
    if not sid or not secret:
        raise StringeeNotConfigured(
            "Chưa cấu hình Stringee — cần đặt STRINGEE_API_KEY_SID và "
            "STRINGEE_API_KEY_SECRET."
        )
    return sid, secret


def _encode(payload: dict[str, Any], secret: str) -> str:
    token = jwt.encode(
        payload, secret, algorithm="HS256", headers=_JWT_EXTRA_HEADERS
    )
    # PyJWT>=2 trả str; phòng PyJWT<2 trả bytes.
    return token.decode("utf-8") if isinstance(token, bytes) else token


def _base_payload(sid: str, expires_seconds: int) -> dict[str, Any]:
    now = int(time.time())
    return {
        "jti": f"{sid}-{uuid.uuid4().hex}",
        "iss": sid,
        "exp": now + max(60, int(expires_seconds)),
    }


def generate_rest_token(expires_seconds: int = 3600) -> str:
    """Access token cho REST API (rest_api=true). Dùng cho callout / lấy ghi âm."""
    sid, secret = _require_keys()
    payload = _base_payload(sid, expires_seconds)
    payload["rest_api"] = True
    return _encode(payload, secret)


def generate_client_token(user_id: str, expires_seconds: int = 3600) -> str:
    """Client access token cho Web SDK của sale (userId định danh người dùng)."""
    sid, secret = _require_keys()
    payload = _base_payload(sid, expires_seconds)
    payload["userId"] = str(user_id)
    return _encode(payload, secret)


def callout(
    *,
    to_number: str,
    from_number: Optional[str] = None,
    answer_url: Optional[str] = None,
    custom_data: Optional[str] = None,
    timeout: float = 20.0,
) -> dict:
    """Gọi ra từ số tổng đài (from) tới SĐT khách (to) qua Call2 REST callout.

    `answer_url` (nếu có) → Stringee GET SCCO điều khiển cuộc gọi (bật ghi âm +
    kết nối). `custom_data` được Stringee echo lại trong sự kiện (clientCustomData)
    để khớp cuộc gọi với contact log. Trả JSON phản hồi của Stringee.
    Raise StringeeNotConfigured nếu thiếu key/số; StringeeError nếu lỗi HTTP.
    """
    _require_keys()
    frm = (from_number or _cfg().get("from_number") or "").strip()
    if not frm:
        raise StringeeNotConfigured(
            "Chưa cấu hình STRINGEE_FROM_NUMBER (số tổng đài để gọi đi)."
        )
    to = (to_number or "").strip()
    if not to:
        raise StringeeError("Thiếu số điện thoại người nhận (to).")

    import httpx

    body: dict[str, Any] = {
        "from": {"type": "external", "number": frm, "alias": frm},
        "to": [{"type": "external", "number": to, "alias": to}],
    }
    if answer_url:
        body["answer_url"] = answer_url
    if custom_data:
        # Stringee echo lại field này trong call event (clientCustomData).
        body["custom_data"] = str(custom_data)

    headers = {
        "X-STRINGEE-AUTH": generate_rest_token(),
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(CALLOUT_URL, json=body, headers=headers)
            resp.raise_for_status()
            return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:  # 4xx/5xx từ Stringee
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        raise StringeeError(f"Stringee callout lỗi HTTP {exc.response.status_code}: {detail}") from exc
    except httpx.HTTPError as exc:  # mạng/timeout
        raise StringeeError(f"Stringee callout lỗi kết nối: {exc}") from exc
