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

from app.core import integrations_store, lead_store
from app.core.settings import settings

log = logging.getLogger(__name__)

# Tiền tố ID dùng để phân biệt nguồn khi gộp hội thoại đa kênh.
PREFIX_CHATWOOT = "cw"
PREFIX_WEB = "web"


# ---------------------------------------------------------------------------
# Cấu hình — resolve store-first-then-env (admin nhập UI là có hiệu lực ngay)
# ---------------------------------------------------------------------------

def _cfg() -> dict:
    """{base_url, account_id, api_token} — store (integrations) trước, env sau."""
    return integrations_store.get_credential("chatwoot")


def _base_url() -> str:
    return str(_cfg().get("base_url") or settings.chatwoot_base_url or "")


def _account_id() -> int:
    val = _cfg().get("account_id")
    try:
        return int(val) if val not in (None, "") else settings.chatwoot_account_id
    except (TypeError, ValueError):
        return settings.chatwoot_account_id


def _api_token() -> str:
    return str(_cfg().get("api_token") or "")


def is_configured() -> bool:
    return bool(_api_token())


def config_status() -> dict:
    """Trạng thái cấu hình để FE quyết định hiện hướng dẫn hay dữ liệu."""
    return {
        "configured": is_configured(),
        "base_url": _base_url(),
        "account_id": _account_id(),
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
    token = _api_token()
    if not token:
        log.warning("[chatwoot] thiếu CHATWOOT_API_TOKEN — bỏ qua %s %s", method, path)
        return None

    import httpx

    url = f"{_base_url().rstrip('/')}{path}"
    headers = {
        "api_access_token": token,
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
    return f"/api/v1/accounts/{_account_id()}{suffix}"


def _mask_token(token: str) -> str:
    """Che token để log/diagnostics an toàn: 4 ký tự đầu + 4 cuối."""
    if not token:
        return ""
    if len(token) <= 8:
        return "***"
    return f"{token[:4]}…{token[-4:]}"


async def diagnostics() -> dict:
    """Tự kiểm tra cấu hình Chatwoot — gọi THỬ API và trả kết quả chi tiết.

    KHÔNG nuốt lỗi: ghi rõ status code / loại lỗi / số hội thoại lấy được để admin
    tự chẩn đoán (token sai 401, account sai 404, URL sai/timeout...).
    """
    base = _base_url().rstrip("/")
    token = _api_token()
    result: dict = {
        "configured": is_configured(),
        "base_url": base,
        "account_id": _account_id(),
        "token_masked": _mask_token(token),
        "request_url": f"{base}{_account_path('/conversations')}",
        "ok": False,
        "status_code": None,
        "conversation_count": None,
        "error": None,
        "hint": None,
    }
    if not is_configured():
        result["error"] = "Chưa cấu hình CHATWOOT_API_TOKEN."
        result["hint"] = "Đặt env CHATWOOT_API_TOKEN trên backend rồi redeploy."
        return result

    import httpx

    headers = {
        "api_access_token": token,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                result["request_url"],
                params={"assignee_type": "all"},
                headers=headers,
            )
            result["status_code"] = resp.status_code
            if resp.status_code == 200:
                data = resp.json() if resp.content else {}
                payload = data.get("data", data) if isinstance(data, dict) else {}
                raw = payload.get("payload", []) if isinstance(payload, dict) else []
                result["ok"] = True
                result["conversation_count"] = len(raw) if isinstance(raw, list) else 0
                if result["conversation_count"] == 0:
                    result["hint"] = (
                        "Gọi API OK nhưng 0 hội thoại — kiểm tra: account_id đúng "
                        "chưa, đã có hội thoại trong account, token có quyền xem toàn "
                        "bộ (assignee_type=all)."
                    )
            elif resp.status_code in (401, 403):
                result["error"] = "Token bị từ chối (401/403)."
                result["hint"] = "CHATWOOT_API_TOKEN sai/hết hạn hoặc không đủ quyền."
            elif resp.status_code == 404:
                result["error"] = "Không tìm thấy (404)."
                result["hint"] = (
                    f"account_id={_account_id()} hoặc base_url sai. "
                    "Kiểm tra URL Chatwoot + CHATWOOT_ACCOUNT_ID."
                )
            else:
                result["error"] = f"HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:  # noqa: BLE001 — diagnostics phải luôn trả về, không raise
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["hint"] = (
            "Không kết nối được Chatwoot — kiểm tra base_url (https://, đúng domain) "
            "và mạng outbound từ backend."
        )
    return result


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
    """Danh sách hội thoại Chatwoot đã chuẩn hoá. None nếu chưa cấu hình/lỗi.

    QUAN TRỌNG: endpoint /conversations của Chatwoot mặc định lọc theo
    `assignee_type=me` → token Agent Bot (không được "assign" hội thoại nào) sẽ
    thấy DANH SÁCH RỖNG dù token đúng. Phải truyền `assignee_type=all` để lấy mọi
    hội thoại của account. Đây là nguyên nhân phổ biến khiến hộp thư "không kéo
    được hội thoại" dù đã cấu hình token.
    """
    params: dict = {"assignee_type": "all"}
    if status != "all":
        params["status"] = status
    data = await _request("GET", _account_path("/conversations"), params=params)
    if data is None:
        return None
    payload = data.get("data", data) if isinstance(data, dict) else {}
    raw = payload.get("payload", []) if isinstance(payload, dict) else []
    convos = [normalize_conversation(c) for c in raw if isinstance(c, dict)]
    log.info("[chatwoot] list_conversations status=%s → %d hội thoại", status, len(convos))
    return convos


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


def _phone_suffix(normalized: str) -> str:
    """9 số cuối của SĐT đã chuẩn hoá — dùng so khớp bền vững giữa các định dạng
    (0xxx, +84xxx, 84xxx, có/không mã vùng). VN: số di động 9 chữ số sau '0'."""
    return normalized[-9:] if len(normalized) >= 9 else normalized


def _phone_match(a: Optional[str], b: Optional[str]) -> bool:
    """So khớp 2 SĐT bất kể định dạng. Chuẩn hoá (+84/84 → 0) rồi so khớp tuyệt
    đối; nếu lệch (vd thiếu/thừa mã vùng) thì so 9 số cuối để vẫn bắt được."""
    na = lead_store.normalize_phone(a or "")
    nb = lead_store.normalize_phone(b or "")
    if not na or not nb:
        return False
    if na == nb:
        return True
    return _phone_suffix(na) == _phone_suffix(nb)


def web_url(raw_id) -> Optional[str]:
    """Deep link tới hội thoại trong giao diện Chatwoot (cho Customer 360).

    Dạng: {base}/app/accounts/{account_id}/conversations/{id}. None khi chưa cấu
    hình base_url/account hoặc thiếu raw_id → FE không render link.
    """
    base = _base_url().rstrip("/")
    acc = _account_id()
    if not base or not acc or raw_id in (None, ""):
        return None
    return f"{base}/app/accounts/{acc}/conversations/{raw_id}"


async def conversations_for_lead(lead: dict, status: str = "all") -> list[dict]:
    """Các hội thoại Chatwoot khớp 1 lead theo SĐT/email (cho Customer 360).

    Trả [] khi chưa cấu hình / lỗi / không khớp — KHÔNG raise.

    Khớp SĐT qua `_phone_match`: Chatwoot thường lưu '+84901234567' còn lead lưu
    '0901234567' — cả hai chuẩn hoá về '0901234567' nên khớp; thêm fallback 9 số
    cuối để bền với các sai khác mã vùng.
    """
    convos = await list_conversations(status=status)
    if not convos:
        return []
    lphone = lead.get("phone") or ""
    nemail = (lead.get("email") or "").strip().lower()
    matched: list[dict] = []
    for c in convos:
        cemail = (c["contact"].get("email") or "").strip().lower()
        if _phone_match(lphone, c["contact"].get("phone")) or (
            nemail and cemail and nemail == cemail
        ):
            matched.append(c)
    log.info(
        "[chatwoot] conversations_for_lead lead=%s → %d/%d khớp",
        lead.get("id"), len(matched), len(convos),
    )
    return matched


async def conversation_threads_for_lead(lead: dict, status: str = "all") -> list[dict]:
    """Hội thoại Chatwoot khớp 1 lead KÈM TOÀN BỘ tin nhắn + deep link (cho 360).

    Mở rộng `conversations_for_lead`: với mỗi hội thoại khớp, kéo thêm danh sách
    tin nhắn (`list_messages`) và gắn `web_url` để FE mở thẳng trong Chatwoot.
    Trả [] khi chưa cấu hình / lỗi / không khớp — KHÔNG raise (lỗi 1 hội thoại
    không làm hỏng cả danh sách).
    """
    convos = await conversations_for_lead(lead, status=status)
    threads: list[dict] = []
    for c in convos:
        raw = c.get("raw_id")
        try:
            msgs = await list_messages(int(raw)) if raw is not None else None
        except (TypeError, ValueError):
            msgs = None
        except Exception as exc:  # noqa: BLE001 — 1 hội thoại lỗi không làm sập cả khối
            log.warning("[chatwoot] list_messages lỗi conv=%s: %s", raw, exc)
            msgs = None
        threads.append({**c, "messages": msgs or [], "web_url": web_url(raw)})
    return threads
