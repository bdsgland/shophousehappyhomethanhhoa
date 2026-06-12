"""Endpoint quản lý lead — MVP lưu in-memory để demo nhanh.

Giai đoạn 2 sẽ thay bằng PostgreSQL.
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.deps import get_current_user, require_user_or_service
from app.schemas.lead import Lead, LeadCreate

log = logging.getLogger("api.leads")

router = APIRouter(prefix="/leads", tags=["leads"])

# In-memory store — chỉ dùng khi MVP. KHÔNG dùng ở production.
#
# LƯU Ý: `_LEADS` vẫn được nhiều module nội bộ dùng chung qua `leads_store._LEADS`
# (webhook.py / bookings.py / automation.py / n8n_stubs.py / admin.py). Vì vậy KHÔNG
# gỡ bỏ nó (tránh phá vỡ các module đó). Để bịt KHE HỞ ĐỒNG BỘ, mọi lead web form
# công khai ngoài việc ghi vào `_LEADS` (giữ tương thích) còn được MIRROR sang CRM
# thật (`app.core.lead_store`) — xem `_mirror_to_crm` — để không mất khi restart và
# được khử trùng + tự gán sale AI + vào pipeline như khách import/CRM admin.
_LEADS: dict[str, Lead] = {}


def _mirror_to_crm(payload: LeadCreate) -> None:
    """Đẩy lead web form công khai sang CRM thật (lead_store) — BEST-EFFORT.

    - Khử trùng theo SĐT/email (find_by_contact): đã có thì cập nhật field thiếu;
      chưa có thì create_lead (qua đó tự gán sale AI + vào pipeline).
    - CHỈ tạo khi có ít nhất SĐT hoặc email (không tạo lead rác).
    - Nuốt MỌI lỗi: endpoint công khai KHÔNG được vỡ vì lỗi mirror CRM.
    - KHÔNG đổi response trả về client (PII không lộ thêm so với bản cũ).
    """
    try:
        from app.core import lead_store

        phone = (payload.phone or "").strip()
        email = (payload.email or "").strip()
        if not phone and not email:
            return  # thiếu cả SĐT lẫn email → bỏ qua, không tạo lead rác

        # Gộp facebook_url vào note để không mất thông tin (lead_store không có field này).
        note_parts: list[str] = []
        if payload.notes:
            note_parts.append(payload.notes.strip())
        if payload.facebook_url:
            note_parts.append(f"Facebook: {payload.facebook_url.strip()}")
        note = " | ".join(p for p in note_parts if p) or None

        # Clamp source về 1 giá trị HỢP LỆ trong enum LeadSource — `source_channel`
        # đến từ web form công khai nên có thể là chuỗi tuỳ ý; lưu giá trị lạ sẽ làm
        # Lead(**l) raise khi serialize (bảng khách rỗng). Không khớp → "web".
        from app.schemas.crm import LeadSource

        raw_src = (payload.source_channel or "web").strip() or "web"
        src = raw_src if raw_src in LeadSource._value2member_map_ else "web"

        existing = lead_store.find_by_contact(phone or None, email or None)
        if existing:
            # Chỉ bổ sung field còn thiếu/đáng cập nhật — update_lead bỏ qua None
            # và chỉ nhận key trong all-list của nó.
            fields: dict = {}
            if payload.full_name:
                fields["name"] = payload.full_name.strip()
            if email and not existing.get("email"):
                fields["email"] = email
            if note:
                fields["note"] = note
            if payload.project:
                fields["project"] = payload.project.strip()
            if fields:
                lead_store.update_lead(existing["id"], **fields)
        else:
            lead_store.create_lead(
                {
                    "name": (payload.full_name or "").strip(),
                    "phone": phone,
                    "email": email or None,
                    "note": note,
                    "source": src,
                    # `project` là profile field hợp lệ của lead_store (chỉ lưu khi có).
                    "project": (payload.project or "").strip() or None,
                }
            )
    except Exception as exc:  # noqa: BLE001 — mirror CRM không được phá endpoint công khai
        log.warning("mirror lead công khai sang CRM thất bại: %s", exc)


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
    _user: dict = Depends(get_current_user),
) -> List[Lead]:
    leads = list(_LEADS.values())
    if project:
        leads = [l for l in leads if l.project == project]
    if project_slug:
        leads = [l for l in leads if l.project_slug == project_slug]
    return sorted(leads, key=lambda l: l.created_at, reverse=True)


@router.get("/projects", response_model=List[dict])
def list_projects(_user: dict = Depends(get_current_user)) -> List[dict]:
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
    # Bịt KHE HỞ ĐỒNG BỘ: đẩy lead web form công khai về CRM thật (lead_store).
    # Best-effort, đã nuốt lỗi bên trong — không ảnh hưởng response/luồng cũ.
    _mirror_to_crm(payload)

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
def get_lead(lead_id: str, _user: dict = Depends(get_current_user)) -> Lead:
    lead = _LEADS.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead không tồn tại")
    return lead


@router.get("/{lead_id}/contacted_at")
def get_contacted_at(
    lead_id: str, _principal: dict = Depends(require_user_or_service)
) -> dict:
    """Trả về thời điểm sale đã liên hệ lead (None = chưa).

    Workflow n8n "Hot Lead Alert" gọi sau 5 phút: nếu contacted_at vẫn null thì
    escalate lên manager. Cho phép service token (X-Internal-Token) để n8n gọi.
    """
    lead = _LEADS.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead không tồn tại")
    return {
        "lead_id": lead_id,
        "contacted_at": lead.contacted_at.isoformat() + "Z" if lead.contacted_at else None,
    }


@router.post("/{lead_id}/contacted", response_model=Lead)
def mark_contacted(
    lead_id: str, _principal: dict = Depends(require_user_or_service)
) -> Lead:
    """Đánh dấu sale đã liên hệ lead (dừng escalate). Idempotent — giữ mốc đầu tiên."""
    lead = _LEADS.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead không tồn tại")
    if lead.contacted_at is None:
        lead.contacted_at = datetime.utcnow()
    lead.updated_at = datetime.utcnow()
    return lead


@router.post("/{lead_id}/score", response_model=Lead)
def update_score(
    lead_id: str, delta: int, _user: dict = Depends(get_current_user)
) -> Lead:
    lead = _LEADS.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead không tồn tại")
    lead.intent_score = max(0, min(100, lead.intent_score + delta))
    lead.updated_at = datetime.utcnow()
    return lead
