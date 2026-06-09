"""Presence store — trạng thái online realtime của sale + registry WebSocket.

Đây là state IN-MEMORY (mất khi restart — chấp nhận được vì presence vốn là dữ
liệu phù du). Lịch sử match bền vững nằm ở match_store.json.

Gồm 3 phần:
  - `_presence`: dict[sale_id -> dict] trạng thái + heartbeat của sale.
  - `_sale_ws`: dict[sale_id -> WebSocket] kết nối đang mở của sale.
  - `_customer_ws`: dict[customer_id -> WebSocket] kết nối của khách.

Hàm `send_to_sale` / `send_to_customer` là async helper để service push sự kiện.
`find_best_match` chọn sale tốt nhất theo: online + trong giờ làm + chưa từ chối,
sắp xếp eligibility DESC, active_calls ASC, last_match_at ASC (round-robin fair).

KHÔNG phụ thuộc CRM; chỉ đọc xếp hạng eligibility từ sale_task_store (đã có sẵn).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.core.settings import settings

# Giờ Việt Nam (UTC+7) để so khớp lịch làm việc "08:00"-"22:00" của sale.
_VN_TZ = timezone(timedelta(hours=7))

# ----- State in-memory -----
# sale_id -> {sale_id, sale_name, availability, last_heartbeat_at(datetime),
#             active_calls(int), last_match_at(datetime|None),
#             schedule_start(str), schedule_end(str)}
_presence: dict[str, dict[str, Any]] = {}
_sale_ws: dict[str, Any] = {}  # sale_id -> WebSocket
_customer_ws: dict[str, Any] = {}  # customer_id -> WebSocket
# Admin có thể mở nhiều tab dashboard cùng lúc → set các kết nối đang xem.
_admin_ws: set[Any] = set()  # {WebSocket, ...} admin theo dõi Live Match realtime


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ----- Quản lý trạng thái sale -----

def set_online(sale_id: str, sale_name: str) -> dict:
    """Đánh dấu sale online (gọi khi WS connect). Giữ active_calls/last_match nếu có."""
    cur = _presence.get(sale_id, {})
    _presence[sale_id] = {
        "sale_id": sale_id,
        "sale_name": sale_name or cur.get("sale_name", "Sale"),
        # Nếu đang bận (busy) thì giữ busy; còn lại về online.
        "availability": "busy" if cur.get("availability") == "busy" else "online",
        "last_heartbeat_at": _now(),
        "active_calls": int(cur.get("active_calls", 0)),
        "last_match_at": cur.get("last_match_at"),
        "schedule_start": cur.get("schedule_start", "08:00"),
        "schedule_end": cur.get("schedule_end", "22:00"),
    }
    return _presence[sale_id]


def set_offline(sale_id: str) -> None:
    """Sale rời đi (WS disconnect). Xoá khỏi presence + đóng registry."""
    p = _presence.get(sale_id)
    if p is not None:
        p["availability"] = "away"
    _sale_ws.pop(sale_id, None)


def set_availability(sale_id: str, availability: str) -> Optional[dict]:
    p = _presence.get(sale_id)
    if p is None:
        return None
    if availability in ("online", "busy", "away", "dnd"):
        p["availability"] = availability
        p["last_heartbeat_at"] = _now()
    return p


def set_busy(sale_id: str, busy: bool) -> Optional[dict]:
    p = _presence.get(sale_id)
    if p is None:
        return None
    p["availability"] = "busy" if busy else "online"
    return p


def heartbeat(sale_id: str) -> Optional[dict]:
    p = _presence.get(sale_id)
    if p is not None:
        p["last_heartbeat_at"] = _now()
    return p


def inc_active_calls(sale_id: str, by: int = 1) -> None:
    p = _presence.get(sale_id)
    if p is not None:
        p["active_calls"] = max(0, int(p.get("active_calls", 0)) + by)


def mark_matched(sale_id: str) -> None:
    """Ghi nhận thời điểm vừa nhận match (cho round-robin fairness)."""
    p = _presence.get(sale_id)
    if p is not None:
        p["last_match_at"] = _now()


def cleanup_stale() -> list[str]:
    """Set away cho sale không heartbeat quá ngưỡng. Trả list sale_id bị stale."""
    threshold = _now() - timedelta(seconds=settings.match_presence_stale_seconds)
    stale: list[str] = []
    for sid, p in _presence.items():
        hb = p.get("last_heartbeat_at")
        if p.get("availability") != "away" and isinstance(hb, datetime) and hb < threshold:
            p["availability"] = "away"
            stale.append(sid)
    return stale


# ----- Truy vấn -----

def get_presence(sale_id: str) -> Optional[dict]:
    return _presence.get(sale_id)


def _within_schedule(p: dict, now_vn: datetime) -> bool:
    """True nếu giờ hiện tại (VN) nằm trong [schedule_start, schedule_end)."""
    try:
        sh, sm = (int(x) for x in p.get("schedule_start", "08:00").split(":"))
        eh, em = (int(x) for x in p.get("schedule_end", "22:00").split(":"))
    except (ValueError, AttributeError):
        return True
    start = now_vn.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end = now_vn.replace(hour=eh, minute=em, second=0, microsecond=0)
    return start <= now_vn < end


def get_online_sales() -> list[dict]:
    """Sale đang thực sự online (availability=online) — bản copy để an toàn."""
    return [dict(p) for p in _presence.values() if p.get("availability") == "online"]


def list_all_presence() -> list[dict]:
    """Toàn bộ presence (mọi trạng thái) cho dashboard admin."""
    out = []
    for p in _presence.values():
        d = dict(p)
        for k in ("last_heartbeat_at", "last_match_at"):
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        out.append(d)
    return out


def find_best_match(
    *, exclude_sales: Optional[list[str]] = None
) -> Optional[dict]:
    """Chọn sale tốt nhất để invite.

    Lọc: availability=online, có WS đang mở, trong giờ làm, không nằm exclude.
    Sắp xếp: eligibility DESC → active_calls ASC → last_match_at ASC (None = ưu tiên).
    """
    exclude = set(exclude_sales or [])
    now_vn = _now().astimezone(_VN_TZ)

    # Xếp hạng eligibility từ sale_task_store (KPI tuần). Lỗi → bỏ qua, score=0.
    elig: dict[str, float] = {}
    try:
        from app.core import sale_task_store

        for perf in sale_task_store.rank_sales_by_eligibility():
            elig[perf["sale_id"]] = float(perf.get("eligibility_score", 0.0))
    except Exception:  # noqa: BLE001 — eligibility là bonus, không được làm chết match
        pass

    candidates = []
    for sid, p in _presence.items():
        if sid in exclude:
            continue
        if p.get("availability") != "online":
            continue
        if sid not in _sale_ws:  # phải có kết nối WS để nhận invite
            continue
        if not _within_schedule(p, now_vn):
            continue
        candidates.append(p)

    if not candidates:
        return None

    def _sort_key(p: dict):
        lm = p.get("last_match_at")
        # None (chưa từng nhận) → ưu tiên cao nhất (epoch nhỏ nhất).
        lm_ts = lm.timestamp() if isinstance(lm, datetime) else 0.0
        return (
            -elig.get(p["sale_id"], 0.0),
            int(p.get("active_calls", 0)),
            lm_ts,
        )

    candidates.sort(key=_sort_key)
    best = dict(candidates[0])
    best["eligibility_score"] = elig.get(best["sale_id"], 0.0)
    return best


# ----- Registry WebSocket + push helper -----

def register_sale_ws(sale_id: str, ws: Any) -> None:
    _sale_ws[sale_id] = ws


def register_customer_ws(customer_id: str, ws: Any) -> None:
    _customer_ws[customer_id] = ws


def unregister_customer_ws(customer_id: str) -> None:
    _customer_ws.pop(customer_id, None)


def has_customer_ws(customer_id: str) -> bool:
    return customer_id in _customer_ws


async def send_to_sale(sale_id: str, message: dict) -> bool:
    """Gửi JSON tới sale qua WS. Trả False nếu không có kết nối / lỗi."""
    ws = _sale_ws.get(sale_id)
    if ws is None:
        return False
    try:
        await ws.send_json(message)
        return True
    except Exception:  # noqa: BLE001 — kết nối có thể đã đứt
        _sale_ws.pop(sale_id, None)
        return False


def register_admin_ws(ws: Any) -> None:
    """Đăng ký 1 kết nối admin đang xem dashboard Live Match."""
    _admin_ws.add(ws)


def unregister_admin_ws(ws: Any) -> None:
    """Gỡ kết nối admin (WS disconnect / unmount)."""
    _admin_ws.discard(ws)


async def broadcast_to_admins(message: dict) -> int:
    """Đẩy JSON tới mọi admin đang theo dõi. Trả số kết nối gửi thành công.

    Best-effort: kết nối lỗi sẽ bị loại khỏi registry, không raise.
    """
    if not _admin_ws:
        return 0
    sent = 0
    for ws in list(_admin_ws):
        try:
            await ws.send_json(message)
            sent += 1
        except Exception:  # noqa: BLE001 — kết nối có thể đã đứt
            _admin_ws.discard(ws)
    return sent


async def send_to_customer(customer_id: str, message: dict) -> bool:
    ws = _customer_ws.get(customer_id)
    if ws is None:
        return False
    try:
        await ws.send_json(message)
        return True
    except Exception:  # noqa: BLE001
        _customer_ws.pop(customer_id, None)
        return False


def counts() -> dict:
    """Số liệu nhanh cho dashboard: online/busy/active calls/khách online."""
    online = sum(1 for p in _presence.values() if p.get("availability") == "online")
    busy = sum(1 for p in _presence.values() if p.get("availability") == "busy")
    active_calls = sum(int(p.get("active_calls", 0)) for p in _presence.values())
    return {
        "online_sales": online,
        "busy_sales": busy,
        "active_calls": active_calls,
        "online_customers": len(_customer_ws),
    }


def reset() -> None:
    """Xoá sạch state — chỉ dùng trong test."""
    _presence.clear()
    _sale_ws.clear()
    _customer_ws.clear()
