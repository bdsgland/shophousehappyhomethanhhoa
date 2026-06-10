"""Đọc dữ liệu từ Google Trang tính (Sheets API v4) cho luồng Import khách CRM.

Tái dùng credential Workspace (refresh token đã lấy qua luồng "Connect Google
Workspace" trong app/api/workspace_oauth.py) — KHÔNG cần token riêng. Lấy access
token qua app/core/google_meet.get_workspace_access_token (đổi refresh→access).

⚠️ Scope: refresh token Workspace ban đầu chỉ có calendar.events + drive.readonly.
Sheets API cần thêm `https://www.googleapis.com/auth/spreadsheets.readonly`
(đã thêm vào _WORKSPACE_SCOPES trong google_oauth.py). Nếu token cũ thiếu scope
này → Google trả 403, ta bắt và báo admin connect lại Workspace.

Module CHỈ đọc giá trị (read-only), trả về list[list[str]] (dòng đầu = header).
Việc map cột / dedupe / tạo lead nằm ở customer_import.py + lead_store.py.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

import httpx

from app.core.google_meet import (
    get_workspace_access_token,
    is_configured as workspace_is_configured,
)

log = logging.getLogger(__name__)

_SHEETS_META_API = "https://sheets.googleapis.com/v4/spreadsheets/{sid}"
_SHEETS_VALUES_API = "https://sheets.googleapis.com/v4/spreadsheets/{sid}/values/{rng}"

# /spreadsheets/d/<ID>/edit  hoặc  ?id=<ID>
_SHEET_ID_PATTERNS = [
    re.compile(r"/spreadsheets/d/([a-zA-Z0-9_-]+)"),
    re.compile(r"[?&]id=([a-zA-Z0-9_-]+)"),
]

# Giới hạn an toàn (tránh đọc sheet quá lớn gây tốn bộ nhớ / chi phí AI sau này).
MAX_ROWS = 5000


class SheetsScopeError(RuntimeError):
    """Google trả 403 — refresh token thiếu scope spreadsheets.readonly."""


class SheetsNotConfiguredError(RuntimeError):
    """Chưa Connect Google Workspace (thiếu refresh token / client id/secret)."""


def extract_spreadsheet_id(url_or_id: str) -> Optional[str]:
    """Tách spreadsheetId từ link Google Sheet; chấp nhận cả khi truyền thẳng id."""
    text = (url_or_id or "").strip()
    if not text:
        return None
    for pat in _SHEET_ID_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(1)
    # Truyền thẳng id (không có "/" và khoảng trắng).
    if "/" not in text and " " not in text:
        return text
    return None


async def _get_token() -> str:
    if not workspace_is_configured():
        raise SheetsNotConfiguredError(
            "Chưa kết nối Google Workspace. Vào Admin → Cài đặt → Tích hợp để "
            "bấm 'Kết nối Google Workspace' trước khi import từ Google Trang tính."
        )
    return await get_workspace_access_token()


async def list_sheet_tabs(spreadsheet_id: str) -> list[str]:
    """Trả danh sách tên tab (sheet) trong spreadsheet. Tab đầu thường là dữ liệu."""
    token = await _get_token()
    url = _SHEETS_META_API.format(sid=spreadsheet_id)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            url,
            params={"fields": "sheets.properties.title"},
            headers={"Authorization": f"Bearer {token}"},
        )
    _raise_for_google(resp)
    data = resp.json()
    return [
        (s.get("properties") or {}).get("title", "")
        for s in data.get("sheets", [])
        if (s.get("properties") or {}).get("title")
    ]


async def read_sheet_values(
    spreadsheet_id: str, sheet_name: Optional[str] = None
) -> list[list[str]]:
    """Đọc toàn bộ giá trị 1 tab. Nếu sheet_name None → dùng tab đầu tiên.

    Trả list[list[str]] (đã cắt MAX_ROWS). Dòng đầu coi là header.
    """
    name = sheet_name
    if not name:
        tabs = await list_sheet_tabs(spreadsheet_id)
        name = tabs[0] if tabs else "Sheet1"

    token = await _get_token()
    # Range = tên tab → API trả toàn bộ vùng có dữ liệu của tab đó.
    # Tên tab có thể chứa khoảng trắng/ký tự đặc biệt → encode an toàn trong path.
    from urllib.parse import quote

    url = _SHEETS_VALUES_API.format(sid=spreadsheet_id, rng=quote(name, safe=""))
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            url,
            params={"majorDimension": "ROWS", "valueRenderOption": "UNFORMATTED_VALUE"},
            headers={"Authorization": f"Bearer {token}"},
        )
    _raise_for_google(resp)
    values = resp.json().get("values", [])
    # Ép mọi cell về str cho đồng nhất (số điện thoại, số nhà...).
    rows = [[("" if c is None else str(c)).strip() for c in row] for row in values]
    return rows[:MAX_ROWS]


def _raise_for_google(resp: httpx.Response) -> None:
    if resp.status_code == 200:
        return
    if resp.status_code == 403:
        raise SheetsScopeError(
            "Google trả 403 khi đọc Trang tính. Refresh token Workspace hiện thiếu "
            "scope 'spreadsheets.readonly'. Hãy vào Admin → Cài đặt → Tích hợp và "
            "bấm 'Kết nối Google Workspace' lại để cấp thêm quyền đọc Trang tính."
        )
    if resp.status_code == 404:
        raise RuntimeError(
            "Không tìm thấy Trang tính (404). Kiểm tra link đúng và tài khoản "
            "Workspace đã kết nối có quyền xem file này."
        )
    raise RuntimeError(
        f"Google Sheets API lỗi {resp.status_code}: {resp.text[:200]}"
    )
