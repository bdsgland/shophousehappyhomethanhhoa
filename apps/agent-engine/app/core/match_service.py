"""Match service — điều phối Live Match (tìm sale → invite → Meet → hoàn tất).

Tầng này là "bộ não": gọi presence (chọn sale + push WS) + match_store (bền vững)
+ google_meet (tạo link). KHÔNG đụng tới CRM. Mọi hàm async để push WS + tạo Meet.

Luồng chuẩn:
  request_match → _find_and_invite → (sale) accept_match → create Meet → LIVE
  decline/expire → _find_and_invite sale kế tiếp → hết sale → no_sale_available
  cancel_match (khách huỷ) / complete_match (sale điền outcome sau call)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

from app.core import google_meet, match_store, presence, user_store
from app.core.settings import settings


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def _notify_admins(match: Optional[dict]) -> None:
    """Đẩy 1 cập nhật match + stats hôm nay tới các admin đang xem dashboard.

    Best-effort: lỗi broadcast KHÔNG được làm hỏng luồng match (admin chỉ là
    observer). Stats tính lại nhẹ từ store nên gọi an toàn ở mỗi lần đổi trạng thái.
    """
    try:
        await presence.broadcast_to_admins(
            {
                "type": "match:update",
                "match": match,
                "stats": get_match_stats("today"),
            }
        )
    except Exception:  # noqa: BLE001 — broadcast là phụ trợ, nuốt mọi lỗi
        pass


# ----- Public API -----

async def request_match(
    customer_id: str, customer_name: str, customer_email: str
) -> dict:
    """Khách yêu cầu match. Tái dùng match đang sống nếu có (tránh tạo trùng)."""
    existing = match_store.find_active_for_customer(customer_id)
    if existing:
        await presence.send_to_customer(
            customer_id, {"type": "match:assigning", "match": existing}
        )
        return existing

    match = match_store.create(
        customer_id=customer_id,
        customer_name=customer_name,
        customer_email=customer_email,
    )
    await presence.send_to_customer(
        customer_id, {"type": "match:assigning", "match": match}
    )
    await _find_and_invite(match["id"])
    return match_store.get(match["id"]) or match


async def _find_and_invite(match_id: str) -> bool:
    """Tìm sale tốt nhất chưa từ chối → invite. Hết sale → no_sale_available."""
    match = match_store.get(match_id)
    if not match or match["status"] in (
        "accepted",
        "live",
        "completed",
        "cancelled",
    ):
        return False

    best = presence.find_best_match(exclude_sales=match.get("declined_by", []))
    if best is None:
        match_store.update_force(
            match_id,
            status="declined",
            sale_id=None,
            sale_name=None,
            invite_expires_at=None,
        )
        await presence.send_to_customer(
            match["customer_id"],
            {"type": "match:no_sale_available", "match_id": match_id},
        )
        await _notify_admins(match_store.get(match_id))
        return False

    sale_id = best["sale_id"]
    expires_at = _now() + _timedelta_seconds(settings.match_invite_timeout_seconds)
    invited = list(dict.fromkeys([*match.get("invited_sales", []), sale_id]))
    updated = match_store.update_force(
        match_id,
        status="invited",
        sale_id=sale_id,
        sale_name=best.get("sale_name"),
        invited_sales=invited,
        invite_expires_at=_iso(expires_at),
    )
    presence.mark_matched(sale_id)

    await presence.send_to_sale(
        sale_id,
        {
            "type": "match:incoming",
            "match": updated,
            "expires_at": _iso(expires_at),
            "timeout_seconds": settings.match_invite_timeout_seconds,
        },
    )
    await _notify_admins(updated)
    _schedule_expiry(match_id, sale_id, expires_at)
    return True


async def accept_match(match_id: str, sale_id: str) -> dict:
    """Sale Accept → tạo Google Meet → LIVE. Trả match đã cập nhật."""
    match = match_store.get(match_id)
    if not match:
        return {"error": "not_found"}
    # Chỉ sale đang được mời mới accept được; tránh race khi invite đã chuyển người.
    if match["status"] != "invited" or match.get("sale_id") != sale_id:
        await presence.send_to_sale(
            sale_id, {"type": "match:gone", "match_id": match_id}
        )
        return match

    match = match_store.update_force(
        match_id,
        status="accepted",
        accepted_at=_iso(_now()),
        invite_expires_at=None,
    )
    sale = user_store.find_by_id(sale_id) or {}
    sale_email = sale.get("email", "")

    # Báo khách đã có sale (đang chuẩn bị phòng họp).
    await presence.send_to_customer(
        match["customer_id"],
        {
            "type": "match:assigned",
            "sale": {"id": sale_id, "name": match.get("sale_name")},
            "match": match,
        },
    )
    await _notify_admins(match)

    try:
        event = await google_meet.create_meet_event(
            customer_email=match["customer_email"],
            sale_email=sale_email,
        )
    except Exception as exc:  # noqa: BLE001 — Meet lỗi không được làm crash service
        match = match_store.update(match_id, status="accepted") or match
        await presence.send_to_sale(
            sale_id,
            {"type": "match:meet_error", "match_id": match_id, "message": str(exc)},
        )
        await presence.send_to_customer(
            match["customer_id"],
            {
                "type": "match:no_sale_available",
                "match_id": match_id,
                "fallback": "Chuyên viên sẽ gọi điện cho bạn trong ít phút.",
            },
        )
        await _notify_admins(match)
        return match

    match = match_store.update_force(
        match_id,
        status="live",
        meet_link=event["meet_link"],
        meet_event_id=event.get("event_id"),
    )
    presence.set_busy(sale_id, True)
    presence.inc_active_calls(sale_id, +1)

    payload = {"type": "match:meet_ready", "match": match, "meet_link": event["meet_link"]}
    await presence.send_to_sale(sale_id, payload)
    await presence.send_to_customer(match["customer_id"], payload)
    await _notify_admins(match)
    return match


async def decline_match(match_id: str, sale_id: str) -> dict:
    """Sale từ chối → ghi declined → tìm sale kế tiếp."""
    match = match_store.get(match_id)
    if not match or match["status"] != "invited" or match.get("sale_id") != sale_id:
        return match or {"error": "not_found"}

    declined = list(dict.fromkeys([*match.get("declined_by", []), sale_id]))
    match_store.update_force(
        match_id,
        status="pending",
        sale_id=None,
        sale_name=None,
        declined_by=declined,
        invite_expires_at=None,
    )
    await presence.send_to_sale(
        sale_id, {"type": "match:cancelled", "match_id": match_id}
    )
    await _find_and_invite(match_id)
    return match_store.get(match_id) or match


async def expire_invite_if_needed(
    match_id: str,
    sale_id: Optional[str] = None,
    expires_iso: Optional[str] = None,
) -> dict:
    """Hết 15s mà sale chưa Accept → coi như từ chối → tìm sale kế tiếp.

    `expires_iso` để chắc chắn chỉ expire đúng "thế hệ" invite (tránh expire nhầm
    invite mới hơn của cùng match).
    """
    match = match_store.get(match_id)
    if not match or match["status"] != "invited":
        return match or {"error": "not_found"}
    cur_sale = match.get("sale_id")
    if sale_id is not None and cur_sale != sale_id:
        return match
    if expires_iso is not None and match.get("invite_expires_at") != expires_iso:
        return match
    exp = _parse(match.get("invite_expires_at"))
    if exp and _now() < exp:
        return match  # chưa tới hạn

    declined = list(dict.fromkeys([*match.get("declined_by", []), cur_sale]))
    match_store.update_force(
        match_id,
        status="pending",
        sale_id=None,
        sale_name=None,
        declined_by=declined,
        invite_expires_at=None,
    )
    if cur_sale:
        await presence.send_to_sale(
            cur_sale, {"type": "match:expired", "match_id": match_id}
        )
    await _find_and_invite(match_id)
    return match_store.get(match_id) or match


async def cancel_match(match_id: str, by_customer: bool = True) -> dict:
    """Khách huỷ (hoặc admin huỷ). Đóng invite + giải phóng sale nếu đang live."""
    match = match_store.get(match_id)
    if not match or match["status"] in ("completed", "cancelled", "declined"):
        return match or {"error": "not_found"}

    was_live = match["status"] == "live"
    cur_sale = match.get("sale_id")
    match = match_store.update_force(
        match_id,
        status="cancelled",
        completed_at=_iso(_now()),
        invite_expires_at=None,
    )
    if cur_sale:
        await presence.send_to_sale(
            cur_sale,
            {
                "type": "match:cancelled",
                "match_id": match_id,
                "by": "customer" if by_customer else "admin",
            },
        )
        if was_live:
            presence.inc_active_calls(cur_sale, -1)
            presence.set_busy(cur_sale, False)
    await _notify_admins(match)
    return match


async def complete_match(
    match_id: str, outcome: str, note: Optional[str] = None
) -> dict:
    """Sau call: sale điền outcome. Tính duration + giải phóng sale (về online)."""
    match = match_store.get(match_id)
    if not match:
        return {"error": "not_found"}

    accepted = _parse(match.get("accepted_at"))
    duration = int((_now() - accepted).total_seconds()) if accepted else None
    cur_sale = match.get("sale_id")
    match = match_store.update_force(
        match_id,
        status="completed",
        completed_at=_iso(_now()),
        duration_seconds=duration,
        outcome=outcome,
        outcome_note=note,
    )
    if cur_sale:
        presence.inc_active_calls(cur_sale, -1)
        presence.set_busy(cur_sale, False)
        await presence.send_to_sale(
            cur_sale, {"type": "match:completed", "match_id": match_id}
        )
    await presence.send_to_customer(
        match["customer_id"], {"type": "match:completed", "match_id": match_id}
    )
    await _notify_admins(match)
    return match


# ----- Thống kê cho admin -----

def get_match_stats(period: str = "today") -> dict:
    """Tổng hợp số liệu match theo kỳ (today/week/all) + presence hiện tại."""
    matches = match_store.list_all()
    start = _period_start(period)
    if start is not None:
        matches = [m for m in matches if (_parse(m.get("created_at")) or _now()) >= start]

    total = len(matches)
    by_status: dict[str, int] = {}
    for m in matches:
        by_status[m["status"]] = by_status.get(m["status"], 0) + 1

    completed = [m for m in matches if m["status"] == "completed"]
    durations = [m["duration_seconds"] for m in completed if m.get("duration_seconds")]
    avg_duration = sum(durations) / len(durations) if durations else 0.0

    accept_secs = []
    for m in matches:
        c = _parse(m.get("created_at"))
        a = _parse(m.get("accepted_at"))
        if c and a:
            accept_secs.append((a - c).total_seconds())
    avg_accept = sum(accept_secs) / len(accept_secs) if accept_secs else 0.0

    # accepted = từng có sale nhận (accepted/live/completed)
    accepted = sum(by_status.get(s, 0) for s in ("accepted", "live", "completed"))
    conversion = (len(completed) / total) if total else 0.0

    pc = presence.counts()
    return {
        "period": period,
        "total": total,
        "accepted": accepted,
        "declined": by_status.get("declined", 0),
        "expired": by_status.get("expired", 0),
        "cancelled": by_status.get("cancelled", 0),
        "live": by_status.get("live", 0),
        "completed": len(completed),
        "avg_duration_seconds": round(avg_duration, 1),
        "avg_accept_seconds": round(avg_accept, 1),
        "conversion_rate": round(conversion, 3),
        "online_sales": pc["online_sales"],
        "online_customers": pc["online_customers"],
        "active_calls": pc["active_calls"],
    }


def get_match_history(
    *,
    sale_id: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """Lịch sử match (mới nhất trước), lọc theo sale nếu có."""
    matches = match_store.list_all()
    if sale_id:
        matches = [m for m in matches if m.get("sale_id") == sale_id]
    matches.sort(key=lambda m: m.get("created_at") or "", reverse=True)
    return matches[:limit]


def get_incoming_for_sale(sale_id: str) -> list[dict]:
    """Match đang invite chính sale này (REST fallback nếu WS rớt)."""
    return [
        m
        for m in match_store.list_all()
        if m["status"] == "invited" and m.get("sale_id") == sale_id
    ]


# ----- Helpers -----

def _timedelta_seconds(seconds: int):
    from datetime import timedelta

    return timedelta(seconds=seconds)


def _period_start(period: str) -> Optional[datetime]:
    from datetime import timedelta

    now = _now()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        monday = now - timedelta(days=now.weekday())
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return None  # all


def _schedule_expiry(match_id: str, sale_id: str, expires_at: datetime) -> None:
    """Đặt task async tự expire invite sau timeout. No-op nếu không có event loop."""

    async def _runner():
        delay = max(0.0, (expires_at - _now()).total_seconds())
        try:
            await asyncio.sleep(delay)
            await expire_invite_if_needed(match_id, sale_id, _iso(expires_at))
        except asyncio.CancelledError:  # pragma: no cover
            pass
        except Exception:  # noqa: BLE001 — task nền không được làm chết app
            pass

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return  # gọi từ ngữ cảnh sync (test) → caller tự expire khi cần
    asyncio.create_task(_runner())
