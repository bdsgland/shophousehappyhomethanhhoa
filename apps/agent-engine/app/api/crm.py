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

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr

from app.api.deps import (
    optional_service_guard,
    require_admin,
    require_sale,
)
from app.core import customer_360, lead_store, presence, sale_task_store, user_store
from app.schemas.crm import (
    ContactChannel,
    ContactLog,
    ContactLogCreate,
    CrmStats,
    Lead,
    LeadAdminUpdate,
    LeadBulkImport,
    LeadCreate,
    LeadDetail,
    LeadStatus,
    SalePerformance,
    SaleSuggestion,
    SaleTaskDaily,
)

sale_router = APIRouter(prefix="/sale", tags=["crm-sale"])
admin_router = APIRouter(prefix="/admin/crm", tags=["crm-admin"])
internal_router = APIRouter(prefix="/webhooks/internal", tags=["crm-internal"])

log = logging.getLogger(__name__)


def _serialize_lead(l: dict) -> dict:
    """Chuẩn hoá 1 lead → dict cho FE, CHỊU LỖI từng record.

    Lý do: trước đây danh sách build bằng `[Lead(**l) for l in ...]` trong 1
    comprehension — chỉ 1 record cũ/lỗi schema (vd source/status không còn trong
    enum, datetime sai định dạng) là raise → CẢ endpoint 500 → bảng rỗng dù
    /stats (chỉ đếm len) vẫn ra số. Ở đây validate qua `Lead` khi được, lỗi thì
    fallback trả thẳng dict gốc (đã JSON-safe từ public_view) để record VẪN HIỆN.
    """
    try:
        out = Lead(**l).model_dump(mode="json")
    except Exception as e:  # noqa: BLE001 — không để 1 record làm hỏng cả list
        log.warning("CRM list: lead %s không khớp schema, trả raw: %s", l.get("id"), e)
        out = dict(l)
    out["assigned_sale_name"] = _sale_name(l.get("assigned_sale_id"))
    return out


def _serialize_lead_detail(lead: dict, logs: list[dict]) -> dict:
    """Chi tiết 1 lead + contact log, CHỊU LỖI từng record (giống _serialize_lead).

    Lý do: hai endpoint detail trước đây build thẳng
    `LeadDetail(**lead, contact_logs=[ContactLog(**x) ...])` kèm
    `response_model=LeadDetail` — CHỈ 1 record cũ/lệch enum (status/source/channel/
    outcome ngoài enum, datetime sai) là raise → endpoint detail trả 500 → FE
    getCrmLead throw → trang chi tiết kẹt skeleton / trắng. Ở đây validate khi
    được, lỗi thì fallback dict gốc để record VẪN HIỆN.
    """
    out = _serialize_lead(lead)  # đã chịu lỗi + gắn assigned_sale_name
    safe_logs: list[dict] = []
    for x in logs:
        try:
            safe_logs.append(ContactLog(**x).model_dump(mode="json"))
        except Exception as e:  # noqa: BLE001 — 1 log lệch không làm hỏng detail
            log.warning("CRM detail: contact_log %s lệch schema, trả raw: %s",
                        x.get("id"), e)
            safe_logs.append(dict(x))
    out["contact_logs"] = safe_logs
    return out


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


class AssignCareBody(BaseModel):
    """Phân công chăm sóc: chọn sale + (tuỳ chọn) kênh chăm sóc."""

    sale_id: str
    channel: Optional[ContactChannel] = None


class LeadEngagedBody(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    registered: bool = False
    booked: bool = False


class LeadBulkDeleteBody(BaseModel):
    """Xoá CỨNG hàng loạt khách theo danh sách id (dọn nhanh khi import sai)."""

    ids: list[str]


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


# Nhãn field cho dòng timeline "đã cập nhật thông tin".
_FIELD_LABELS: dict[str, str] = {
    "name": "tên",
    "phone": "SĐT",
    "email": "email",
    "source": "nguồn",
    "status": "trạng thái",
    "note": "ghi chú",
    "assigned_sale_id": "người phụ trách",
    "region": "vùng miền",
    "customer_group": "tệp khách",
    "product_type": "phân khúc quan tâm",
    "budget": "ngân sách",
    "purpose": "mục đích",
    "project": "dự án quan tâm",
}


def _edit_lead_with_log(lead_id: str, old_lead: dict, fields: dict, actor: dict) -> dict:
    """Dùng chung cho sale + admin SỬA thông tin khách.

    - Dedupe SĐT/email với khách KHÁC (409 nếu trùng).
    - Cập nhật lead (lead_store.update_lead).
    - Ghi 1 mục timeline "đã cập nhật thông tin" (chỉ khi có field đổi giá trị).
    Trả lead public_view đã cập nhật. Raise 404/409 khi cần.
    """
    new_phone = fields.get("phone")
    new_email = fields.get("email")
    if new_phone or new_email:
        conflict = lead_store.find_dupe_excluding(lead_id, new_phone, new_email)
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="SĐT hoặc email đã thuộc về khách hàng khác",
            )

    # Field thực sự đổi giá trị (để mô tả timeline cho gọn, đúng).
    changed = [
        _FIELD_LABELS[k]
        for k, v in fields.items()
        if k in _FIELD_LABELS and v is not None and v != old_lead.get(k)
    ]

    updated = lead_store.update_lead(lead_id, **fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

    if changed:
        lead_store.add_activity_log(
            lead_id,
            summary="Đã cập nhật thông tin khách: " + ", ".join(changed),
            by=actor.get("id"),
            by_name=actor.get("full_name"),
        )
    return updated


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
        "items": [_serialize_lead(l) for l in page_rows],
    }


@sale_router.get("/leads/{lead_id}")
def sale_get_lead(lead_id: str, user: dict = Depends(require_sale)) -> dict:
    """Chi tiết lead + lịch sử contact log (chỉ lead của mình). Serialize an toàn."""
    lead = _require_owned_lead(lead_id, user)
    logs = lead_store.list_contact_logs(lead_id)
    return _serialize_lead_detail(lead, logs)


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
    updated = _edit_lead_with_log(lead_id, lead, fields, user)
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
        created_by_name=user.get("full_name"),
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
    page_size: int = Query(default=50, ge=1, le=1000),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Master CRM — toàn bộ lead (có lọc theo status/sale/source/search).

    page_size cap = 1000: FE master view tải 1 lô lớn rồi lọc/phân trang ở client
    (tránh 422 khi FE xin page_size=500 — vốn làm danh sách rỗng dù số lượng tăng).
    """
    result = lead_store.list_all_leads(
        status=status_filter,
        sale_id=sale_id,
        source=source,
        search=search,
        page=page,
        page_size=page_size,
    )
    result["items"] = [_serialize_lead(l) for l in result["items"]]
    return result


@admin_router.get("/leads/{lead_id}")
def admin_get_lead(lead_id: str, _admin: dict = Depends(require_admin)) -> dict:
    """Chi tiết lead + contact log + tên sale phụ trách. Serialize an toàn."""
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    logs = lead_store.list_contact_logs(lead_id)
    return _serialize_lead_detail(lead, logs)


@admin_router.patch("/leads/{lead_id}", response_model=Lead)
def admin_update_lead(
    lead_id: str,
    payload: LeadAdminUpdate,
    admin: dict = Depends(require_admin),
) -> Lead:
    """SỬA thông tin khách (admin) — name/phone/email/source/status/note/assigned.

    Validate cơ bản (Pydantic), dedupe SĐT/email với khách khác, ghi updated_at +
    1 mục timeline "đã cập nhật thông tin". Đổi assigned_sale_id kiểm tra sale hợp lệ.
    """
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    fields = payload.model_dump(exclude_unset=True, mode="json")
    new_sale = fields.get("assigned_sale_id")
    if new_sale is not None:
        sale = user_store.find_by_id(new_sale)
        if not sale or sale.get("role") not in ("sale", "admin"):
            raise HTTPException(status_code=400, detail="Sale không hợp lệ")
    updated = _edit_lead_with_log(lead_id, lead, fields, admin)
    return Lead(**updated)


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


@admin_router.get("/sale-suggestions", response_model=list[SaleSuggestion])
def admin_sale_suggestions(_admin: dict = Depends(require_admin)) -> list[SaleSuggestion]:
    """Gợi ý sale để PHÂN CÔNG chăm sóc: hiệu suất + online (presence Live Match).

    Gộp eligibility/điểm tuần (sale_task_store) với trạng thái presence realtime,
    sắp xếp ƯU TIÊN online rồi điểm cao để admin chọn người mạnh / đang trực.
    """
    ranking = sale_task_store.rank_sales_by_eligibility()
    pres = {p.get("sale_id"): p for p in presence.list_all_presence()}
    out: list[SaleSuggestion] = []
    for p in ranking:
        pr = pres.get(p["sale_id"])
        availability = pr.get("availability") if pr else None
        out.append(
            SaleSuggestion(
                sale_id=p["sale_id"],
                sale_name=p["sale_name"],
                eligibility_score=p["eligibility_score"],
                avg_daily_score=p["avg_daily_score"],
                total_deals_closed=p["total_deals_closed"],
                rank=p["rank"],
                online=(availability == "online"),
                availability=availability,
                active_calls=int(pr.get("active_calls", 0)) if pr else 0,
            )
        )
    # Online (True>False) trước, rồi eligibility_score giảm dần.
    out.sort(key=lambda s: (s.online, s.eligibility_score), reverse=True)
    return out


@admin_router.post("/leads/{lead_id}/assign-care", response_model=Lead)
def admin_assign_care(
    lead_id: str,
    payload: AssignCareBody,
    admin: dict = Depends(require_admin),
) -> Lead:
    """PHÂN CÔNG chăm sóc 1 khách cho sale + (tuỳ chọn) kênh chăm sóc.

    Tái dùng assign_lead (set assigned_sale + updated_at) rồi ghi 1 mục timeline
    "Đã giao [sale] chăm sóc qua [kênh]" để hiện trên dòng thời gian hồ sơ 360°.
    """
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    sale = user_store.find_by_id(payload.sale_id)
    if not sale or sale.get("role") not in ("sale", "admin"):
        raise HTTPException(status_code=400, detail="Sale không hợp lệ")
    updated = lead_store.assign_lead(lead_id, payload.sale_id, by_admin_id=admin["id"])
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    sale_name = sale.get("full_name") or "sale"
    summary = f"Đã giao {sale_name} chăm sóc"
    if payload.channel is not None:
        summary += f" qua {customer_360.channel_label(payload.channel.value)}"
    lead_store.add_activity_log(
        lead_id, summary=summary, by=admin.get("id"), by_name=admin.get("full_name"),
    )
    return Lead(**updated)


@admin_router.delete("/leads/{lead_id}", response_model=Lead)
def admin_soft_delete_lead(lead_id: str, _admin: dict = Depends(require_admin)) -> Lead:
    """Xoá mềm lead (set status=lost). KHÔNG hard-delete."""
    updated = lead_store.soft_delete(lead_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return Lead(**updated)


@admin_router.post("/leads/bulk-delete")
def admin_bulk_delete_leads(
    payload: LeadBulkDeleteBody,
    admin: dict = Depends(require_admin),
) -> dict:
    """XOÁ CỨNG hàng loạt khách theo danh sách id — dọn nhanh khi import sai.

    CHỈ admin (require_admin). KHÔNG hoàn tác được. Bỏ qua id không tồn tại
    (trả trong `not_found`). Sau khi xoá, giảm assigned_count của Đội Sale AI
    cho khớp (best-effort) và ghi audit `lead.bulk_delete`. CHỈ đụng dữ liệu
    lead/khách — không xoá sang bảng khác.

    Trả {deleted_count, deleted_ids, not_found}.
    """
    ids = [i for i in (payload.ids or []) if i]
    if not ids:
        raise HTTPException(status_code=400, detail="Danh sách id rỗng")

    result = lead_store.delete_leads(ids)
    deleted = result["deleted"]

    # Giảm tải Đội Sale AI cho các lead đã gán (best-effort — không vỡ luồng xoá).
    freed = result.get("freed_ai_salesmen") or {}
    if freed:
        try:
            from app.core import ai_salesman_store

            ai_salesman_store.decrement_assigned(freed)
        except Exception as exc:  # noqa: BLE001
            log.warning("giảm tải sale AI sau bulk-delete lỗi: %s", exc)

    # Audit lead.bulk_delete (số lượng + ai xoá) — best-effort.
    try:
        from app.core import audit_store

        audit_store.record(
            "lead.bulk_delete",
            {
                "count": len(deleted),
                "deleted_ids": deleted,
                "not_found": result["not_found"],
                "actor_id": admin.get("id"),
                "actor_email": admin.get("email"),
                "actor_name": admin.get("full_name"),
            },
            detail=f"admin {admin.get('email') or admin.get('id')} xoá {len(deleted)} khách",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("audit lead.bulk_delete lỗi: %s", exc)

    return {
        "deleted_count": len(deleted),
        "deleted_ids": deleted,
        "not_found": result["not_found"],
    }


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
