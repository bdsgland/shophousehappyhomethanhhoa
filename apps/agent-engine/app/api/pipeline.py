"""API Luồng chuyển đổi (sales pipeline / kanban).

  • GET  /crm/pipeline                  — leads nhóm theo GIAI ĐOẠN (kanban).
        sale: chỉ khách của mình; admin: tất cả (lọc ?sale_id=). ?auto_advance=true
        sẽ NÂNG giai đoạn tự động theo AI + hành vi (ghi stage_history → timeline).
  • POST /crm/leads/{lead_id}/stage     — đổi giai đoạn 1 khách (ghi log timeline).

Auth theo deps.py: require_sale (admin cũng qua được); sale chỉ thao tác lead của
mình (kiểm tra ở endpoint). Giai đoạn pipeline là lớp phái sinh trên status lõi —
không phá enum status hiện có.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import require_sale
from app.core import booking_store, customer_360, learning_store, lead_store, pipeline

router = APIRouter(prefix="/crm", tags=["crm-pipeline"])


class StageChangeBody(BaseModel):
    stage: str
    note: Optional[str] = None


def _owned_lead(lead_id: str, user: dict) -> dict:
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    if user.get("role") != "admin" and lead.get("assigned_sale_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc về bạn")
    return lead


def _gather_leads(user: dict, sale_id: Optional[str]) -> list[dict]:
    """Lead trong tầm nhìn: admin = tất cả (lọc sale_id); sale = của mình."""
    if user.get("role") == "admin":
        page = lead_store.list_all_leads(sale_id=sale_id, page=1, page_size=10000)
        return page["items"]
    return lead_store.list_leads_for_sale(user["id"])


def _lead_card(lead: dict, stage: str, suggested: Optional[str], deals: dict) -> dict:
    """Thẻ lead gọn cho cột kanban."""
    return {
        "id": lead.get("id"),
        "name": lead.get("name"),
        "phone": lead.get("phone"),
        "status": lead.get("status"),
        "source": lead.get("source"),
        "assigned_sale_id": lead.get("assigned_sale_id"),
        "ai_score": lead.get("ai_score", 0),
        "ai_tier": lead.get("ai_tier"),
        "stage": stage,
        "suggested_stage": suggested,
        "booking_count": deals["bookings"],
        "quote_count": deals["quotes"],
        "last_contact_at": lead.get("last_contact_at"),
        "updated_at": lead.get("updated_at"),
    }


@router.get("/pipeline")
def get_pipeline(
    sale_id: Optional[str] = Query(default=None, description="Admin lọc theo 1 sale"),
    auto_advance: bool = Query(default=False, description="Tự nâng giai đoạn theo AI"),
    user: dict = Depends(require_sale),
) -> dict:
    """Leads nhóm theo giai đoạn pipeline (kanban)."""
    leads = _gather_leads(user, sale_id)
    all_bookings = booking_store.list_all()
    try:
        all_quotes = learning_store.list_quotes()
    except Exception:  # noqa: BLE001
        all_quotes = []

    # Khung cột theo cấu hình giai đoạn.
    columns: dict[str, dict] = {
        meta["key"]: {"key": meta["key"], "label": meta["label"],
                      "rank": meta["rank"], "leads": []}
        for meta in pipeline.stages_meta()
    }

    for lead in leads:
        my_bk, my_qt = customer_360.find_deals_for_lead(lead, all_bookings, all_quotes)
        suggested = pipeline.auto_pipeline_stage(lead, my_bk, my_qt)
        if auto_advance and suggested:
            # Nâng tự động + ghi stage_history (vào timeline 360).
            lead_store.set_pipeline_stage(
                lead["id"], suggested, by=user["id"], note="auto-advance theo AI"
            )
            lead["pipeline_stage"] = suggested
            suggested = None
        stage = pipeline.derive_stage(lead, my_bk, my_qt)
        card = _lead_card(lead, stage, suggested,
                          {"bookings": len(my_bk), "quotes": len(my_qt)})
        columns.setdefault(stage, columns["new"])["leads"].append(card)

    stages = sorted(columns.values(), key=lambda c: c["rank"] if c["rank"] >= 0 else 99)
    for col in stages:
        col["count"] = len(col["leads"])
    total = sum(col["count"] for col in stages)
    return {"stages": stages, "total": total}


@router.post("/leads/{lead_id}/stage")
def change_stage(
    lead_id: str,
    payload: StageChangeBody,
    user: dict = Depends(require_sale),
) -> dict:
    """Đổi giai đoạn 1 khách (ghi log vào timeline qua stage_history)."""
    _owned_lead(lead_id, user)
    if not pipeline.validate_stage(payload.stage):
        raise HTTPException(
            status_code=400,
            detail=f"Giai đoạn không hợp lệ. Hợp lệ: {', '.join(pipeline.STAGE_KEYS)}",
        )
    updated = lead_store.set_pipeline_stage(
        lead_id, payload.stage, by=user["id"], note=payload.note
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return {
        "lead_id": lead_id,
        "stage": payload.stage,
        "label": pipeline.stage_label(payload.stage),
        "lead": updated,
    }
