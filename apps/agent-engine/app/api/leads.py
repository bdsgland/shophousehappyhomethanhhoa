"""Endpoint quản lý lead — MVP lưu in-memory để demo nhanh.

Giai đoạn 2 sẽ thay bằng PostgreSQL.
"""

from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from app.schemas.lead import Lead, LeadCreate

router = APIRouter(prefix="/leads", tags=["leads"])

# In-memory store — chỉ dùng khi MVP. KHÔNG dùng ở production.
_LEADS: dict[str, Lead] = {}


@router.get("", response_model=list[Lead])
def list_leads() -> list[Lead]:
    return sorted(_LEADS.values(), key=lambda l: l.created_at, reverse=True)


@router.post("", response_model=Lead, status_code=201)
def create_lead(payload: LeadCreate) -> Lead:
    lead_id = str(uuid4())
    lead = Lead(id=lead_id, **payload.model_dump())
    _LEADS[lead_id] = lead
    return lead


@router.get("/{lead_id}", response_model=Lead)
def get_lead(lead_id: str) -> Lead:
    lead = _LEADS.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead không tồn tại")
    return lead


@router.post("/{lead_id}/score", response_model=Lead)
def update_score(lead_id: str, delta: int) -> Lead:
    lead = _LEADS.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead không tồn tại")
    lead.intent_score = max(0, min(100, lead.intent_score + delta))
    lead.updated_at = datetime.utcnow()
    return lead
