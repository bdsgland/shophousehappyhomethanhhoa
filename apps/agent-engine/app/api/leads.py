"""Endpoint quản lý lead — MVP lưu in-memory để demo nhanh.

Giai đoạn 2 sẽ thay bằng PostgreSQL.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Query, Response
from app.schemas.lead import Lead, LeadCreate

router = APIRouter(prefix="/leads", tags=["leads"])

# In-memory store — chỉ dùng khi MVP. KHÔNG dùng ở production.
_LEADS: dict[str, Lead] = {}


def _find_existing(phone: Optional[str], email: Optional[str]) -> Optional[Lead]:
    """Dedupe: tìm lead đã tồn tại theo phone hoặc email."""
    if not phone and not email:
        return None
    for lead in _LEADS.values():
        if phone and lead.phone == phone:
            return lead
        if email and lead.email and lead.email.lower() == email.lower():
            return lead
    return None


@router.get("", response_model=List[Lead])
def list_leads(
    project: Optional[str] = Query(default=None, description="Lọc theo tên dự án"),
    project_slug: Optional[str] = Query(default=None, description="Lọc theo slug dự án"),
) -> List[Lead]:
    leads = list(_LEADS.values())
    if project:
        leads = [l for l in leads if l.project == project]
    if project_slug:
        leads = [l for l in leads if l.project_slug == project_slug]
    return sorted(leads, key=lambda l: l.created_at, reverse=True)


@router.get("/projects", response_model=List[dict])
def list_projects() -> List[dict]:
    """Trả về danh sách dự án đã có lead (kèm số lead) — phục vụ dashboard nhóm theo dự án."""
    counts: dict[tuple, int] = {}
    for l in _LEADS.values():
        key = (l.project_slug or "", l.project or "(Chưa gán)")
        counts[key] = counts.get(key, 0) + 1
    return [
        {"project_slug": slug, "project": name, "lead_count": cnt}
        for (slug, name), cnt in sorted(counts.items(), key=lambda x: -x[1])
    ]


@router.post("", response_model=Lead)
def create_lead(payload: LeadCreate, response: Response) -> Lead:
    """Tạo lead mới — nếu phone/email đã tồn tại thì cập nhật thay vì tạo mới (dedupe).

    Status code: 201 Created khi tạo mới, 200 OK khi cập nhật lead đã tồn tại.
    """
    existing = _find_existing(payload.phone, payload.email)
    if existing:
        for field, value in payload.model_dump(exclude_unset=True).items():
            if value is not None and value != "":
                setattr(existing, field, value)
        existing.updated_at = datetime.utcnow()
        response.status_code = 200
        return existing

    lead_id = str(uuid4())
    now = datetime.utcnow()
    lead = Lead(id=lead_id, **payload.model_dump())
    lead.created_at = now
    lead.updated_at = now
    _LEADS[lead_id] = lead
    response.status_code = 201
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
