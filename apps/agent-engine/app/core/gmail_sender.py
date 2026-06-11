"""Gửi email qua Gmail API (HTTPS) — thay SMTP khi Railway chặn cổng SMTP outbound.

Bối cảnh: container Railway CHẶN cổng SMTP outbound (smtp.gmail.com:587 timeout),
nên gửi mail qua SMTP không ổn định. Module này gửi mail qua Gmail REST API (chạy
trên HTTPS/443 — không bị chặn), TÁI DÙNG refresh token Google Workspace đã lấy
qua luồng "Kết nối Google Workspace" (app/core/workspace_token_store) — KHÔNG cần
mật khẩu/App Password SMTP.

Điều kiện hoạt động:
  • Đã cấu hình GOOGLE_OAUTH_CLIENT_ID/SECRET (như Sign-in / Connect Workspace).
  • Đã "Kết nối Google Workspace" (có refresh token trong store hoặc env).
  • Refresh token có scope `https://www.googleapis.com/auth/gmail.send`.

Vì scope gmail.send MỚI được thêm vào _WORKSPACE_SCOPES (app/core/google_oauth.py),
refresh token cũ CHƯA có quyền này — admin cần bấm "Kết nối Google Workspace" LẠI
1 lần để cấp quyền gửi mail.

AN TOÀN: KHÔNG bao giờ log/echo refresh token hay access token.
"""

from __future__ import annotations

import base64
import logging
import re
from email.message import EmailMessage
from typing import Any, Optional, Sequence, Union

import httpx

from app.core import workspace_token_store
from app.core.settings import settings

log = logging.getLogger("gmail_sender")

# Scope bắt buộc để gửi mail qua Gmail API.
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

# Nhận diện nhanh nội dung HTML (khi caller không nói rõ html=True/False).
_HTML_HINT = re.compile(r"<(html|body|div|p|br|a|table|h[1-6]|ul|ol|span|img)\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Lỗi rõ ràng để tầng trên phân biệt nguyên nhân
# ---------------------------------------------------------------------------
class GmailSenderError(RuntimeError):
    """Lỗi nền chung khi gửi qua Gmail API."""


class GmailNotConnected(GmailSenderError):
    """Chưa kết nối Google Workspace (không có refresh token)."""


class GmailScopeError(GmailSenderError):
    """Thiếu scope gmail.send — cần kết nối lại Google Workspace để cấp quyền."""


# ---------------------------------------------------------------------------
# Trạng thái / điều kiện sẵn sàng (KHÔNG gọi mạng — an toàn để dùng trong list view)
# ---------------------------------------------------------------------------
def _resolve_refresh_token() -> str:
    """Refresh token Workspace: ưu tiên store (luồng Connect), fallback env."""
    return (
        workspace_token_store.get_refresh_token()
        or settings.google_workspace_refresh_token
        or ""
    )


def connected_email() -> Optional[str]:
    """Email tài khoản Workspace đã Connect (nếu store có lưu), nếu không → None."""
    try:
        return workspace_token_store.get_status().get("email") or None
    except Exception:  # noqa: BLE001
        return None


def has_send_scope() -> bool:
    """True nếu refresh token đã lưu khai báo scope gmail.send (theo metadata store).

    Lưu ý: chỉ phản ánh metadata lúc Connect. Nếu store rỗng (đang dùng env refresh
    token) thì không biết chắc scope → trả False để buộc kiểm tra/kết nối lại.
    """
    try:
        scopes = workspace_token_store.get_status().get("scopes") or []
    except Exception:  # noqa: BLE001
        scopes = []
    return GMAIL_SEND_SCOPE in scopes


def is_connected() -> bool:
    """Đã kết nối Workspace (có client id/secret + refresh token).

    CHƯA chắc có scope gmail.send — dùng has_send_scope()/is_available() để chắc chắn.
    """
    return bool(
        settings.google_oauth_client_id
        and settings.google_oauth_client_secret
        and _resolve_refresh_token()
    )


def is_available() -> bool:
    """Đủ điều kiện gửi qua Gmail API: client id/secret + refresh token + scope gmail.send."""
    return is_connected() and has_send_scope()


# ---------------------------------------------------------------------------
# Lấy access token từ refresh token (đồng bộ — gọi được từ cả sync lẫn async)
# ---------------------------------------------------------------------------
def _get_access_token() -> str:
    """Đổi refresh token Workspace lấy access token mới (sống ~1h).

    Raise GmailNotConnected nếu chưa kết nối; GmailScopeError nếu Google báo thiếu
    scope; GmailSenderError cho lỗi khác. KHÔNG log token.
    """
    refresh_token = _resolve_refresh_token()
    if not (
        settings.google_oauth_client_id
        and settings.google_oauth_client_secret
        and refresh_token
    ):
        raise GmailNotConnected(
            "Chưa kết nối Google Workspace — không gửi được email qua Gmail API. "
            "Hãy bấm 'Kết nối Google Workspace'."
        )
    with httpx.Client(timeout=15.0) as http:
        res = http.post(
            _TOKEN_ENDPOINT,
            data={
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            headers={"Accept": "application/json"},
        )
    if res.status_code != 200:
        text = res.text or ""
        low = text.lower()
        # invalid_scope / scope thiếu → cần kết nối lại để cấp quyền gửi mail.
        if "scope" in low:
            raise GmailScopeError(
                "Cần kết nối lại Google Workspace để cấp quyền gửi email (gmail.send)."
            )
        raise GmailSenderError(
            f"Đổi refresh token lấy access token lỗi {res.status_code}: {text}"
        )
    token = res.json().get("access_token")
    if not token:
        raise GmailSenderError("Google không trả access_token cho refresh token Workspace.")
    return token


def verify_access() -> bool:
    """Kiểm tra nhanh: mint được access token từ refresh token không.

    Raise GmailNotConnected/GmailScopeError/GmailSenderError nếu không. Dùng cho
    nút 'Kiểm tra kết nối' khi chưa có địa chỉ nhận để gửi mail thử.
    """
    _get_access_token()
    return True


# ---------------------------------------------------------------------------
# Dựng MIME + gửi
# ---------------------------------------------------------------------------
def _normalize_recipients(to: Union[str, Sequence[str]]) -> list[str]:
    if to is None:
        return []
    if isinstance(to, str):
        return [to.strip()] if to.strip() else []
    return [str(t).strip() for t in to if str(t).strip()]


def _looks_like_html(text: str) -> bool:
    return bool(text and _HTML_HINT.search(text))


def send_email(
    to: Union[str, Sequence[str]],
    subject: str,
    html_or_text: str,
    from_addr: Optional[str] = None,
    *,
    html: Optional[bool] = None,
    cc: Optional[Union[str, Sequence[str]]] = None,
    bcc: Optional[Union[str, Sequence[str]]] = None,
) -> dict[str, Any]:
    """Gửi 1 email qua Gmail API. Hỗ trợ text + HTML, nhiều người nhận.

    Tham số:
      to            : 1 địa chỉ (str) hoặc danh sách địa chỉ.
      subject       : tiêu đề.
      html_or_text  : nội dung; là HTML hay text quyết định bởi `html`
                      (None → tự nhận diện theo thẻ HTML).
      from_addr     : địa chỉ gửi; None → settings.smtp_from, nếu trống thì BỎ
                      header From để Gmail dùng địa chỉ tài khoản đã Connect.
      html          : True=HTML, False=text, None=tự nhận diện.
      cc, bcc       : tuỳ chọn, str hoặc danh sách.

    Trả: {"id", "threadId", "to"}. Raise GmailNotConnected / GmailScopeError /
    GmailSenderError khi lỗi.
    """
    recipients = _normalize_recipients(to)
    if not recipients:
        raise GmailSenderError("Danh sách người nhận rỗng.")

    access_token = _get_access_token()

    sender = from_addr or settings.smtp_from or connected_email()

    msg = EmailMessage()
    if sender:
        msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    cc_list = _normalize_recipients(cc) if cc else []
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    bcc_list = _normalize_recipients(bcc) if bcc else []
    if bcc_list:
        msg["Bcc"] = ", ".join(bcc_list)
    msg["Subject"] = subject

    is_html = html if html is not None else _looks_like_html(html_or_text)
    if is_html:
        msg.set_content("Email này yêu cầu trình xem hỗ trợ HTML.")
        msg.add_alternative(html_or_text, subtype="html")
    else:
        msg.set_content(html_or_text)

    # Gmail API yêu cầu raw = base64url(toàn bộ RFC 2822 message).
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    with httpx.Client(timeout=20.0) as http:
        res = http.post(
            _SEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw},
        )
    if res.status_code == 403:
        # 403 ở bước gửi gần như luôn là thiếu/không đủ scope gmail.send.
        log.warning("Gmail API 403 (thiếu scope gmail.send?): %s", res.text[:300])
        raise GmailScopeError(
            "Cần kết nối lại Google Workspace để cấp quyền gửi email (gmail.send)."
        )
    if res.status_code not in (200, 201):
        raise GmailSenderError(f"Gmail API gửi lỗi {res.status_code}: {res.text}")

    data = res.json() if res.content else {}
    return {
        "id": data.get("id"),
        "threadId": data.get("threadId"),
        "to": recipients,
    }


async def send_email_async(
    to: Union[str, Sequence[str]],
    subject: str,
    html_or_text: str,
    from_addr: Optional[str] = None,
    *,
    html: Optional[bool] = None,
    cc: Optional[Union[str, Sequence[str]]] = None,
    bcc: Optional[Union[str, Sequence[str]]] = None,
) -> dict[str, Any]:
    """Wrapper async cho send_email (chạy trong threadpool, tránh chặn event loop)."""
    import asyncio

    return await asyncio.to_thread(
        send_email, to, subject, html_or_text, from_addr, html=html, cc=cc, bcc=bcc
    )
