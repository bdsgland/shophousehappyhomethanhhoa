"""Endpoint quản trị (yêu cầu role=admin).

- GET   /admin/overview      → tổng số user theo role, tổng lead
- GET   /admin/users         → list user (không kèm password_hash)
- PATCH /admin/users/{id}    → đổi role / is_active
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api import leads as leads_module
from app.api.deps import require_admin, require_admin_or_service
from app.core import user_store
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


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
