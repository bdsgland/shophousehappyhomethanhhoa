"""Khu QUẢN TRỊ SÀN F2 (đa-tenant) — endpoint scoped cho CHỦ SÀN (role="agency").

Tách biệt với:
  - `/agency` (api/agency.py): hồ sơ điều kiện F2 của chính mình (register/me/...).
  - `/admin/manager/*` (require_admin): điều hành TOÀN nền tảng — agency KHÔNG gọi.

NGUYÊN TẮC BẢO MẬT (chống IDOR / rò rỉ chéo sàn):
  - Mọi endpoint gác bằng `require_agency` (role agency; admin được vào để hỗ trợ).
  - `agency_id` LUÔN suy ra từ TOKEN qua agency_application_store.get_by_owner(
    user.id).id — KHÔNG BAO GIỜ nhận agency_id từ query/body của client.
  - Dữ liệu lọc CỨNG theo agency_id: đội sale = user.agency_id == agency_id;
    khách của sàn = lead.assigned_sale_id ∈ tập sale của sàn HOẶC lead.agency_id
    == agency_id. Sàn KHÔNG bao giờ thấy sale/khách của sàn khác hay toàn nền tảng.

PHẦN NỀN (ghi chú): doanh số/hoa hồng chi tiết theo dòng tiền thực tế chưa nối ở
v1 (cơ chế hoa hồng global phức tạp — KHÔNG đụng). Báo cáo hiện dựa trên dữ liệu
lead/CRM của sàn; cấu hình hoa hồng cho sale của sàn lưu ở agency_commission_store
(bước nền), CHỈ mở khi sàn đã duyệt (commission_tier=f2_80 + can_config).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import require_agency
from app.core import agency_application_store as agency_store
from app.core import agency_commission_store, lead_store, user_store
from app.schemas.agency import AgencyCommissionUpdate

log = logging.getLogger("api.agency_admin")

router = APIRouter(prefix="/agency-admin", tags=["agency-portal"])


# ---------------------------------------------------------------------------
# Helpers — agency_id LẤY TỪ TOKEN (không nhận từ client)
# ---------------------------------------------------------------------------

def _resolve_agency(user: dict) -> dict:
    """Lấy bản ghi sàn của CHỦ SÀN đang đăng nhập (theo owner_user_id từ token).

    404 nếu tài khoản chưa có hồ sơ sàn (vd admin hỗ trợ không sở hữu sàn nào)."""
    rec = agency_store.get_by_owner(user["id"])
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tài khoản chưa gắn với hồ sơ sàn nào.",
        )
    return rec


def _team(agency_id: str) -> list[dict]:
    """Đội sale THẬT của sàn (user role=sale có agency_id == sàn)."""
    return user_store.list_by_agency(agency_id)


def _sale_ids(team: list[dict]) -> list[str]:
    return [u["id"] for u in team if u.get("id")]


def _is_unlocked(rec: dict) -> bool:
    """Sàn đã được duyệt F2 + có quyền cấu hình hoa hồng cho sale."""
    return bool(
        rec.get("status") == agency_store.STATUS_ACTIVE
        and rec.get("commission_tier") == agency_store.TIER_F2
        and rec.get("can_config_sale_commission")
    )


def _lead_counts(leads: list[dict]) -> dict:
    by_status: dict[str, int] = {}
    for l in leads:
        st = l.get("status") or "cold"
        by_status[st] = by_status.get(st, 0) + 1
    total = len(leads)
    customers = by_status.get("customer", 0)
    lost = by_status.get("lost", 0)
    active = total - lost
    conversion = round((customers / active) * 100, 1) if active > 0 else 0.0
    return {
        "total": total,
        "hot": by_status.get("hot", 0),
        "warm": by_status.get("warm", 0),
        "cold": by_status.get("cold", 0),
        "customers": customers,
        "lost": lost,
        "conversion_rate": conversion,
    }


def _sale_public(u: dict) -> dict:
    """View an toàn của 1 sale (không lộ password_hash...)."""
    return {
        "id": u.get("id"),
        "full_name": u.get("full_name"),
        "email": u.get("email"),
        "phone": u.get("phone"),
        "is_active": u.get("is_active", True),
        "region": u.get("region"),
        "referral_code": u.get("referral_code"),
        "created_at": u.get("created_at"),
    }


# ---------------------------------------------------------------------------
# GET tổng quan sàn (KPI)
# ---------------------------------------------------------------------------

@router.get("/overview")
def agency_overview(user: dict = Depends(require_agency)) -> dict:
    """KPI tổng quan của SÀN: số sale, số khách + phân rã trạng thái, chuyển đổi.

    doanh số/hoa hồng theo dòng tiền thực tế = BƯỚC NỀN (chưa nối cơ chế hoa hồng
    global) → trả null + ghi chú, KHÔNG bịa số."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    leads = lead_store.list_leads_for_agency(agency_id, _sale_ids(team))
    counts = _lead_counts(leads)
    return {
        "agency": {
            "id": agency_id,
            "ten_san": rec.get("ten_san"),
            "status": rec.get("status"),
            "commission_tier": rec.get("commission_tier"),
            "commission_pct": rec.get("commission_pct"),
            "can_config_sale_commission": rec.get("can_config_sale_commission"),
        },
        "kpi": {
            "sales_count": len(team),
            "leads_total": counts["total"],
            "leads_hot": counts["hot"],
            "leads_warm": counts["warm"],
            "leads_cold": counts["cold"],
            "customers": counts["customers"],
            "conversion_rate": counts["conversion_rate"],
            # NỀN: chưa nối dòng tiền thực tế (cơ chế hoa hồng global) → null.
            "revenue": None,
            "commission": None,
        },
        "notes": {
            "revenue_commission": (
                "Doanh số/hoa hồng theo dòng tiền thực tế là bước nền — chưa nối "
                "cơ chế hoa hồng toàn nền tảng ở phiên bản này."
            ),
        },
    }


# ---------------------------------------------------------------------------
# GET đội sale của sàn
# ---------------------------------------------------------------------------

@router.get("/team")
def agency_team(user: dict = Depends(require_agency)) -> dict:
    """Đội sale của sàn + số khách mỗi sale (lọc cứng theo agency_id từ token)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    members = []
    for u in team:
        leads_of_sale = lead_store.list_leads_for_sale(u["id"])
        m = _sale_public(u)
        m["leads_count"] = len(leads_of_sale)
        m["customers_count"] = sum(
            1 for l in leads_of_sale if l.get("status") == "customer"
        )
        members.append(m)
    return {"agency_id": agency_id, "total": len(members), "items": members}


# ---------------------------------------------------------------------------
# GET danh sách khách của sàn (CRM scoped)
# ---------------------------------------------------------------------------

@router.get("/leads")
def agency_leads(
    user: dict = Depends(require_agency),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    source: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """Danh sách KHÁCH CỦA SÀN (CRM scoped) — lọc cứng theo tập sale + dấu sàn."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    leads = lead_store.list_leads_for_agency(
        agency_id,
        _sale_ids(team),
        status=status_filter,
        source=source,
        search=search,
    )
    return {"agency_id": agency_id, "total": len(leads), "items": leads}


# ---------------------------------------------------------------------------
# GET báo cáo doanh số sàn (theo sale + theo trạng thái)
# ---------------------------------------------------------------------------

@router.get("/report")
def agency_report(user: dict = Depends(require_agency)) -> dict:
    """Báo cáo của sàn: phân rã khách theo trạng thái + hiệu suất từng sale.

    doanh số/hoa hồng (tiền) = NỀN → null (xem ghi chú overview)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    sale_ids = _sale_ids(team)
    leads = lead_store.list_leads_for_agency(agency_id, sale_ids)
    counts = _lead_counts(leads)

    # Bảng theo sale (đếm khách / khách chốt / khách nóng).
    name_by_id = {u["id"]: u.get("full_name") or u.get("email") for u in team}
    per_sale: dict[str, dict] = {
        sid: {
            "sale_id": sid,
            "sale_name": name_by_id.get(sid),
            "leads": 0,
            "customers": 0,
            "hot": 0,
        }
        for sid in sale_ids
    }
    unassigned = {"sale_id": None, "sale_name": "(chưa gán/đóng dấu sàn)",
                  "leads": 0, "customers": 0, "hot": 0}
    for l in leads:
        sid = l.get("assigned_sale_id")
        bucket = per_sale.get(sid, unassigned)
        bucket["leads"] += 1
        if l.get("status") == "customer":
            bucket["customers"] += 1
        if l.get("status") == "hot":
            bucket["hot"] += 1
    rows = list(per_sale.values())
    if unassigned["leads"] > 0:
        rows.append(unassigned)
    rows.sort(key=lambda r: r["leads"], reverse=True)

    return {
        "agency_id": agency_id,
        "summary": {
            "sales_count": len(team),
            **counts,
            "revenue": None,
            "commission": None,
        },
        "by_sale": rows,
        "notes": {
            "revenue_commission": (
                "Doanh số/hoa hồng theo dòng tiền là bước nền — chưa nối cơ chế "
                "hoa hồng toàn nền tảng."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Cấu hình hoa hồng cho sale của sàn (NỀN) — chỉ khi đã duyệt F2
# ---------------------------------------------------------------------------

@router.get("/commission")
def get_agency_commission(user: dict = Depends(require_agency)) -> dict:
    """Đọc cấu hình hoa hồng đội sale của sàn (bước nền).

    Luôn trả được cấu hình (mặc định nếu chưa đặt) + cờ `can_config` cho FE biết
    có được sửa không (khoá tới khi sàn duyệt F2)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    cfg = agency_commission_store.get_config(agency_id)
    unlocked = _is_unlocked(rec)
    return {
        "agency_id": agency_id,
        "config": cfg,
        "can_config": unlocked,
        "commission_tier": rec.get("commission_tier"),
        "status": rec.get("status"),
        "locked_reason": None if unlocked else (
            "Cần được duyệt làm đại lý F2 (mức 80%) để mở cấu hình hoa hồng cho đội sale."
        ),
        "note": (
            "Bước nền: cấu hình này chưa áp dụng vào dòng tiền thực tế (cơ chế "
            "hoa hồng toàn nền tảng giữ nguyên)."
        ),
    }


@router.put("/commission")
def update_agency_commission(
    payload: AgencyCommissionUpdate,
    user: dict = Depends(require_agency),
) -> dict:
    """Lưu cấu hình hoa hồng đội sale của sàn (NỀN).

    Chỉ cho phép khi sàn đã duyệt F2 (commission_tier=f2_80 + can_config). Lọc
    cứng theo agency_id từ token (không nhận agency_id từ client)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    if not _is_unlocked(rec):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Sàn chưa được duyệt làm đại lý F2 nên chưa thể cấu hình hoa hồng "
                "cho đội sale."
            ),
        )
    try:
        cfg = agency_commission_store.set_config(
            agency_id,
            frontline_pct=payload.frontline_pct,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return {"agency_id": agency_id, "config": cfg, "can_config": True}
