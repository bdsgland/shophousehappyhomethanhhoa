"""Admin CMS "Dự án" (/admin/projects) — sửa NỘI DUNG biên tập các tab dự án.

Pattern giống admin/sales_policy: require_admin + ghi audit (prefix admin.*).
  GET    /admin/projects                      → danh sách dự án (summary)
  GET    /admin/projects/{slug}               → toàn bộ nội dung để admin sửa
  PUT    /admin/projects/{slug}               → cập nhật meta + (tuỳ chọn) content
  PATCH  /admin/projects/{slug}/sections/{section} → lưu 1 tab nội dung
  POST   /admin/projects/{slug}/ai-edit       → AI đề xuất nội dung 1 tab (KHÔNG lưu)
  GET    /admin/projects/{slug}/history       → lịch sử phiên bản

Quỹ căn / Mặt bằng → /admin/inventory (inventory_store); Tài liệu RAG →
/learning + /projects/{slug}/documents (learning_store); số liệu phiếu giá →
/admin/sales-policy (sales_policy_store). Router này CHỈ phục vụ nội dung tự do.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import get_current_user, require_admin
from app.core import audit_store, project_store
from app.core.ai_project import ai_edit_section
from app.schemas.project import (
    ProjectAIEditIn,
    ProjectAIEditOut,
    ProjectDoc,
    ProjectSummary,
    ProjectUpdateIn,
)

router = APIRouter(prefix="/admin/projects", tags=["admin-projects"])


def _slug_or_400(slug: str) -> str:
    try:
        return project_store.normalize_slug(slug)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("", response_model=list[ProjectSummary])
def list_projects(_admin: dict = Depends(require_admin)) -> list[ProjectSummary]:
    return project_store.list_projects()


@router.get("/{slug}", response_model=ProjectDoc)
def get_project(slug: str, _admin: dict = Depends(require_admin)) -> ProjectDoc:
    return project_store.get(_slug_or_400(slug))


@router.put("/{slug}", response_model=ProjectDoc)
def update_project(
    slug: str,
    payload: ProjectUpdateIn,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> ProjectDoc:
    s = _slug_or_400(slug)
    try:
        saved = project_store.update_meta_and_content(s, payload, by_admin_id=user.get("id"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    audit_store.record_admin(
        "project.update", _admin, target=s, new_value={"version": saved.version}
    )
    return saved


@router.patch("/{slug}/sections/{section}", response_model=ProjectDoc)
def update_project_section(
    slug: str,
    section: str,
    data: dict = Body(..., description="Nội dung mới của section (đúng shape model)"),
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> ProjectDoc:
    s = _slug_or_400(slug)
    try:
        saved = project_store.update_section(s, section, data, by_admin_id=user.get("id"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    audit_store.record_admin(
        "project.update_section", _admin, target=f"{s}/{section}",
        new_value={"version": saved.version},
    )
    return saved


@router.post("/{slug}/ai-edit", response_model=ProjectAIEditOut)
async def ai_edit_project_section(
    slug: str,
    payload: ProjectAIEditIn,
    _admin: dict = Depends(require_admin),
) -> ProjectAIEditOut:
    """AI đề xuất nội dung mới cho 1 section. KHÔNG tự lưu — admin xem rồi PUT/PATCH."""
    s = _slug_or_400(slug)
    # Nội dung hiện tại: ưu tiên client gửi lên (admin đang sửa dở), nếu không lấy store.
    current = payload.current_content
    if current is None:
        doc = project_store.get(s)
        section_obj = getattr(doc.content, payload.section, None)
        if section_obj is None:
            raise HTTPException(400, f"Section không hợp lệ: {payload.section}")
        current = section_obj.model_dump(mode="json", by_alias=True)

    suggestion, suggestion_text, used_llm, note = await ai_edit_section(
        payload.section, payload.instruction, current
    )
    # Audit nhẹ (không lưu nội dung, chỉ ghi nhận thao tác + có dùng LLM hay không).
    audit_store.record_admin(
        "project.ai_edit", _admin, target=f"{s}/{payload.section}",
        new_value={"used_llm": used_llm},
    )
    return ProjectAIEditOut(
        section=payload.section,
        used_llm=used_llm,
        suggestion=suggestion,
        suggestion_text=suggestion_text,
        note=note,
    )


@router.get("/{slug}/history")
def project_history(slug: str, _admin: dict = Depends(require_admin)) -> dict:
    return {"versions": project_store.get_history(_slug_or_400(slug), limit=20)}
