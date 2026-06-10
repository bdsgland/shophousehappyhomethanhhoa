"""Client Chatwoot tái dùng (gọi RA Chatwoot REST API).

Tách riêng khỏi webhook.py (webhook là Chatwoot GỌI VÀO) để Omnichannel Inbox
+ Customer 360 cùng dùng chung một client gọi ra Chatwoot.

Triết lý an toàn:
  • Chưa cấu hình CHATWOOT_API_TOKEN  → KHÔNG raise. Trả None / configured=False.
  • Chatwoot down / lỗi mạng           → KHÔNG raise. Trả None + log.
  • Mọi hàm async, toàn bộ outbound HTTP đi qua _request() để dễ mock trong test.

Chuẩn hoá hội thoại Chatwoot về một "hình dạng thống nhất" (unified shape) để
gộp chung với hội thoại chat web nội bộ ở tầng router /admin/inbox.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from app.core import lead_store
from app.core.settings import settings

log = logging.getLogger(__name__)

# Tiền tố ID dùng để phân biệt nguồn khi gộp hội thoại đa kênh.
PREFIX_CHATWOOT = "cw"
PREFIX_WEB = "web"


# ---------------------------------------------------------------------------
# Cấu hình
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    return bool(settings.chatwoot_api_token)


def config_status() -> dict:
    """Trạng thái cấu hình để FE quyết định hiện hướng dẫn hay dữ liệu."""
    return {
        "configured": is_configured(),
        "base_url": settings.chatwoot_base_url,
        "account_id": settings.chatwoot_account_id,
        "detail": (
            None
            if is_configured()
            else "Chưa cấu hình CHATWOOT_API_TOKEN trên backend."
        ),
    }


# ---------------------------------------------------------------------------
# HTTP nền
# ---------------------------------------------------------------------------

async def _request(
    method: str,
    path: str,
    *,
    params: Optional[dict] = None,
    json: Optional[dict] = None,
) -> Optional[Any]:
    """Gọi REST API Chatwoot. Trả None nếu chưa cấu hình token hoặc lỗi outbound.

    Toàn bộ HTTP đi qua đây để dễ mock trong test + bảo đảm không làm sập caller.
    """
    if not settings.chatwoot_api_token:
        log.warning("[chatwoot] thiếu CHATWOOT_API_TOKEN — bỏ qua %s %s", method, path)
        return None

    import httpx

    url = f"{settings.chatwoot_base_url.rstrip('/')}{path}"
    headers = {
        "api_access_token": settings.chatwoot_api_token,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(
                method, url, params=params, json=json, headers=headers
            )
            resp.raise_for_status()
            return resp.json() if resp.content else None
    except Exception as exc:  # noqa: BLE001 — không để lỗi outbound làm sập inbox/360
        log.error("[chatwoot] %s %s lỗi: %s: %s", method, path, type(exc).__name__, exc)
        return None


def _account_path(suffix: str) -> str:
    return f"/api/v1/accounts/{settings.chatwoot_account_id}{suffix}"


# ---------------------------------------------------------------------------
# Trích xuất / chuẩn hoá
# ---------------------------------------------------------------------------

def _epoch_to_iso(value) -> Optional[str]:
    """Chatwoot trả epoch giây (int) cho timestamp. Đổi sang ISO8601 để FE +
    Customer 360 dùng nhất quán (shortDate/_parse_dt). Giá trị rỗng → None; đã là
    chuỗi ISO → giữ nguyên.
    """
    if value is None or value == "":
        return None
    try:
        return datetime.utcfromtimestamp(float(value)).isoformat() + "Z"
    except (ValueError, TypeError):
        return str(value)


def _sender_of(conv: dict) -> dict:
    meta = conv.get("meta") or {}
    sender = meta.get("sender") if isinstance(meta, dict) else None
    return sender if isinstance(sender, dict) else {}


def _channel_label(raw: Optional[str]) -> str:
    """Rút gọn channel kiểu 'Channel::FacebookPage' → 'facebook'."""
    if not raw:
        return "chatwoot"
    name = raw.split("::")[-1].lower()
    mapping = {
        "facebookpage": "facebook",
        "facebook": "facebook",
        "whatsapp": "whatsapp",
        "telegram": "telegram",
        "webwidget": "web",
        "web": "web",
        "api": "api",
        "email": "email",
        "twitterprofile": "twitter",
        "instagram": "instagram",
        "sms": "sms",
        "line": "zalo" if "zalo" in name else "line",
    }
    if "zalo" in name:
        return "zalo"
    return mapping.get(name, name or "chatwoot")


def normalize_conversation(conv: dict) -> dict:
    """Chuẩn hoá 1 hội thoại Chatwoot về hình dạng thống nhất + match CRM lead.

    Trả về dict gồm: id (đã gắn tiền tố), source, channel, contact{name,phone,email},
    last_message, last_at, status, assignee, crm_lead_id, crm_lead_name.
    """
    sender = _sender_of(conv)
    phone = sender.get("phone_number") or sender.get("phone")
    email = sender.get("email")
    last = conv.get("last_non_activity_message") or {}

    crm_lead_id = None
    crm_lead_name = None
    try:
        lead = lead_store.find_by_contact(phone, email)
        if lead:
            crm_lead_id = lead.get("id")
            crm_lead_name = lead.get("name") or lead.get("full_name")
    except Exception as exc:  # noqa: BLE001 — match CRM lỗi không được làm sập list
        log.warning("[chatwoot] match CRM lỗi: %s", exc)

    cw_id = conv.get("id")
    return {
        "id": f"{PREFIX_CHATWOOT}:{cw_id}",
        "raw_id": cw_id,
        "source": "chatwoot",
        "channel": _channel_label(conv.get("channel")),
        "contact": {
            "name": sender.get("name") or email or phone or "Khách",
            "phone": phone,
            "email": email,
        },
        "last_message": (last.get("content") or "")[:200],
        "last_at": _epoch_to_iso(
            conv.get("last_activity_at") or conv.get("created_at")
        ),
        "status": conv.get("status") or "open",
        "assignee": ((conv.get("meta") or {}).get("assignee") or {}).get("name"),
        "crm_lead_id": crm_lead_id,
        "crm_lead_name": crm_lead_name,
    }


# ---------------------------------------------------------------------------
# API cấp cao
# ---------------------------------------------------------------------------

async def list_conversations(status: str = "open") -> Optional[list[dict]]:
    """Danh sách hội thoại Chatwoot đã chuẩn hoá. None nếu chưa cấu hình/lỗi."""
    params = {} if status == "all" else {"status": status}
    data = await _request("GET", _account_path("/conversations"), params=params)
    if data is None:
        return None
    payload = data.get("data", data) if isinstance(data, dict) else {}
    raw = payload.get("payload", []) if isinstance(payload, dict) else []
    return [normalize_conversation(c) for c in raw if isinstance(c, dict)]


async def list_messages(conversation_id: int) -> Optional[list[dict]]:
    """Tin nhắn của 1 hội thoại Chatwoot, chuẩn hoá role/content/at."""
    data = await _request(
        "GET", _account_path(f"/conversations/{conversation_id}/messages")
    )
    if data is None:
        return None
    raw = data.get("payload", data) if isinstance(data, dict) else data
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for m in raw:
        if not isinstance(m, dict):
            continue
        # message_type: 0 incoming (khách), 1 outgoing (agent), 2 activity.
        mtype = m.get("message_type")
        if mtype == 2:
            continue  # bỏ qua activity (đổi trạng thái, assign...)
        role = "user" if mtype == 0 else "assistant"
        out.append(
            {
                "role": role,
                "content": m.get("content") or "",
                "at": _epoch_to_iso(m.get("created_at")),
                "sender": (m.get("sender") or {}).get("name"),
            }
        )
    return out


async def send_message(conversation_id: int, content: str) -> Optional[dict]:
    """Gửi tin nhắn outgoing qua đúng kênh của hội thoại. None nếu lỗi/chưa cấu hình."""
    return await _request(
        "POST",
        _account_path(f"/conversations/{conversation_id}/messages"),
        json={"content": content, "message_type": "outgoing", "private": False},
    )


async def conversations_for_lead(lead: dict, status: str = "all") -> list[dict]:
    """Các hội thoại Chatwoot khớp 1 lead theo SĐT/email (cho Customer 360).

    Trả [] khi chưa cấu hình / lỗi / không khớp — KHÔNG raise.
    """
    convos = await list_conversations(status=status)
    if not convos:
        return []
    nphone = lead_store.normalize_phone(lead.get("phone") or "")
    nemail = (lead.get("email") or "").strip().lower()
    matched: list[dict] = []
    for c in convos:
        cphone = lead_store.normalize_phone((c["contact"].get("phone") or ""))
        cemail = (c["contact"].get("email") or "").strip().lower()
        if (nphone and cphone and nphone == cphone) or (
            nemail and cemail and nemail == cemail
        ):
            matched.append(c)
    return matched
