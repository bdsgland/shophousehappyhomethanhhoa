"""AI CRM API (Phần B) — insight + rescore lead bằng Claude thật.

Endpoint:
  • GET  /ai-crm/leads/{lead_id}/insight   — score + tier + reason + best_time
                                             + next_action (sale-or-admin, own lead)
  • POST /ai-crm/leads/{lead_id}/rescore    — chấm lại 1 lead (sale-or-admin, own)
  • POST /ai-crm/rescore                     — batch / all (admin)

Auth dùng đúng convention deps.py: require_sale (admin cũng qua được) cho thao
tác trên lead của mình; require_admin cho rescore hàng loạt. Phân tách dữ liệu:
sale chỉ thao tác lead có assigned_sale_id == mình (admin xem hết).
"""

from __future__ import annotations

from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import require_admin, require_sale
from app.core import ai_crm, lead_store

router = APIRouter(prefix="/ai-crm", tags=["ai-crm"])


# ---------------------------------------------------------------------------
# Response / request models
# ---------------------------------------------------------------------------

class NextAction(BaseModel):
    summary: Optional[str] = None
    suggested_action: Optional[str] = None


class LeadInsight(BaseModel):
    lead_id: str
    ai_score: int = 0
    ai_tier: Optional[str] = None
    ai_reason: Optional[str] = None
    ai_best_time: Optional[str] = None
    ai_next_action: Optional[NextAction] = None
    ai_scored_at: Optional[str] = None
    status: Optional[str] = None


class RescoreRequest(BaseModel):
    """Batch rescore. Truyền lead_ids cụ thể, hoặc scope='all' cho toàn bộ."""

    lead_ids: Optional[list[str]] = None
    scope: Optional[str] = Field(default=None, description="'all' = toàn bộ lead")
    force: bool = False


class RescoreResult(BaseModel):
    scored: int


# ---------------------------------------------------------------------------
# Helpers (phân tách dữ liệu sale ↔ lead)
# ---------------------------------------------------------------------------

def _owned_lead(lead_id: str, user: dict) -> dict:
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    if user.get("role") != "admin" and lead.get("assigned_sale_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc về bạn")
    return lead


def _to_insight(lead: dict) -> LeadInsight:
    nba = lead.get("ai_next_action")
    return LeadInsight(
        lead_id=lead["id"],
        ai_score=lead.get("ai_score", 0),
        ai_tier=lead.get("ai_tier"),
        ai_reason=lead.get("ai_reason"),
        ai_best_time=lead.get("ai_best_time"),
        ai_next_action=NextAction(**nba) if isinstance(nba, dict) else None,
        ai_scored_at=lead.get("ai_scored_at"),
        status=lead.get("status"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/leads/{lead_id}/insight", response_model=LeadInsight)
async def get_lead_insight(
    lead_id: str, user: dict = Depends(require_sale)
) -> LeadInsight:
    """Insight 1 lead. Tự chấm nếu chưa có / đã cũ (cache trong rescore_leads)."""
    _owned_lead(lead_id, user)
    await ai_crm.rescore_leads([lead_id])
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return _to_insight(lead)


@router.post("/leads/{lead_id}/rescore", response_model=LeadInsight)
async def rescore_one(
    lead_id: str, user: dict = Depends(require_sale)
) -> LeadInsight:
    """Chấm lại 1 lead (force) — sale chủ lead hoặc admin."""
    _owned_lead(lead_id, user)
    await ai_crm.rescore_leads([lead_id], force=True)
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return _to_insight(lead)


@router.post("/rescore", response_model=RescoreResult)
async def rescore_batch(
    payload: RescoreRequest, _admin: dict = Depends(require_admin)
) -> RescoreResult:
    """Chấm điểm AI hàng loạt (admin). lead_ids cụ thể hoặc scope='all'."""
    target: Union[None, str, list]
    if payload.scope == "all":
        target = "all"
    elif payload.lead_ids:
        target = payload.lead_ids
    else:
        raise HTTPException(
            status_code=400,
            detail="Cần truyền lead_ids hoặc scope='all'.",
        )
    scored = await ai_crm.rescore_leads(target, force=payload.force)
    return RescoreResult(scored=scored)
