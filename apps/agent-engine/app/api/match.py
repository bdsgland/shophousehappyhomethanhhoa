"""REST endpoints cho Live Match — fallback khi WebSocket không khả dụng + admin.

WebSocket (ws_presence/ws_match) là kênh chính; REST ở đây để:
  - Khách trigger/huỷ match nếu client không mở được WS.
  - Sale accept/decline/complete qua HTTP (mobile, fallback).
  - Admin xem stats + lịch sử + presence để dựng dashboard.

Phân quyền tái dùng deps: require_sale (sale|admin), require_admin, get_current_user.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user, require_admin, require_sale
from app.core import match_service, match_store, presence
from app.schemas.match import CompleteMatchBody

router = APIRouter(tags=["live-match"])


# ----- Khách hàng -----

@router.post("/match/request")
async def request_match(user: dict = Depends(get_current_user)) -> dict:
    """Khách yêu cầu được ghép sale (REST fallback của /ws/customer-match)."""
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Chỉ khách hàng mới được tạo match")
    return await match_service.request_match(
        user["id"], user.get("full_name", "Khách hàng"), user.get("email", "")
    )


@router.post("/match/{match_id}/cancel")
async def cancel_match(match_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Khách huỷ match đang chờ (hoặc admin huỷ giúp)."""
    match = match_store.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Không tìm thấy match")
    is_owner = match["customer_id"] == user["id"]
    if not is_owner and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Không có quyền huỷ match này")
    return await match_service.cancel_match(match_id, by_customer=is_owner)


# ----- Sale -----

@router.post("/match/{match_id}/accept")
async def accept_match(match_id: str, user: dict = Depends(require_sale)) -> dict:
    return await match_service.accept_match(match_id, user["id"])


@router.post("/match/{match_id}/decline")
async def decline_match(match_id: str, user: dict = Depends(require_sale)) -> dict:
    return await match_service.decline_match(match_id, user["id"])


@router.post("/match/{match_id}/complete")
async def complete_match(
    match_id: str,
    body: CompleteMatchBody,
    user: dict = Depends(require_sale),
) -> dict:
    match = match_store.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Không tìm thấy match")
    if match.get("sale_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Match không thuộc về bạn")
    return await match_service.complete_match(
        match_id, body.outcome.value, body.note
    )


@router.get("/sale/match/incoming")
def sale_incoming(user: dict = Depends(require_sale)) -> list[dict]:
    """Match đang invite chính sale này (poll fallback khi WS rớt)."""
    return match_service.get_incoming_for_sale(user["id"])


# ----- Admin -----

@router.get("/admin/match/stats")
def admin_stats(
    period: str = Query("today", pattern="^(today|week|all)$"),
    _admin: dict = Depends(require_admin),
) -> dict:
    return match_service.get_match_stats(period)


@router.get("/admin/match/history")
def admin_history(
    sale_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    _admin: dict = Depends(require_admin),
) -> list[dict]:
    return match_service.get_match_history(sale_id=sale_id, limit=limit)


@router.get("/admin/match/presence")
def admin_presence(_admin: dict = Depends(require_admin)) -> dict:
    """Bảng presence realtime (ai online/busy/away) + số liệu nhanh."""
    return {
        "counts": presence.counts(),
        "sales": presence.list_all_presence(),
    }
