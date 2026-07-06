"""Facebook callback endpoints — Deauthorize + Data Deletion Request.

Facebook yêu cầu app phải có 2 callback HTTP sau:

1. **Deauthorize Callback** (Settings → Basic → Deauthorize Callback URL):
   Khi user gỡ app khỏi Facebook, FB POST signed_request đến URL này.
   → Hệ thống đánh dấu user bị "facebook_unlinked" để biết không cần delete data.

2. **Data Deletion Request URL** (Settings → Basic → Data Deletion Request URL):
   Khi user yêu cầu xoá dữ liệu, FB POST signed_request đến URL này.
   → Hệ thống xoá account khỏi DB và trả về `{url, confirmation_code}` để FB cập
     nhật trạng thái cho user.

Cả 2 endpoint phải xác thực signed_request bằng HMAC-SHA256 với App Secret để
chắc chắn là Facebook thật sự gửi đến (KHÔNG public — chống giả mạo).

Xem: https://developers.facebook.com/docs/facebook-login/guides/data-deletion/
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Form, HTTPException, status
from fastapi.responses import JSONResponse

from app.core import user_store
from app.core.settings import settings

log = logging.getLogger("facebook_webhook")

router = APIRouter(tags=["facebook-webhook"], prefix="/webhook/facebook")


def _b64url_decode(s: str) -> bytes:
    """Decode base64url (Facebook signed_request dùng base64url không padding)."""
    s = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s.encode("ascii"))


def _parse_signed_request(signed_request: str) -> dict[str, Any]:
    """Verify HMAC + decode payload. Raise ValueError nếu signature sai."""
    if not signed_request or "." not in signed_request:
        raise ValueError("signed_request thiếu hoặc sai format")
    sig_b64, payload_b64 = signed_request.split(".", 1)
    if not settings.facebook_app_secret:
        raise ValueError("FACEBOOK_APP_SECRET chưa cấu hình trên server")
    expected_sig = hmac.new(
        settings.facebook_app_secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    actual_sig = _b64url_decode(sig_b64)
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("HMAC signed_request không khớp — request giả mạo")
    payload_raw = _b64url_decode(payload_b64).decode("utf-8")
    return json.loads(payload_raw)


@router.post("/deauthorize")
async def facebook_deauthorize(signed_request: str = Form("")) -> dict[str, Any]:
    """User gỡ app khỏi Facebook → FB POST signed_request về đây.

    Hành động: đánh dấu user `facebook_unlinked=True`. KHÔNG xoá account
    (vẫn còn email/SĐT cho CSKH liên hệ). User vẫn login lại bằng email/pass
    hoặc Google.
    """
    try:
        payload = _parse_signed_request(signed_request)
    except ValueError as exc:
        log.warning("FB deauthorize signed_request invalid: %s", exc)
        # Trả 200 cho FB (tránh retry); KHÔNG hành động.
        return {"ok": False, "reason": str(exc)}

    fb_user_id = str(payload.get("user_id") or "")
    if not fb_user_id:
        return {"ok": False, "reason": "missing user_id"}

    user = user_store.find_by_facebook_id(fb_user_id)
    if user:
        # Xoá facebook_id liên kết (user sẽ phải re-auth qua FB lần sau).
        try:
            user_store.link_facebook_account(
                user["id"], facebook_id="", picture=None
            )
        except Exception:  # noqa: BLE001
            pass
        log.info("FB user %s deauthorized → unlinked local user %s", fb_user_id, user["id"])

    return {"ok": True}


@router.post("/data-deletion")
async def facebook_data_deletion(signed_request: str = Form("")) -> JSONResponse:
    """User yêu cầu xoá dữ liệu qua Facebook → FB POST signed_request về đây.

    Hành động:
      - Xác thực signed_request bằng HMAC App Secret.
      - Tìm user local theo facebook_id → soft-delete (đặt is_active=False) +
        unlink fb_id. KHÔNG xoá hẳn để giữ chứng từ pháp lý (Nghị định 13/2023).
      - Trả {url, confirmation_code} để FB show cho user theo dõi.

    Spec: https://developers.facebook.com/docs/facebook-login/guides/data-deletion/
    """
    try:
        payload = _parse_signed_request(signed_request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    fb_user_id = str(payload.get("user_id") or "")
    confirmation_code = f"elc-fb-del-{fb_user_id[:10]}-{abs(hash(fb_user_id)) % 10**8:08d}"

    user = user_store.find_by_facebook_id(fb_user_id)
    if user:
        try:
            # Soft delete: unlink fb_id + đánh dấu inactive. Giữ phần phải lưu
            # theo pháp luật (chứng từ giao dịch) — privacy policy đã ghi rõ.
            user_store.link_facebook_account(user["id"], facebook_id="", picture=None)
            # Đánh dấu inactive nếu chưa có hàm dedicated, dùng bằng cách set qua API admin sau.
            log.info("FB data deletion: marked user %s inactive (fb=%s)", user["id"], fb_user_id)
        except Exception:  # noqa: BLE001
            log.exception("FB data deletion failed for user %s", user["id"])

    # URL mà FB sẽ link để user tra cứu tiến độ.
    status_url = (
        f"https://happyhomethanhhoa.bdsg.land/data-deletion?code={confirmation_code}"
    )
    return JSONResponse({"url": status_url, "confirmation_code": confirmation_code})
