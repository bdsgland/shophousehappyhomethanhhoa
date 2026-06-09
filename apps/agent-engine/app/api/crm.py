"""CRM API — quản lý khách hàng + daily task sale + hot lead distribution.

Ba nhóm endpoint, mount cùng file:
  • sale_router   (prefix /sale)        — sale thao tác CRM của mình
  • admin_router  (prefix /admin/crm)   — admin master view + phân bổ hot lead
  • internal_router (/webhooks/internal)— n8n / middleware gọi khi user engage

Phân tách dữ liệu: sale CHỈ thấy/sửa lead có assigned_sale_id == mình (admin
xem hết). Soft-delete only (status=lost). Lưu JSON interim (lead_store +
sale_task_store) — sau migrate PostgreSQL.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr

from app.api.deps import (
    optional_service_guard,
    require_admin,
    require_sale,
)
from app.core import lead_store, sale_task_store, user_store
from app.schemas.crm import (
    ContactLog,
    ContactLogCreate,
    CrmStats,
    Lead,
    LeadBulkImport,
    LeadCreate,
    LeadDetail,
    LeadStatus,
    SalePerformance,
    SaleTaskDaily,
)

sale_router = APIRouter(prefix="/sale", tags=["crm-sale"])
admin_router = APIRouter(prefix="/admin/crm", tags=["crm-admin"])
internal_router = APIRouter(prefix="/webhooks/internal", tags=["crm-internal"])


# ---------------------------------------------------------------------------
# Request bodies cục bộ (khai báo trước endpoint để FastAPI resolve type hints)
# ---------------------------------------------------------------------------

class LeadUpdateBody(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    status: Optional[LeadStatus] = None
    note: Optional[str] = None


class AssignBody(BaseModel):
    sale_id: str


class LeadEngagedBody(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    registered: bool = False
    booked: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sale_owns(lead: dict, user: dict) -> bool:
    """Sale sở hữu lead? Admin luôn True (xem hết)."""
    if user.get("role") == "admin":
        return True
    return lead.get("assigned_sale_id") == user["id"]


def _require_owned_lead(lead_id: str, user: dict) -> dict:
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    if not _sale_owns(lead, user):
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc về bạn")
    return lead


def _sale_name(sale_id: Optional[str]) -> Optional[str]:
    if not sale_id:
        return None
    u = user_store.find_by_id(sale_id)
    return u.get("full_name") if u else None


# ===========================================================================
# SALE ENDPOINTS
# ===========================================================================

@sale_router.post("/leads", response_model=Lead, status_code=status.HTTP_201_CREATED)
def sale_create_lead(payload: LeadCreate, user: dict = Depends(require_sale)) -> Lead:
    """Sale tạo 1 lead (tự phụ trách). Tăng new_leads_added trong task hôm nay."""
    lead = lead_store.create_lead(
        payload.model_dump(mode="json"), imported_by_sale_id=user["id"]
    )
    sale_task_store.increment_metric(user["id"], "new_leads_added", 1)
    return Lead(**lead)


@sale_router.post("/leads/bulk-import")
def sale_bulk_import(payload: LeadBulkImport, user: dict = Depends(require_sale)) -> dict:
    """Import nhiều lead từ danh bạ. Tăng new_leads_added theo số đã thêm."""
    leads_data = [l.model_dump(mode="json") for l in payload.leads]
    result = lead_store.bulk_import_leads(
        leads_data, user["id"], skip_duplicates=payload.skip_duplicates
    )
    if result["imported"]:
        sale_task_store.increment_metric(
            user["id"], "new_leads_added", result["imported"]
        )
    return result


@sale_router.get("/leads")
def sale_list_leads(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(require_sale),
) -> dict:
    """Danh sách lead của sale đang đăng nhập (có lọc + phân trang)."""
    rows = lead_store.list_leads_for_sale(user["id"], status=status_filter, search=search)
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [Lead(**l).model_dump(mode="json") for l in page_rows],
    }


@sale_router.get("/leads/{lead_id}", response_model=LeadDetail)
def sale_get_lead(lead_id: str, user: dict = Depends(require_sale)) -> LeadDetail:
    """Chi tiết lead + lịch sử contact log (chỉ lead của mình)."""
    lead = _require_owned_lead(lead_id, user)
    logs = lead_store.list_contact_logs(lead_id)
    return LeadDetail(
        **lead,
        contact_logs=[ContactLog(**x) for x in logs],
        assigned_sale_name=_sale_name(lead.get("assigned_sale_id")),
    )


@sale_router.patch("/leads/{lead_id}", response_model=Lead)
def sale_update_lead(
    lead_id: str,
    payload: LeadUpdateBody,
    user: dict = Depends(require_sale),
) -> Lead:
    """Cập nhật status/note (lead của mình). Chốt deal (→customer) ghi nhận KPI."""
    lead = _require_owned_lead(lead_id, user)
    fields = payload.model_dump(exclude_unset=True, mode="json")
    fields.pop("assigned_sale_id", None)  # sale không tự đổi người phụ trách
    new_status = fields.get("status")
    updated = lead_store.update_lead(lead_id, **fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    # Chốt deal: lần đầu chuyển sang "customer" → +1 hot_leads_closed cho sale.
    if new_status == "customer" and lead.get("status") != "customer":
        sale_task_store.increment_metric(user["id"], "hot_leads_closed", 1)
    return Lead(**updated)


@sale_router.post(
    "/leads/{lead_id}/contact-log",
    response_model=ContactLog,
    status_code=status.HTTP_201_CREATED,
)
def sale_add_contact_log(
    lead_id: str,
    payload: ContactLogCreate,
    user: dict = Depends(require_sale),
) -> ContactLog:
    """Ghi 1 contact log cho lead. Tăng contacts_made trong task hôm nay."""
    _require_owned_lead(lead_id, user)
    log = lead_store.add_contact_log(
        lead_id,
        user["id"],
        channel=payload.channel.value,
        note=payload.note,
        outcome=payload.outcome,
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    sale_task_store.increment_metric(user["id"], "contacts_made", 1)
    return ContactLog(**log)


@sale_router.get("/tasks/today", response_model=SaleTaskDaily)
def sale_today_task(user: dict = Depends(require_sale)) -> SaleTaskDaily:
    """KPI hôm nay của sale (score + target + check-in)."""
    task = sale_task_store.get_or_create_today_task(user["id"])
    return SaleTaskDaily(**task)


@sale_router.post("/tasks/check-in", response_model=SaleTaskDaily)
def sale_check_in(user: dict = Depends(require_sale)) -> SaleTaskDaily:
    """Sale check-in hoàn thành ngày."""
    task = sale_task_store.check_in_today(user["id"])
    return SaleTaskDaily(**task)


@sale_router.get("/performance/me", response_model=SalePerformance)
def sale_my_performance(user: dict = Depends(require_sale)) -> SalePerformance:
    """Hiệu suất tuần + thứ hạng của sale đang đăng nhập."""
    ranking = sale_task_store.rank_sales_by_eligibility()
    for p in ranking:
        if p["sale_id"] == user["id"]:
            return SalePerformance(**p)
    # Chưa có trong ranking (vd admin) → trả perf riêng, rank cuối.
    perf = sale_task_store.get_weekly_performance(
        user["id"], user.get("full_name", "")
    )
    perf["rank"] = len(ranking) + 1
    return SalePerformance(**perf)


@sale_router.get("/leaderboard", response_model=list[SalePerformance])
def sale_leaderboard(user: dict = Depends(require_sale)) -> list[SalePerformance]:
    """Top 10 sale tuần này (bảng xếp hạng)."""
    ranking = sale_task_store.rank_sales_by_eligibility()
    return [SalePerformance(**p) for p in ranking[:10]]


# ===========================================================================
# ADMIN ENDPOINTS
# ===========================================================================

@admin_router.get("/leads")
def admin_list_leads(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    sale_id: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Master CRM — toàn bộ lead (có lọc theo status/sale/source/search)."""
    result = lead_store.list_all_leads(
        status=status_filter,
        sale_id=sale_id,
        source=source,
        search=search,
        page=page,
        page_size=page_size,
    )
    result["items"] = [
        {**Lead(**l).model_dump(mode="json"),
         "assigned_sale_name": _sale_name(l.get("assigned_sale_id"))}
        for l in result["items"]
    ]
    return result


@admin_router.get("/leads/{lead_id}", response_model=LeadDetail)
def admin_get_lead(lead_id: str, _admin: dict = Depends(require_admin)) -> LeadDetail:
    """Chi tiết lead + contact log + tên sale phụ trách."""
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    logs = lead_store.list_contact_logs(lead_id)
    return LeadDetail(
        **lead,
        contact_logs=[ContactLog(**x) for x in logs],
        assigned_sale_name=_sale_name(lead.get("assigned_sale_id")),
    )


@admin_router.patch("/leads/{lead_id}/assign", response_model=Lead)
def admin_assign_lead(
    lead_id: str,
    payload: AssignBody,
    admin: dict = Depends(require_admin),
) -> Lead:
    """Reassign lead cho 1 sale khác."""
    sale = user_store.find_by_id(payload.sale_id)
    if not sale or sale.get("role") not in ("sale", "admin"):
        raise HTTPException(status_code=400, detail="Sale không hợp lệ")
    updated = lead_store.assign_lead(lead_id, payload.sale_id, by_admin_id=admin["id"])
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return Lead(**updated)


@admin_router.delete("/leads/{lead_id}", response_model=Lead)
def admin_soft_delete_lead(lead_id: str, _admin: dict = Depends(require_admin)) -> Lead:
    """Xoá mềm lead (set status=lost). KHÔNG hard-delete."""
    updated = lead_store.soft_delete(lead_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return Lead(**updated)


@admin_router.post("/leads/{lead_id}/mark-hot", response_model=Lead)
def admin_mark_hot(lead_id: str, _admin: dict = Depends(require_admin)) -> Lead:
    """Đánh dấu HOT thủ công."""
    updated = lead_store.mark_as_hot(lead_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return Lead(**updated)


@admin_router.post("/hot-leads/auto-distribute")
def admin_auto_distribute(_admin: dict = Depends(require_admin)) -> dict:
    """Phân bổ tất cả hot lead chưa có sale phụ trách cho top sale."""
    return lead_store.distribute_pending_hot_leads()


@admin_router.get("/sales/performance", response_model=list[SalePerformance])
def admin_sales_performance(_admin: dict = Depends(require_admin)) -> list[SalePerformance]:
    """Bảng hiệu suất toàn bộ sale (đã xếp hạng)."""
    ranking = sale_task_store.rank_sales_by_eligibility()
    return [SalePerformance(**p) for p in ranking]


@admin_router.get("/sales/ranking", response_model=list[SalePerformance])
def admin_sales_ranking(_admin: dict = Depends(require_admin)) -> list[SalePerformance]:
    """Leaderboard ranking (alias của performance, giữ theo spec)."""
    ranking = sale_task_store.rank_sales_by_eligibility()
    return [SalePerformance(**p) for p in ranking]


@admin_router.get("/stats", response_model=CrmStats)
def admin_stats(_admin: dict = Depends(require_admin)) -> CrmStats:
    """KPI dashboard: tổng lead, hot, customer, conversion, top sources."""
    return CrmStats(**lead_store.compute_stats())


# ===========================================================================
# INTERNAL WEBHOOK (n8n / middleware)
# ===========================================================================

@internal_router.post("/lead-engaged")
def lead_engaged(
    payload: LeadEngagedBody,
    _guard: dict = Depends(optional_service_guard),
) -> dict:
    """n8n gọi khi user web register hoặc book.

    Khớp email/phone với lead có sẵn → đánh dấu registered/booking → nếu đủ
    "nét" (đã đăng ký + có booking) thì mark HOT và auto-distribute cho top sale.
    """
    lead = lead_store.find_by_contact(payload.phone, payload.email)
    if not lead:
        return {"matched": False, "marked_hot": False, "assigned_sale_id": None}

    fields: dict = {}
    if payload.registered:
        fields["registered"] = True
    if payload.booked:
        fields["booking_count"] = (lead.get("booking_count", 0) + 1)
    if fields:
        lead = lead_store.update_lead(lead["id"], **fields) or lead

    became_hot = False
    assigned_sale_id = lead.get("assigned_sale_id")
    # Khách "nét" = đã đăng ký tài khoản + có ≥1 booking → mark hot + distribute.
    if lead.get("registered") and lead.get("booking_count", 0) >= 1:
        if lead.get("status") != "hot":
            lead = lead_store.mark_as_hot(lead["id"]) or lead
            became_hot = True
        if not lead.get("assigned_sale_id"):
            assigned_sale_id = lead_store.auto_distribute_hot_lead(lead["id"])
        else:
            assigned_sale_id = lead.get("assigned_sale_id")

    return {
        "matched": True,
        "lead_id": lead["id"],
        "marked_hot": became_hot,
        "assigned_sale_id": assigned_sale_id,
    }
