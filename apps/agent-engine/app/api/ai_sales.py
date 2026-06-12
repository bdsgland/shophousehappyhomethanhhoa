"""Đội Sale AI — /admin/ai-sales/* (require_admin).

"Đội 1000 saleman AI" + tự động gán vào khách để chăm sóc, tích hợp Customer 360.
TÍNH NĂNG CỘNG THÊM: không phá luồng lead/360 hiện tại.

AN TOÀN: tự động gán (dữ liệu nội bộ) thì OK; nhưng MỌI tin nhắn ra khách thật chỉ
ở dạng NHÁP cần xác nhận. Endpoint run-care tái dùng crew/service → chỉ sinh phân
tích + tin NHÁP (requires_confirmation=true, auto_executed=false), KHÔNG tự gửi.

Endpoint:
  • POST /admin/ai-sales/seed                        — seed roster (idempotent)
  • GET  /admin/ai-sales                             — danh sách (phân trang/tìm kiếm)
  • GET  /admin/ai-sales/stats                        — thống kê đội
  • GET  /admin/ai-sales/{ais_id}                     — chi tiết 1 sale AI
  • GET  /admin/ai-sales/{ais_id}/leads               — khách của 1 sale AI
  • POST /admin/ai-sales/leads/{lead_id}/assign       — gán/chuyển sale AI cho lead
  • POST /admin/ai-sales/leads/{lead_id}/unassign     — gỡ sale AI khỏi lead
  • POST /admin/ai-sales/leads/{lead_id}/run-care     — chạy chăm sóc → phân tích + NHÁP
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import require_admin
from app.core import ai_salesman_store, lead_store

router = APIRouter(prefix="/admin/ai-sales", tags=["admin-ai-sales"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SeedRequest(BaseModel):
    count: int = Field(default=1000, ge=0, le=5000, description="Số sale AI cần có (idempotent).")


class AssignRequest(BaseModel):
    ai_salesman_id: Optional[str] = Field(
        default=None, description="Gán cứng vào sale AI này; trống → tự chọn cân tải + khớp chuyên môn."
    )
    product_type: Optional[str] = Field(
        default=None, description="Loại sản phẩm khách quan tâm (ưu tiên khớp chuyên môn)."
    )


class RunCareRequest(BaseModel):
    channel: str = Field(default="zalo", description="Kênh đề xuất cho tin nhắn nháp (zalo/sms/email).")


# ---------------------------------------------------------------------------
# Roster: seed / list / stats / get
# ---------------------------------------------------------------------------

@router.post("/seed")
def seed_roster(
    body: Optional[SeedRequest] = None,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Khởi tạo đội sale AI (mặc định 1000). Idempotent: không tạo trùng."""
    count = body.count if body else 1000
    return ai_salesman_store.seed_roster(count)


@router.get("")
def list_salesmen(
    status: Optional[str] = Query(default=None, description="Lọc trạng thái: active/inactive"),
    specialty: Optional[str] = Query(default=None, description="Lọc phân khúc: lien_ke/shophouse/can_ho"),
    search: Optional[str] = Query(default=None, description="Tìm theo tên/mã/chuyên môn"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Danh sách sale AI (phân trang — chịu được 1000 bản ghi)."""
    return ai_salesman_store.list_roster(
        status=status, specialty=specialty, search=search, page=page, page_size=page_size
    )


@router.get("/stats")
def stats(_admin: dict = Depends(require_admin)) -> dict:
    """Thống kê: tổng sale AI, đang hoạt động, tổng khách đã gán, tải trung bình."""
    return ai_salesman_store.compute_stats()


@router.get("/{ais_id}")
def get_salesman(ais_id: str, _admin: dict = Depends(require_admin)) -> dict:
    """Chi tiết 1 sale AI."""
    rec = ai_salesman_store.get(ais_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy sale AI: {ais_id}")
    return rec


@router.get("/{ais_id}/leads")
def list_salesman_leads(
    ais_id: str,
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Danh sách khách 1 sale AI đang phụ trách."""
    if ai_salesman_store.get(ais_id) is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy sale AI: {ais_id}")
    return lead_store.list_leads_for_ai_salesman(
        ais_id, status=status, search=search, page=page, page_size=page_size
    )


# ---------------------------------------------------------------------------
# Gán / gỡ
# ---------------------------------------------------------------------------

@router.post("/leads/{lead_id}/assign")
def assign_lead(
    lead_id: str,
    body: Optional[AssignRequest] = None,
    admin: dict = Depends(require_admin),
) -> dict:
    """Gán / chuyển 1 sale AI cho lead (cân tải + khớp chuyên môn, hoặc gán cứng)."""
    ais_id = body.ai_salesman_id if body else None
    product_type = body.product_type if body else None
    result = ai_salesman_store.assign(
        lead_id, ais_id=ais_id, product_type=product_type, requested_by=admin.get("id")
    )
    if not result.get("ok"):
        # Lead không tồn tại → 404; roster trống/đầy → 200 kèm reason để UI hiển thị.
        if result.get("reason") == "Không tìm thấy khách hàng":
            raise HTTPException(status_code=404, detail=result["reason"])
    return result


@router.post("/leads/{lead_id}/unassign")
def unassign_lead(
    lead_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    """Gỡ sale AI khỏi lead (giảm tải người cũ)."""
    result = ai_salesman_store.unassign(lead_id, requested_by=admin.get("id"))
    if not result.get("ok") and result.get("reason") == "Không tìm thấy khách hàng":
        raise HTTPException(status_code=404, detail=result["reason"])
    return result


# ---------------------------------------------------------------------------
# Chạy "chăm sóc" qua sale AI được gán → phân tích + tin NHÁP (KHÔNG gửi)
# ---------------------------------------------------------------------------

@router.post("/leads/{lead_id}/run-care")
def run_care(
    lead_id: str,
    body: Optional[RunCareRequest] = None,
    admin: dict = Depends(require_admin),
) -> dict:
    """Chạy chăm sóc 1 khách qua sale AI phụ trách → phân tích + tin nhắn NHÁP.

    Tái dùng crew/service (Đội Sale ảo CrewAI / heuristic). AN TOÀN: chỉ sinh NHÁP,
    KHÔNG tự gửi cho khách (requires_confirmation=true). Nếu khách chưa có sale AI
    thì tự gán 1 người (cân tải) trước khi chạy."""
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy khách hàng id={lead_id}")

    channel = (body.channel if body else "zalo") or "zalo"

    # Đảm bảo có sale AI phụ trách (auto-gán nếu chưa, không làm hỏng nếu roster trống).
    ais_id = lead.get("ai_salesman_id")
    salesman = ai_salesman_store.get(ais_id) if ais_id else None
    if salesman is None:
        assigned = ai_salesman_store.assign(lead_id, requested_by=admin.get("id"))
        if assigned.get("ok"):
            salesman = assigned.get("ai_salesman")

    from app.crew import service as crew_service  # lazy import (tránh phụ thuộc crewai khi load)

    result = crew_service.run_for_lead(lead_id, channel=channel, requested_by=admin.get("id"))
    # Đính kèm sale AI phụ trách để UI hiển thị "AI Sale phụ trách: <tên>".
    result["ai_salesman"] = (
        {
            "id": salesman.get("id"),
            "code": salesman.get("code"),
            "name": salesman.get("name"),
            "specialty": salesman.get("specialty"),
            "specialty_label": salesman.get("specialty_label"),
        }
        if salesman
        else None
    )
    return result
