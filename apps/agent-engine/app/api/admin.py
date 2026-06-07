"""Endpoint quản trị (yêu cầu role=admin).

- GET   /admin/overview          → tổng số user theo role, tổng lead
- GET   /admin/users             → list user (không kèm password_hash)
- PATCH /admin/users/{id}        → đổi role / is_active
- GET   /admin/dashboard/kpi     → KPI tổng quan cho admin dashboard (cards + charts)
- GET   /admin/platforms/health  → ping sức khoẻ 5 nền tảng (server-side, tránh CORS)
"""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api import inventory as inventory_module
from app.api import leads as leads_module
from app.api.deps import require_admin, require_admin_or_service
from app.core import user_store
from app.core.settings import settings
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/admin", tags=["admin"])

# Hoa hồng ước tính trên giá trị căn đã chốt — dùng cho "doanh thu dự kiến".
_COMMISSION_RATE = 0.03


@router.get("/overview")
def overview(_admin: dict = Depends(require_admin)) -> dict:
    users = user_store.list_users()
    by_role: dict[str, int] = {}
    active = 0
    for u in users:
        by_role[u.get("role", "sale")] = by_role.get(u.get("role", "sale"), 0) + 1
        if u.get("is_active", True):
            active += 1
    return {
        "users_total": len(users),
        "users_active": active,
        "users_by_role": by_role,
        "leads_total": len(leads_module._LEADS),
        "backend_status": "ok",
    }


@router.get("/users", response_model=list[UserOut])
def list_users(_admin: dict = Depends(require_admin)) -> list[UserOut]:
    return [UserOut(**user_store.public_view(u)) for u in user_store.list_users()]


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    payload: UserUpdate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    if payload.role is None and payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cần ít nhất một trường: role hoặc is_active",
        )

    # Chặn admin tự khoá / tự hạ quyền chính mình (tránh khoá toàn bộ hệ thống).
    if user_id == admin["id"]:
        if payload.role is not None and payload.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự hạ quyền admin của chính mình",
            )
        if payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự khoá tài khoản của chính mình",
            )

    updated = user_store.update_user(
        user_id, role=payload.role, is_active=payload.is_active
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    return UserOut(**user_store.public_view(updated))


def _lead_date(lead) -> datetime | None:
    """Lấy ngày tạo lead (an toàn với cả object/dict)."""
    val = getattr(lead, "created_at", None)
    if val is None and isinstance(lead, dict):
        val = lead.get("created_at")
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", ""))
        except ValueError:
            return None
    return val


@router.get("/dashboard/kpi")
def dashboard_kpi(_admin: dict = Depends(require_admin)) -> dict:
    """KPI tổng quan cho admin dashboard.

    Trả số liệu THỰC từ các store hiện có (user/lead/inventory). Khi hệ thống
    còn mới (chưa nhiều hoạt động) các mảng chart có thể bằng 0 — frontend tự
    hiển thị trạng thái "chưa có dữ liệu" thay vì vẽ đường phẳng gây hiểu nhầm.
    """
    now = datetime.utcnow()
    today = now.date()

    # --- Leads ---
    leads = list(leads_module._LEADS.values())
    lead_today = 0
    for l in leads:
        d = _lead_date(l)
        if d and d.date() == today:
            lead_today += 1

    # Chuỗi 30 ngày gần nhất (cho line chart)
    lead_trend = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date()
        cnt = sum(1 for l in leads if (_lead_date(l) or datetime.min).date() == day)
        lead_trend.append({"date": day.isoformat(), "count": cnt})

    # --- Users ---
    users = user_store.list_users()
    by_role: dict[str, int] = {}
    for u in users:
        r = u.get("role", "sale")
        by_role[r] = by_role.get(r, 0) + 1

    # --- Inventory ---
    units = inventory_module.get_units()
    reserved = sum(1 for u in units if u["trang_thai"] == "Đặt cọc")
    sold = sum(1 for u in units if u["trang_thai"] == "Đã bán")
    available = sum(1 for u in units if u["trang_thai"] == "Còn hàng")
    booked_value = sum(
        u["gia_tri"] for u in units if u["trang_thai"] in ("Đặt cọc", "Đã bán")
    )
    revenue_projection = round(booked_value * _COMMISSION_RATE, 2)

    # --- Top sale theo hoa hồng (MVP: chưa có giao dịch thật → để trống) ---
    top_sales: list[dict] = []

    return {
        "lead_today": lead_today,
        "lead_total": len(leads),
        "users_total": len(users),
        "users_by_role": by_role,
        "orders_this_month": reserved,  # đơn đặt cọc đang giữ chỗ
        "revenue_projection_ty": revenue_projection,  # tỷ đồng (hoa hồng ước tính)
        "inventory": {
            "total": len(units),
            "available": available,
            "sold": sold,
            "reserved": reserved,
        },
        "lead_trend": lead_trend,
        "top_sales": top_sales,
        "generated_at": now.isoformat() + "Z",
    }


# ---------------------------------------------------------------------------
# Daily Briefing (n8n workflow 3) — sales active + leads cần follow-up
# ---------------------------------------------------------------------------

@router.get("/sales/active")
def sales_active(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Danh sách sale đang hoạt động — n8n daily-briefing loop qua từng người.

    Cho phép service token (X-Internal-Token) để n8n gọi không cần đăng nhập.
    """
    sales = user_store.list_active_sales()
    return {
        "sales": [
            {
                "id": s["id"],
                "full_name": s["full_name"],
                "email": s["email"],
                "phone": s.get("phone"),
                "telegram_chat_id": s.get("telegram_chat_id"),
                "telegram_linked": bool(s.get("telegram_chat_id")),
            }
            for s in sales
        ],
        "count": len(sales),
    }


def _lead_brief(lead) -> dict:
    """Rút gọn lead cho briefing (chỉ field cần để Claude tóm tắt)."""
    return {
        "id": lead.id,
        "full_name": lead.full_name,
        "phone": lead.phone,
        "status": lead.status,
        "intent_score": lead.intent_score,
        "project": lead.project,
        "next_followup_at": lead.next_followup_at.isoformat() + "Z"
        if lead.next_followup_at
        else None,
        "updated_at": lead.updated_at.isoformat() + "Z" if lead.updated_at else None,
    }


@router.get("/leads/needs-followup")
def leads_needs_followup(
    sale_id: str = Query(..., description="user_id của sale"),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Tổng hợp lead cần follow-up của 1 sale cho briefing sáng.

    Nhóm: hot leads chưa liên hệ / lịch gọi lại hôm nay / lead "ngủ đông" 3+ ngày /
    booking sắp đến trong 24h. Lọc theo lead.assigned_sale_id == sale_id.
    """
    now = datetime.utcnow()
    today = now.date()
    in_24h = now + timedelta(hours=24)
    dormant_before = now - timedelta(days=3)

    mine = [
        l for l in leads_module._LEADS.values() if l.assigned_sale_id == sale_id
    ]

    hot_uncontacted = [
        l for l in mine if l.status == "hot" and l.contacted_at is None
    ]
    callbacks_today = [
        l for l in mine if l.next_followup_at and l.next_followup_at.date() == today
    ]
    upcoming_bookings = [
        l for l in mine if l.next_followup_at and now <= l.next_followup_at <= in_24h
    ]
    dormant = [
        l
        for l in mine
        if l.status in ("new", "nurturing", "hot")
        and (l.updated_at or now) < dormant_before
    ]

    return {
        "sale_id": sale_id,
        "generated_at": now.isoformat() + "Z",
        "hot_uncontacted": [_lead_brief(l) for l in hot_uncontacted],
        "callbacks_today": [_lead_brief(l) for l in callbacks_today],
        "upcoming_bookings_24h": [_lead_brief(l) for l in upcoming_bookings],
        "dormant_3days": [_lead_brief(l) for l in dormant],
        "counts": {
            "hot_uncontacted": len(hot_uncontacted),
            "callbacks_today": len(callbacks_today),
            "upcoming_bookings_24h": len(upcoming_bookings),
            "dormant_3days": len(dormant),
        },
    }


def _platforms_config() -> list[dict]:
    """Danh sách nền tảng cần health-check. URL có thể override qua env."""
    return [
        {"key": "api", "name": "Agent Engine (API)", "url": "self"},
        {"key": "n8n", "name": "n8n Automation", "url": settings.platform_n8n_url},
        {"key": "note", "name": "Open Notebook", "url": settings.platform_note_url},
        {
            "key": "bot",
            "name": "OpenClaw",
            "url": settings.platform_bot_url,
            "note": "Login UI lỗi — chờ fix",
        },
        {"key": "chat", "name": "Chatwoot", "url": settings.platform_chat_url},
    ]


@router.get("/platforms/health")
async def platforms_health(_admin: dict = Depends(require_admin)) -> dict:
    """Ping sức khoẻ 5 nền tảng từ phía server (tránh giới hạn CORS của trình duyệt).

    Coi là "up" nếu nhận được HTTP < 500 (kể cả 401/302 — tức là dịch vụ sống,
    chỉ là cần auth). "down" nếu timeout / lỗi kết nối / 5xx.
    """
    results: list[dict] = []
    async with httpx.AsyncClient(
        timeout=6.0, follow_redirects=False, verify=True
    ) as client:
        for p in _platforms_config():
            entry = {k: v for k, v in p.items() if k != "url"}
            entry["url"] = p["url"]
            if p["url"] == "self":
                entry["url"] = "https://api.eurowindowlightcity.net"
                entry["status"] = "up"
                entry["code"] = 200
                results.append(entry)
                continue
            try:
                r = await client.get(
                    p["url"], headers={"User-Agent": "ELC-Admin-HealthCheck/1.0"}
                )
                entry["code"] = r.status_code
                entry["status"] = "up" if r.status_code < 500 else "down"
            except Exception as e:  # noqa: BLE001 — mọi lỗi mạng coi là down
                entry["code"] = None
                entry["status"] = "down"
                entry["error"] = type(e).__name__
            results.append(entry)
    return {
        "platforms": results,
        "checked_at": datetime.utcnow().isoformat() + "Z",
    }
