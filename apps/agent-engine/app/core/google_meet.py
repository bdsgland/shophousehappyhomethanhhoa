"""Tạo Google Meet qua Calendar API — dùng cho Live Match.

Khác với app/core/google_oauth.py (Sign-in, chỉ scope openid/email/profile),
module này dùng 1 **refresh token của tài khoản Workspace** (lấy 1 lần, scope
`calendar.events`) để tạo sự kiện lịch kèm Meet link.

Lấy refresh token: chạy scripts/get_google_refresh_token.py (in ra refresh
token), rồi đặt env GOOGLE_WORKSPACE_REFRESH_TOKEN trên Railway. KHÔNG commit.

Nếu chưa cấu hình → create_meet_event raise RuntimeError; tầng match_service bắt
lỗi và fallback "sale sẽ gọi điện" thay vì hard-code link.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx

from app.core.settings import settings

log = logging.getLogger("google_meet")

_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_CALENDAR_EVENTS_ENDPOINT = (
    "https://www.googleapis.com/calendar/v3/calendars/{calendar}/events"
)


def _resolve_refresh_token() -> str:
    """Refresh token Workspace: ưu tiên store (luồng Connect), fallback env.

    Nhờ vậy admin chỉ cần bấm "Kết nối Google Workspace" 1 lần là chạy được,
    KHÔNG cần set GOOGLE_WORKSPACE_REFRESH_TOKEN trên Railway nữa.
    """
    from app.core import workspace_token_store

    return (
        workspace_token_store.get_refresh_token()
        or settings.google_workspace_refresh_token
        or ""
    )


def _resolve_workspace_client_creds() -> tuple[str, str]:
    """Trả (client_id, client_secret) dùng cho exchange Workspace refresh token.

    Ưu tiên cặp google_workspace_client_id/_secret (khi anh dùng OAuth Client RIÊNG
    cho Drive/Calendar/Meet — khớp client phát hành refresh_token). Fallback về
    google_oauth_client_id/_secret (cùng client với Sign-in) khi để trống.
    """
    return (
        settings.google_workspace_client_id or settings.google_oauth_client_id,
        settings.google_workspace_client_secret or settings.google_oauth_client_secret,
    )


def is_configured() -> bool:
    """True khi đủ client id/secret + refresh token (store hoặc env) để gọi Calendar API."""
    cid, csec = _resolve_workspace_client_creds()
    return bool(cid and csec and _resolve_refresh_token())


async def get_workspace_access_token() -> str:
    """Đổi refresh token Workspace lấy access token mới (sống ~1h).

    Raise RuntimeError nếu chưa cấu hình hoặc Google trả lỗi.
    """
    if not is_configured():
        raise RuntimeError(
            "Chưa cấu hình Google Workspace (thiếu GOOGLE_WORKSPACE_REFRESH_TOKEN "
            "hoặc client id/secret) — không tạo được Google Meet."
        )
    cid, csec = _resolve_workspace_client_creds()
    async with httpx.AsyncClient(timeout=15.0) as http:
        res = await http.post(
            _TOKEN_ENDPOINT,
            data={
                "client_id": cid,
                "client_secret": csec,
                "refresh_token": _resolve_refresh_token(),
                "grant_type": "refresh_token",
            },
            headers={"Accept": "application/json"},
        )
    if res.status_code != 200:
        raise RuntimeError(
            f"Google token (refresh) lỗi {res.status_code}: {res.text}"
        )
    token = res.json().get("access_token")
    if not token:
        raise RuntimeError("Google không trả access_token cho refresh token Workspace")
    return token


async def create_meet_event(
    *,
    customer_email: str,
    sale_email: str,
    summary: str = "ELC — Tư vấn trực tuyến",
    duration_minutes: int = 30,
) -> dict[str, Any]:
    """Tạo Calendar event có Google Meet link.

    Trả: {meet_link, event_id, start, end}. Raise RuntimeError nếu thất bại.
    """
    access_token = await get_workspace_access_token()

    now = datetime.now(tz=timezone.utc)
    end = now + timedelta(minutes=duration_minutes)
    request_id = str(uuid.uuid4())

    attendees = []
    for email in (customer_email, sale_email):
        if email and "@" in email:
            attendees.append({"email": email})

    event_body = {
        "summary": summary,
        "description": (
            "Cuộc tư vấn trực tuyến tự động ghép qua hệ thống Live Match của "
            "Eurowindow Light City."
        ),
        "start": {"dateTime": now.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"},
        "end": {"dateTime": end.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"},
        "attendees": attendees,
        "conferenceData": {
            "createRequest": {
                "requestId": request_id,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }

    # URL-encode an toàn cho cả "primary" lẫn email (vd có ký tự @, +).
    calendar = settings.google_workspace_calendar_email or "primary"
    url = _CALENDAR_EVENTS_ENDPOINT.format(calendar=quote(calendar, safe=""))
    async with httpx.AsyncClient(timeout=20.0) as http:
        res = await http.post(
            url,
            params={"conferenceDataVersion": 1, "sendUpdates": "all"},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=event_body,
        )
    if res.status_code not in (200, 201):
        # Log nguyên văn lỗi Google (403 Calendar API tắt / thiếu scope / sai lịch…)
        # để soi trong Railway log trước khi raise.
        log.error(
            "Google Calendar tạo sự kiện lỗi %s (calendar=%s): %s",
            res.status_code, calendar, res.text,
        )
        raise RuntimeError(f"Google Calendar tạo sự kiện lỗi {res.status_code}: {res.text}")

    event = res.json()
    meet_link = _extract_meet_link(event)
    if not meet_link:
        raise RuntimeError("Sự kiện tạo xong nhưng không có Meet link (entryPoints rỗng)")
    return {
        "meet_link": meet_link,
        "event_id": event.get("id"),
        "start": (event.get("start") or {}).get("dateTime"),
        "end": (event.get("end") or {}).get("dateTime"),
    }


def _extract_meet_link(event: dict) -> str | None:
    """Lấy URI video từ conferenceData.entryPoints (ưu tiên type=video)."""
    conf = event.get("conferenceData") or {}
    entry_points = conf.get("entryPoints") or []
    for ep in entry_points:
        if ep.get("entryPointType") == "video" and ep.get("uri"):
            return ep["uri"]
    # Fallback: hangoutLink (trường cũ) nếu có.
    return event.get("hangoutLink")
