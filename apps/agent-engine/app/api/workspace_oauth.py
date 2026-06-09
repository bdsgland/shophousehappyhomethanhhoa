"""Luồng "Connect Google Workspace" trên PRODUCTION — admin bấm 1 nút để cấp
refresh token (Calendar + Drive) mà không cần script localhost / set env Railway.

Endpoints:
  GET /admin/google-workspace/connect?token=<JWT admin>
      → verify admin (qua token query param, đúng convention các WS) → build
        Google auth URL (scope calendar.events + drive.readonly, access_type
        offline, prompt consent) + state JWT → redirect 302 sang Google.
  GET /auth/workspace/callback?code&state[&error]
      → verify state → đổi code lấy refresh_token → lưu bền (workspace_token_store)
        → trả trang HTML "đã kết nối" (KHÔNG in token).
  GET /admin/google-workspace/status   (Bearer admin)
      → {connected, scopes, email, connected_at, redirect_uri}.

Tái dùng OAuth client của Sign-in (GOOGLE_OAUTH_CLIENT_ID/SECRET). Không log token.
"""

from __future__ import annotations

import traceback

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse

from app.api.deps import get_user_from_token, require_admin
from app.core import google_oauth, workspace_token_store

router = APIRouter(tags=["google-workspace"])


def _html(title: str, message: str, ok: bool) -> HTMLResponse:
    color = "#16a34a" if ok else "#dc2626"
    body = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;padding:0 24px;text-align:center">
  <div style="font-size:48px">{'✅' if ok else '⚠️'}</div>
  <h1 style="color:{color};font-size:20px">{title}</h1>
  <p style="color:#475569;line-height:1.6">{message}</p>
  <p style="color:#94a3b8;font-size:13px">Bạn có thể đóng tab này và quay lại trang quản trị.</p>
</body></html>"""
    return HTMLResponse(content=body, status_code=200)


@router.get("/admin/google-workspace/connect")
def workspace_connect(token: str = "") -> RedirectResponse:
    """Khởi tạo luồng Connect — redirect admin sang trang đồng ý của Google.

    Auth qua `?token=` (JWT admin) thay vì header Bearer vì đây là điều hướng
    trình duyệt — đúng convention các endpoint WS (/ws/admin-match, ...).
    """
    user = get_user_from_token(token)
    if not user or user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền quản trị viên",
        )
    if not google_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OAuth Google chưa được cấu hình trên máy chủ.",
        )
    state = google_oauth.make_workspace_state(
        admin_id=user["id"], admin_email=user.get("email")
    )
    url = google_oauth.get_workspace_authorization_url(state)
    return RedirectResponse(url, status_code=302)


@router.get("/auth/workspace/callback")
def workspace_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """Google redirect về đây sau khi admin đồng ý. Lưu refresh token bền."""
    if error:
        return _html("Kết nối bị huỷ", f"Google trả lỗi: {error}", ok=False)
    if not code or not state:
        return _html("Thiếu tham số", "Callback thiếu code/state.", ok=False)

    try:
        google_oauth.verify_workspace_state(state)
    except jwt.InvalidTokenError:
        return _html("State không hợp lệ", "Phiên kết nối đã hết hạn. Hãy bấm Kết nối lại.", ok=False)

    try:
        tokens = google_oauth.exchange_code_for_workspace_tokens(code)
    except Exception:  # noqa: BLE001 — lỗi mạng/Google → báo gọn, không 500 trần
        traceback.print_exc()
        return _html("Đổi mã thất bại", "Không đổi được code lấy token. Thử lại sau.", ok=False)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return _html(
            "Thiếu refresh token",
            "Google không trả refresh_token (tài khoản có thể đã cấp quyền trước "
            "đó). Vào myaccount.google.com/permissions gỡ quyền app rồi Kết nối lại.",
            ok=False,
        )

    scopes = (tokens.get("scope") or "").split()
    try:
        workspace_token_store.save_token(refresh_token=refresh_token, scopes=scopes)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return _html("Lưu token lỗi", "Không ghi được token vào máy chủ.", ok=False)

    return _html(
        "Đã kết nối Google Workspace thành công",
        "Hệ thống đã có quyền tạo Google Meet và đồng bộ Google Drive. "
        "Tính năng Live Match có thể tạo phòng họp ngay.",
        ok=True,
    )


@router.get("/admin/google-workspace/status")
def workspace_status(_admin: dict = Depends(require_admin)) -> dict:
    """Trạng thái kết nối Workspace cho UI admin (không kèm token)."""
    st = workspace_token_store.get_status()
    st["redirect_uri"] = google_oauth.workspace_redirect_uri()
    return st
