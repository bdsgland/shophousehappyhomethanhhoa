"""Endpoints consumed by the 35-Sale Bot Intent n8n workflow.

File destination in repo:
    apps/agent-engine/app/api/sale_bot_endpoints.py

These are READ-ONLY views over the same JSON stores used by openclaw_bridge.py.
No auth requirement is enforced here because n8n adds a network-layer guard,
but you can wrap them with an API key check by importing `require_god` from
openclaw_bridge if you want defense in depth.

Register in app/main.py:
    from app.api import sale_bot_endpoints
    app.include_router(sale_bot_endpoints.router)

If any of /inventory/quote, /crm/leads/search, /bookings already exist in the
repo, REMOVE the duplicate from this file before merging.
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["sale-bot"])

DATA_DIR = Path(os.environ.get("HH_DATA_DIR", "/app/data"))
INVENTORY_FILE = DATA_DIR / "inventory.json"
LEADS_FILE = DATA_DIR / "leads.json"
BOOKINGS_FILE = DATA_DIR / "bookings.json"


def _load(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


# ---------------------------------------------------------------------------
# /inventory/quote — used by n8n price_quote branch
# ---------------------------------------------------------------------------
@router.get("/inventory/quote")
def inventory_quote(
    unit_id: Optional[str] = Query(default=None),
    floor: Optional[int] = Query(default=None),
    tower: Optional[str] = Query(default=None),
) -> Dict[str, Any] | List[Dict[str, Any]]:
    inv = _load(INVENTORY_FILE, [])
    if not isinstance(inv, list):
        raise HTTPException(500, "inventory store malformed")

    def _price(u: Dict[str, Any]) -> Dict[str, Any]:
        price_list = int(u.get("price_list") or u.get("price") or 0)
        discount_pct = float(u.get("discount_pct") or 0)
        price_final = int(price_list * (1 - discount_pct / 100))
        return {
            "unit": {
                "id": u.get("id"),
                "code": u.get("code") or u.get("id"),
                "area": u.get("area"),
                "tower": u.get("tower"),
                "floor": u.get("floor"),
                "status": u.get("status", "available"),
            },
            "price_list": price_list,
            "discount_pct": discount_pct,
            "price_final": price_final,
        }

    if unit_id:
        for u in inv:
            if str(u.get("id")) == str(unit_id) or u.get("code") == unit_id:
                return _price(u)
        raise HTTPException(404, f"unit {unit_id} not found")

    matches = []
    for u in inv:
        if floor is not None and int(u.get("floor", -1)) != floor:
            continue
        if tower and str(u.get("tower", "")).lower() != tower.lower():
            continue
        matches.append({
            "code": u.get("code") or u.get("id"),
            "price_final": int((u.get("price_list") or 0) * (1 - float(u.get("discount_pct") or 0) / 100)),
            "status": u.get("status", "available"),
        })
    return matches


# ---------------------------------------------------------------------------
# /crm/leads/search — used by n8n lead_info branch
# ---------------------------------------------------------------------------
@router.get("/crm/leads/search")
def leads_search(q: str = Query(..., min_length=1)) -> List[Dict[str, Any]]:
    leads = _load(LEADS_FILE, [])
    if not isinstance(leads, list):
        raise HTTPException(500, "leads store malformed")
    needle = q.strip().lower()
    out: List[Dict[str, Any]] = []
    for l in leads:
        hay = " ".join(
            str(l.get(k, "")) for k in ("name", "phone", "email", "note", "source")
        ).lower()
        if needle in hay:
            out.append(
                {
                    "id": l.get("id"),
                    "name": l.get("name"),
                    "phone": l.get("phone"),
                    "email": l.get("email"),
                    "source": l.get("source"),
                    "status": l.get("status"),
                    "assigned_sale": l.get("assigned_sale"),
                }
            )
        if len(out) >= 20:
            break
    return out


# ---------------------------------------------------------------------------
# /bookings — used by n8n booking_list branch
# ---------------------------------------------------------------------------
def _parse_range(date_arg: str | None, range_arg: str | None) -> tuple[date, date]:
    today = datetime.now(timezone.utc).date()
    if date_arg:
        d = date_arg.lower()
        if d == "today":
            return today, today
        if d in ("tomorrow", "mai", "ngày mai"):
            return today + timedelta(days=1), today + timedelta(days=1)
        if d == "yesterday":
            return today - timedelta(days=1), today - timedelta(days=1)
        try:
            iso = datetime.fromisoformat(date_arg).date()
            return iso, iso
        except ValueError:
            pass
    if range_arg:
        r = range_arg.lower()
        if r in ("this_week", "tuần này"):
            start = today - timedelta(days=today.weekday())
            return start, start + timedelta(days=6)
        if r in ("next_week", "tuần sau"):
            start = today - timedelta(days=today.weekday()) + timedelta(days=7)
            return start, start + timedelta(days=6)
        if r in ("this_month", "tháng này"):
            start = today.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1) - timedelta(days=1)
            else:
                end = start.replace(month=start.month + 1) - timedelta(days=1)
            return start, end
    return today, today + timedelta(days=7)


@router.get("/bookings")
def list_bookings(
    sale_id: Optional[str] = Query(default=None),
    date: Optional[str] = Query(default=None),
    range: Optional[str] = Query(default=None),
) -> List[Dict[str, Any]]:
    bookings = _load(BOOKINGS_FILE, [])
    if not isinstance(bookings, list):
        raise HTTPException(500, "bookings store malformed")

    start, end = _parse_range(date, range)
    out: List[Dict[str, Any]] = []
    for b in bookings:
        ts_raw = b.get("start_time") or b.get("time") or b.get("date")
        if not ts_raw:
            continue
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00")).date()
        except ValueError:
            continue
        if not (start <= ts <= end):
            continue
        if sale_id and str(b.get("sale_id")) != str(sale_id):
            continue
        out.append(
            {
                "id": b.get("id"),
                "start_time": ts_raw,
                "client_name": b.get("client_name"),
                "client_phone": b.get("client_phone"),
                "unit_code": b.get("unit_code"),
                "note": b.get("note"),
                "sale_id": b.get("sale_id"),
            }
        )
    out.sort(key=lambda r: r["start_time"])
    return out
