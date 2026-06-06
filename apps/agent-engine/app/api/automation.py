"""Webhook nội bộ + lưu hoa hồng — cầu nối FastAPI ↔ n8n.

Endpoints:
  POST /webhooks/internal/booking-created → trigger n8n "Hot Lead Alert"
  POST /webhooks/internal/deal-closed     → trigger n8n "Commission Calculator"
  POST /commissions/distribute            → n8n gửi kết quả tính hoa hồng về lưu
  GET  /commissions                       → admin xem bản ghi hoa hồng
  GET  /automation/audit                  → admin xem audit log automation

Thiết kế:
  - Mọi outbound sang n8n đi qua `post_to_n8n()` (mockable trong test).
  - Webhook nội bộ trả 202 ngay, đẩy việc gọi n8n sang BackgroundTask.
  - Bảo vệ webhook bằng service token (X-Internal-Token) khi đã cấu hình.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.api import leads as leads_store
from app.api.deps import optional_service_guard, require_admin_or_service
from app.core import audit_store, commission_store, user_store
from app.core.settings import settings
from app.schemas.automation import (
    BookingCreatedIn,
    CommissionDistributeIn,
    DealClosedIn,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["automation"])


# ---------------------------------------------------------------------------
# Outbound sang n8n (tách riêng để mock trong test)
# ---------------------------------------------------------------------------

async def post_to_n8n(url: str, payload: dict[str, Any]) -> Optional[Any]:
    """POST JSON sang webhook n8n. Trả None khi lỗi (không raise)."""
    import httpx

    headers = {"Content-Type": "application/json"}
    if settings.internal_webhook_token:
        # Cho phép n8n verify nguồn gọi nếu workflow có bật check.
        headers["X-Internal-Token"] = settings.internal_webhook_token
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json() if resp.content else {"status": resp.status_code}
    except Exception as exc:  # noqa: BLE001 — lỗi outbound không được làm vỡ request
        log.error("[n8n] POST %s lỗi: %s: %s", url, type(exc).__name__, exc)
        return None


async def _forward(url: str, payload: dict[str, Any], event_type: str) -> None:
    """BackgroundTask: gọi n8n và ghi audit kết quả."""
    result = await post_to_n8n(url, payload)
    if result is None:
        audit_store.record(event_type, payload, status="error", detail=f"n8n không phản hồi: {url}")
    else:
        audit_store.record(event_type, payload, status="ok", detail=f"đã gửi n8n: {url}")


# ---------------------------------------------------------------------------
# Workflow 1 — Hot Lead Alert
# ---------------------------------------------------------------------------

def _build_hot_lead_payload(body: BookingCreatedIn) -> dict[str, Any]:
    """Bù thông tin lead/sale còn thiếu từ store rồi dựng payload cho n8n."""
    lead = leads_store._LEADS.get(body.lead_id)
    sale = user_store.find_by_id(body.sale_id) if body.sale_id else None

    lead_name = body.lead_name or (lead.full_name if lead else None) or "Khách hàng"
    lead_phone = body.lead_phone or (lead.phone if lead else None) or ""
    lead_email = body.lead_email or (lead.email if lead else None) or ""

    sale_name = body.sale_name or (sale.get("full_name") if sale else None) or ""
    sale_email = body.sale_email or (sale.get("email") if sale else None) or ""
    sale_chat_id = (
        body.sale_telegram_chat_id
        or (sale.get("telegram_chat_id") if sale else None)
        or ""
    )

    # Gắn sale + nâng trạng thái lead (contacted_at vẫn null → n8n escalate được).
    if lead is not None:
        if body.sale_id:
            lead.assigned_sale_id = body.sale_id
        if body.ai_score:
            lead.intent_score = max(lead.intent_score, body.ai_score)
        if lead.status in ("new", "nurturing"):
            lead.status = "hot"

    return {
        "lead_id": body.lead_id,
        "lead_name": lead_name,
        "lead_phone": lead_phone,
        "lead_email": lead_email,
        "unit_id": body.unit_id,
        "unit_summary": body.unit_summary,
        "booking_time": body.booking_time,
        "sale_id": body.sale_id or "",
        "sale_name": sale_name,
        "sale_telegram_chat_id": sale_chat_id,
        "sale_email": sale_email,
        "conversation_url": body.conversation_url,
        "ai_score": body.ai_score,
        "ai_summary": body.ai_summary,
    }


@router.post("/webhooks/internal/booking-created", status_code=status.HTTP_202_ACCEPTED)
async def booking_created(
    body: BookingCreatedIn,
    background: BackgroundTasks,
    _guard: dict = Depends(optional_service_guard),
) -> dict:
    """Frontend/middleware gọi khi booking được tạo → trigger n8n hot-lead-alert."""
    payload = _build_hot_lead_payload(body)
    audit_store.record("booking-created", payload, detail="nhận booking, đang gửi n8n")
    background.add_task(
        _forward, settings.hot_lead_webhook_url(), payload, "n8n.hot-lead-alert"
    )
    return {"status": "accepted", "lead_id": body.lead_id}


# ---------------------------------------------------------------------------
# Workflow 2 — Commission Calculator
# ---------------------------------------------------------------------------

@router.post("/webhooks/internal/deal-closed", status_code=status.HTTP_202_ACCEPTED)
async def deal_closed(
    body: DealClosedIn,
    background: BackgroundTasks,
    _guard: dict = Depends(optional_service_guard),
) -> dict:
    """Admin mark deal closed → trigger n8n commission-calc."""
    def _person(user_id: Optional[str]) -> tuple[str, str]:
        """(full_name, telegram_chat_id) từ user_store — '' nếu không có."""
        if not user_id:
            return "", ""
        u = user_store.find_by_id(user_id)
        if not u:
            return "", ""
        return u.get("full_name") or "", u.get("telegram_chat_id") or ""

    sale = user_store.find_by_id(body.sale_id)
    sale_chat = sale.get("telegram_chat_id") if sale else ""
    leader_name, leader_chat = _person(body.leader_id)
    manager_name, manager_chat = _person(body.manager_id)
    director_name, director_chat = _person(body.director_id)

    payload: dict[str, Any] = {
        "deal_id": body.deal_id,
        "deal_amount": body.deal_amount,
        "deal_closed_at": body.deal_closed_at or "",
        "sale_id": body.sale_id,
        "sale_name": body.sale_name or (sale.get("full_name") if sale else "") or "",
        "sale_telegram_chat_id": sale_chat or "",
        "sale_monthly_volume_before": body.sale_monthly_volume_before,
        "leader_id": body.leader_id or "",
        "leader_name": leader_name,
        "leader_telegram_chat_id": leader_chat,
        "manager_id": body.manager_id or "",
        "manager_name": manager_name,
        "manager_telegram_chat_id": manager_chat,
        "director_id": body.director_id or "",
        "director_name": director_name,
        "director_telegram_chat_id": director_chat,
    }
    audit_store.record("deal-closed", payload, detail="nhận deal closed, đang gửi n8n")
    background.add_task(
        _forward, settings.commission_webhook_url(), payload, "n8n.commission-calc"
    )
    return {"status": "accepted", "deal_id": body.deal_id}


# ---------------------------------------------------------------------------
# Lưu kết quả hoa hồng từ n8n
# ---------------------------------------------------------------------------

@router.post("/commissions/distribute", status_code=status.HTTP_201_CREATED)
def commissions_distribute(
    body: CommissionDistributeIn,
    _guard: dict = Depends(optional_service_guard),
) -> dict:
    """n8n Function node tính xong 5 bậc → POST về đây để lưu record."""
    record = commission_store.upsert(body.model_dump())
    audit_store.record(
        "commission-distribute",
        {"deal_id": body.deal_id, "deal_amount": body.deal_amount},
        detail=f"lưu hoa hồng {len(body.tiers)} bậc",
    )
    return {"status": "saved", "deal_id": record["deal_id"], "saved_at": record["saved_at"]}


@router.get("/commissions")
def list_commissions(
    sale_id: Optional[str] = Query(default=None),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Admin / n8n xem các bản ghi hoa hồng đã lưu."""
    return {"records": commission_store.list_records(sale_id=sale_id)}


@router.get("/automation/audit")
def list_audit(
    event_type: Optional[str] = Query(default=None),
    _admin: dict = Depends(require_admin_or_service),
) -> dict:
    """Admin xem audit log các sự kiện automation gần nhất."""
    return {"events": audit_store.list_events(event_type=event_type)}
