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

AI Ở MỌI KHÂU (tái dùng backend sẵn có, LỌC THEO SÀN):
  - ai_crm: chấm điểm/tầng/next-action lead (rescore scoped theo tập lead của sàn).
  - ai_care_engine + ai_care_queue_store: Đội Sale AI chăm khách (chu kỳ chỉ chạy
    trên lead của sàn qua only_lead_ids).
  - improvements/ai-assistant: phân tích & tư vấn điều hành dựa trên SỐ THẬT của
    sàn — Claude thật, fallback heuristic khi thiếu key. CHỈ GỢI Ý, không thực thi.

PHẦN NỀN (ghi chú): doanh số/hoa hồng chi tiết theo dòng tiền thực tế chưa nối ở
v1 (cơ chế hoa hồng global phức tạp — KHÔNG đụng). Cấu hình hoa hồng cho sale của
sàn lưu ở agency_commission_store, CHỈ mở khi sàn đã duyệt (f2_80 + can_config).
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import require_agency
from app.core import agency_application_store as agency_store
from app.core import (
    agency_commission_store,
    agency_sale_request_store,
    ai_care_engine,
    ai_care_queue_store,
    ai_crm,
    booking_store,
    customer_360,
    lead_store,
    pipeline as pipeline_core,
    user_store,
)
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


def _scope(user: dict) -> tuple[dict, str, list[dict], list[dict]]:
    """Bộ khung scoped dùng chung: (rec, agency_id, team, leads của sàn)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    leads = lead_store.list_leads_for_agency(agency_id, _sale_ids(team))
    return rec, agency_id, team, leads


def _lead_id_set(leads: list[dict]) -> set:
    return {l.get("id") for l in leads if l.get("id")}


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
# Biểu đồ phái sinh (trend / funnel / nguồn) — TÍNH TỪ lead của sàn, không bịa
# ---------------------------------------------------------------------------

def _month_key(iso: Optional[str]) -> Optional[str]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", ""))
        return f"{dt.year:04d}-{dt.month:02d}"
    except (ValueError, TypeError):
        return None


def _build_trends(leads: list[dict], months: int = 6) -> list[dict]:
    """Khách MỚI & khách CHỐT theo tháng (months tháng gần nhất, kể cả tháng 0)."""
    now = datetime.utcnow()
    # Khung tháng liên tục (kể cả tháng không có dữ liệu → cột 0, đồ thị đẹp).
    keys: list[str] = []
    y, m = now.year, now.month
    for _ in range(months):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    keys.reverse()
    new_by: Counter = Counter()
    won_by: Counter = Counter()
    for l in leads:
        mk = _month_key(l.get("created_at"))
        if mk:
            new_by[mk] += 1
        if l.get("status") == "customer":
            wk = _month_key(l.get("updated_at")) or _month_key(l.get("created_at"))
            if wk:
                won_by[wk] += 1
    return [
        {"month": k, "label": k[5:] + "/" + k[2:4],
         "new_leads": int(new_by.get(k, 0)), "customers": int(won_by.get(k, 0))}
        for k in keys
    ]


def _build_funnel(leads: list[dict]) -> list[dict]:
    """Phễu chuyển đổi từ trạng thái lead (không cần tra cứu nặng)."""
    total = len(leads)
    contacted = sum(1 for l in leads if (l.get("contact_count") or 0) > 0
                    or l.get("status") in ("warm", "hot", "customer"))
    interested = sum(1 for l in leads if l.get("status") in ("warm", "hot", "customer"))
    hot = sum(1 for l in leads if l.get("status") in ("hot", "customer"))
    customers = sum(1 for l in leads if l.get("status") == "customer")
    return [
        {"key": "total", "label": "Tổng khách", "count": total},
        {"key": "contacted", "label": "Đã tiếp cận", "count": contacted},
        {"key": "interested", "label": "Quan tâm", "count": interested},
        {"key": "hot", "label": "Nóng", "count": hot},
        {"key": "customer", "label": "Đã chốt", "count": customers},
    ]


def _build_sources(leads: list[dict]) -> list[dict]:
    by: Counter = Counter()
    for l in leads:
        by[(l.get("source") or "khác")] += 1
    return [
        {"source": s, "count": c}
        for s, c in sorted(by.items(), key=lambda kv: kv[1], reverse=True)
    ]


def _name_by_id(team: list[dict]) -> dict:
    return {u["id"]: (u.get("full_name") or u.get("email")) for u in team}


def _enrich_lead(lead: dict, name_by_id: dict) -> dict:
    """Bổ sung tên sale phụ trách + giữ nguyên các trường AI sẵn có (public_view)."""
    out = dict(lead)
    out["assigned_sale_name"] = name_by_id.get(lead.get("assigned_sale_id"))
    return out


# ---------------------------------------------------------------------------
# GET tổng quan sàn (KPI + trend + funnel + nguồn)
# ---------------------------------------------------------------------------

@router.get("/overview")
def agency_overview(user: dict = Depends(require_agency)) -> dict:
    """KPI tổng quan của SÀN + dữ liệu biểu đồ (trend/funnel/nguồn) cho dashboard.

    doanh số/hoa hồng theo dòng tiền thực tế = BƯỚC NỀN (chưa nối cơ chế hoa hồng
    global) → trả null + ghi chú, KHÔNG bịa số."""
    rec, agency_id, team, leads = _scope(user)
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
        "trends": _build_trends(leads),
        "funnel": _build_funnel(leads),
        "sources": _build_sources(leads),
        "notes": {
            "revenue_commission": (
                "Doanh số/hoa hồng theo dòng tiền thực tế là bước nền — chưa nối "
                "cơ chế hoa hồng toàn nền tảng ở phiên bản này."
            ),
        },
    }


# ---------------------------------------------------------------------------
# GET đội sale của sàn (+ gợi ý AI cân tải)
# ---------------------------------------------------------------------------

@router.get("/team")
def agency_team(user: dict = Depends(require_agency)) -> dict:
    """Đội sale của sàn + số khách mỗi sale + GỢI Ý AI (cân tải/cần hỗ trợ)."""
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
        m["hot_count"] = sum(1 for l in leads_of_sale if l.get("status") == "hot")
        m["conversion_rate"] = (
            round(m["customers_count"] / m["leads_count"] * 100, 1)
            if m["leads_count"] else 0.0
        )
        members.append(m)
    return {
        "agency_id": agency_id,
        "total": len(members),
        "items": members,
        "suggestions": _team_suggestions(members),
    }


def _team_suggestions(members: list[dict]) -> list[dict]:
    """Gợi ý AI (heuristic, không tốn token): cân tải + sale cần hỗ trợ."""
    out: list[dict] = []
    if not members:
        return out
    loads = [m["leads_count"] for m in members]
    avg = sum(loads) / len(loads) if loads else 0
    # Quá tải vs nhàn rỗi → đề xuất phân bổ lại.
    busy = max(members, key=lambda m: m["leads_count"])
    idle = min(members, key=lambda m: m["leads_count"])
    if busy["leads_count"] >= 5 and busy["leads_count"] >= idle["leads_count"] * 2 + 1:
        out.append({
            "severity": "medium",
            "title": "Lệch tải giữa các sale",
            "detail": (
                f"{busy['full_name'] or 'Một sale'} đang giữ {busy['leads_count']} "
                f"khách trong khi {idle['full_name'] or 'sale khác'} chỉ có "
                f"{idle['leads_count']}. Cân nhắc phân bổ lại để khách được chăm kịp."
            ),
        })
    # Có khách nhưng chốt = 0 → cần hỗ trợ kỹ năng/kịch bản.
    for m in members:
        if m["leads_count"] >= 8 and m["customers_count"] == 0:
            out.append({
                "severity": "high",
                "title": f"{m['full_name'] or 'Sale'} chưa chốt được khách",
                "detail": (
                    f"Đang phụ trách {m['leads_count']} khách nhưng chưa có khách "
                    "chốt. Nên kèm cặp kịch bản chốt & rà chất lượng nguồn."
                ),
            })
    if not out:
        out.append({
            "severity": "low",
            "title": "Đội sale đang vận hành ổn",
            "detail": (
                f"Tải trung bình ~{round(avg, 1)} khách/sale, chưa thấy lệch tải "
                "đáng kể. Tiếp tục theo dõi tỉ lệ chuyển đổi từng người."
            ),
        })
    return out


# ---------------------------------------------------------------------------
# GET danh sách khách của sàn (CRM scoped) + AI fields + tên sale
# ---------------------------------------------------------------------------

@router.get("/leads")
def agency_leads(
    user: dict = Depends(require_agency),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    source: Optional[str] = None,
    search: Optional[str] = None,
    tier: Optional[str] = None,
) -> dict:
    """Danh sách KHÁCH CỦA SÀN (CRM scoped) — lọc cứng theo tập sale + dấu sàn.

    Mỗi khách kèm điểm/tầng/next-action AI (nếu đã chấm) + tên sale phụ trách +
    danh sách sale của sàn (để phân công ngay trên bảng)."""
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
    if tier:
        leads = [l for l in leads if (l.get("ai_tier") or "") == tier]
    nbi = _name_by_id(team)
    items = [_enrich_lead(l, nbi) for l in leads]
    return {
        "agency_id": agency_id,
        "total": len(items),
        "items": items,
        "team": [{"id": u.get("id"), "full_name": u.get("full_name") or u.get("email")}
                 for u in team],
    }


def _owned_lead_or_404(agency_id: str, team: list[dict], lead_id: str) -> dict:
    """Lấy 1 lead VÀ xác nhận thuộc sàn (chống IDOR). 404 nếu không thuộc sàn."""
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    sale_set = set(_sale_ids(team))
    in_scope = (
        lead.get("assigned_sale_id") in sale_set
        or (lead.get("agency_id") or "") == agency_id
    )
    if not in_scope:
        # Không tiết lộ tồn tại lead của sàn khác → 404 (không 403).
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return lead


class AssignBody(BaseModel):
    sale_id: str = Field(..., min_length=1)


@router.post("/leads/{lead_id}/assign")
def agency_assign_lead(
    lead_id: str,
    body: AssignBody,
    user: dict = Depends(require_agency),
) -> dict:
    """Phân công 1 khách CỦA SÀN cho 1 sale CỦA SÀN (lọc cứng cả hai đầu)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    _owned_lead_or_404(agency_id, team, lead_id)
    if body.sale_id not in set(_sale_ids(team)):
        raise HTTPException(
            status_code=400, detail="Sale không thuộc đội của sàn."
        )
    updated = lead_store.assign_lead(lead_id, body.sale_id, by_admin_id=user.get("id"))
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    nbi = _name_by_id(team)
    return {"ok": True, "lead": _enrich_lead(updated, nbi)}


@router.post("/leads/rescore")
async def agency_rescore_leads(
    user: dict = Depends(require_agency),
    limit: int = Query(default=40, ge=1, le=200),
) -> dict:
    """Chấm điểm AI lại cho KHÁCH CỦA SÀN (tái dùng ai_crm, lọc theo tập lead).

    AN TOÀN: ai_crm tự fallback công thức engagement khi thiếu API key; giới hạn
    `limit` để bảo vệ chi phí. Trả số khách đã chấm."""
    rec, agency_id, team, leads = _scope(user)
    ids = list(_lead_id_set(leads))[:limit]
    scored = await ai_crm.rescore_leads(ids, force=True)
    return {"ok": True, "scored": scored, "requested": len(ids)}


@router.get("/leads/{lead_id}/profile-360")
def agency_lead_profile(
    lead_id: str,
    user: dict = Depends(require_agency),
) -> dict:
    """Hồ sơ 360° của 1 khách CỦA SÀN (tái dùng customer_360, scoped theo sàn)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    lead = _owned_lead_or_404(agency_id, team, lead_id)
    sale_name = _name_by_id(team).get(lead.get("assigned_sale_id"))
    profile = customer_360.load_profile(lead_id, assigned_sale_name=sale_name)
    if profile is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    return profile


# ---------------------------------------------------------------------------
# PIPELINE (kanban) của sàn — scoped
# ---------------------------------------------------------------------------

@router.get("/pipeline")
def agency_pipeline(user: dict = Depends(require_agency)) -> dict:
    """Khách của sàn nhóm theo GIAI ĐOẠN chuyển đổi (kanban) — lọc cứng theo sàn."""
    rec, agency_id, team, leads = _scope(user)
    nbi = _name_by_id(team)
    try:
        all_bookings = booking_store.list_all()
    except Exception:  # noqa: BLE001
        all_bookings = []
    try:
        from app.core import learning_store
        all_quotes = learning_store.list_quotes()
    except Exception:  # noqa: BLE001
        all_quotes = []

    columns: dict[str, dict] = {
        meta["key"]: {"key": meta["key"], "label": meta["label"],
                      "rank": meta["rank"], "leads": []}
        for meta in pipeline_core.stages_meta()
    }
    for lead in leads:
        try:
            my_bk, my_qt = customer_360.find_deals_for_lead(lead, all_bookings, all_quotes)
        except Exception:  # noqa: BLE001
            my_bk, my_qt = [], []
        stage = pipeline_core.derive_stage(lead, my_bk, my_qt)
        card = {
            "id": lead.get("id"),
            "name": lead.get("name"),
            "phone": lead.get("phone"),
            "status": lead.get("status"),
            "ai_score": lead.get("ai_score", 0),
            "ai_tier": lead.get("ai_tier"),
            "assigned_sale_name": nbi.get(lead.get("assigned_sale_id")),
            "stage": stage,
            "updated_at": lead.get("updated_at"),
        }
        columns.setdefault(stage, columns["new"])["leads"].append(card)
    stages = sorted(columns.values(), key=lambda c: c["rank"] if c["rank"] >= 0 else 99)
    for col in stages:
        col["count"] = len(col["leads"])
    total = sum(col["count"] for col in stages)
    return {"agency_id": agency_id, "stages": stages, "total": total}


# ---------------------------------------------------------------------------
# ĐỘI SALE AI — hàng đợi chăm sóc scoped + chạy chu kỳ + duyệt/bỏ qua
# ---------------------------------------------------------------------------

@router.get("/care-queue")
def agency_care_queue(
    user: dict = Depends(require_agency),
    status_filter: Optional[str] = Query(default="pending", alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict:
    """Hàng đợi chăm sóc của Đội Sale AI — CHỈ các mục của khách thuộc sàn."""
    rec, agency_id, team, leads = _scope(user)
    lead_ids = _lead_id_set(leads)
    st = None if status_filter in ("all", "", None) else status_filter
    # Lấy rộng rồi LỌC CỨNG theo tập lead của sàn (ai_care_queue toàn nền tảng).
    raw = ai_care_queue_store.list_items(status=st, page=1, page_size=2000)
    items = [it for it in raw.get("items", []) if it.get("lead_id") in lead_ids]
    # Thống kê theo trạng thái (scoped).
    all_scoped = [
        it for it in ai_care_queue_store.list_items(status=None, page=1, page_size=5000).get("items", [])
        if it.get("lead_id") in lead_ids
    ]
    stat: Counter = Counter(it.get("status") for it in all_scoped)
    total = len(items)
    start = (page - 1) * page_size
    return {
        "agency_id": agency_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items[start : start + page_size],
        "stats": {
            "pending": int(stat.get("pending", 0)),
            "approved": int(stat.get("approved", 0)),
            "skipped": int(stat.get("skipped", 0)),
            "sent": int(stat.get("sent", 0)),
            "total": len(all_scoped),
        },
    }


class CareRunBody(BaseModel):
    dry_run: bool = False
    batch_limit: Optional[int] = Field(default=10, ge=1, le=50)
    due_days: Optional[int] = Field(default=None, ge=0, le=365)
    channel: Optional[str] = "zalo"


@router.post("/care-queue/run")
def agency_care_run(
    body: Optional[CareRunBody] = None,
    user: dict = Depends(require_agency),
) -> dict:
    """Chạy 1 chu kỳ chăm sóc AI CHỈ trên khách CỦA SÀN (only_lead_ids scoped).

    AN TOÀN: chỉ tạo NHÁP, KHÔNG gửi tin cho khách. Có batch_limit chống tốn
    token. `dry_run=true` để xem trước ứng viên mà không gọi LLM."""
    rec, agency_id, team, leads = _scope(user)
    b = body or CareRunBody()
    lead_ids = _lead_id_set(leads)
    if not lead_ids:
        return {"ok": True, "queued": 0, "scanned_candidates": 0,
                "note": "Sàn chưa có khách để chăm sóc.", "items": [], "errors": []}
    result = ai_care_engine.run_cycle(
        due_days=b.due_days,
        batch_limit=b.batch_limit,
        channel=b.channel or "zalo",
        requested_by=user.get("id"),
        dry_run=b.dry_run,
        only_lead_ids=lead_ids,
    )
    return result


def _scoped_care_item_or_404(agency_id: str, team: list[dict], item_id: str) -> dict:
    item = ai_care_queue_store.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục hàng đợi")
    # Xác nhận lead của mục thuộc sàn (chống IDOR chéo sàn).
    _owned_lead_or_404(agency_id, team, item.get("lead_id"))
    return item


@router.post("/care-queue/{item_id}/approve")
def agency_care_approve(item_id: str, user: dict = Depends(require_agency)) -> dict:
    """Duyệt 1 nháp chăm sóc — CHỈ khi mục thuộc khách của sàn. KHÔNG tự gửi tin."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    _scoped_care_item_or_404(agency_id, team, item_id)
    item = ai_care_queue_store.approve(item_id, by=user.get("id"))
    return {"ok": True, "item": item, "auto_sent": False,
            "note": "Đã duyệt — KHÔNG tự gửi. Sale tự gửi tin sau khi duyệt."}


@router.post("/care-queue/{item_id}/skip")
def agency_care_skip(item_id: str, user: dict = Depends(require_agency)) -> dict:
    """Bỏ qua 1 nháp chăm sóc — CHỈ khi mục thuộc khách của sàn."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    team = _team(agency_id)
    _scoped_care_item_or_404(agency_id, team, item_id)
    item = ai_care_queue_store.skip(item_id, by=user.get("id"))
    return {"ok": True, "item": item}


# ---------------------------------------------------------------------------
# BÁO CÁO của sàn (theo sale + trạng thái + biểu đồ)
# ---------------------------------------------------------------------------

@router.get("/report")
def agency_report(user: dict = Depends(require_agency)) -> dict:
    """Báo cáo của sàn: phân rã khách theo trạng thái + hiệu suất từng sale +
    biểu đồ (trend/funnel/nguồn).

    doanh số/hoa hồng (tiền) = NỀN → null (xem ghi chú overview)."""
    rec, agency_id, team, leads = _scope(user)
    counts = _lead_counts(leads)
    sale_ids = _sale_ids(team)
    name_by_id = _name_by_id(team)
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
        "trends": _build_trends(leads),
        "funnel": _build_funnel(leads),
        "sources": _build_sources(leads),
        "notes": {
            "revenue_commission": (
                "Doanh số/hoa hồng theo dòng tiền là bước nền — chưa nối cơ chế "
                "hoa hồng toàn nền tảng."
            ),
        },
    }


# ---------------------------------------------------------------------------
# AI: ĐỀ XUẤT CẢI TIẾN cho SÀN (scoped) — Claude thật, fallback heuristic
# ---------------------------------------------------------------------------

_AGENCY_IMPROVEMENTS_SYSTEM = (
    "Bạn là cố vấn vận hành cho MỘT SÀN giao dịch bất động sản (đại lý F2). Bạn "
    "nhận BÁO CÁO SỐ THẬT (JSON) CHỈ về sàn này: đội sale, khách (lead) + phễu "
    "chuyển đổi, khách nóng, hàng đợi chăm sóc AI, nguồn khách. Nhiệm vụ: phân "
    "tích và đề xuất 3-5 CẢI TIẾN CỤ THỂ cho CHỦ SÀN, mỗi đề xuất kèm lý do dựa "
    "trên số liệu (vd 'có X khách nóng chưa phân công', 'kênh Y nhiều khách nhưng "
    "chốt thấp', 'tải đội sale lệch'). TUYỆT ĐỐI KHÔNG bịa số ngoài báo cáo; thiếu "
    "dữ liệu thì nói 'chưa đủ dữ liệu'. CHỈ gợi ý cho người quyết định — KHÔNG ra "
    "lệnh thực thi.\n"
    'CHỈ trả JSON đúng dạng: {"improvements": [{"title": <ngắn gọn>, '
    '"area": <lead|team|care|conversion|marketing|other>, '
    '"severity": <high|medium|low>, "detail": <giải thích kèm số liệu>, '
    '"suggested_action": <hành động đề xuất cho chủ sàn>}]}'
)


def _scoped_report(rec: dict, team: list[dict], leads: list[dict]) -> dict:
    """Báo cáo SỐ THẬT của sàn (cho improvements / ai-assistant)."""
    counts = _lead_counts(leads)
    lead_ids = _lead_id_set(leads)
    try:
        care_all = [
            it for it in ai_care_queue_store.list_items(status=None, page=1, page_size=5000).get("items", [])
            if it.get("lead_id") in lead_ids
        ]
        care_pending = sum(1 for it in care_all if it.get("status") == "pending")
    except Exception:  # noqa: BLE001
        care_all, care_pending = [], 0
    # Khách nóng chưa phân công.
    hot_unassigned = sum(
        1 for l in leads
        if l.get("status") == "hot" and not l.get("assigned_sale_id")
    )
    team_rows = []
    for u in team:
        ls = lead_store.list_leads_for_sale(u["id"])
        team_rows.append({
            "name": u.get("full_name") or u.get("email"),
            "leads": len(ls),
            "customers": sum(1 for l in ls if l.get("status") == "customer"),
        })
    return {
        "ten_san": rec.get("ten_san"),
        "status": rec.get("status"),
        "commission_tier": rec.get("commission_tier"),
        "leads": {
            "available": True,
            **counts,
            "hot_unassigned": hot_unassigned,
        },
        "team": {
            "count": len(team),
            "members": team_rows,
        },
        "ai_care": {
            "available": True,
            "total": len(care_all),
            "pending": care_pending,
        },
        "sources": _build_sources(leads),
        "funnel": _build_funnel(leads),
    }


def _agency_heuristic_improvements(report: dict) -> list[dict]:
    """Fallback KHÔNG cần LLM cho sàn — suy luận từ số liệu, không bịa."""
    out: list[dict] = []
    leads = report.get("leads") or {}
    team = report.get("team") or {}
    care = report.get("ai_care") or {}

    hot_unassigned = leads.get("hot_unassigned", 0) or 0
    if hot_unassigned > 0:
        out.append({
            "title": "Khách nóng chưa được phân công",
            "area": "lead", "severity": "high",
            "detail": f"Đang có {hot_unassigned} khách NÓNG chưa gán sale. Khách nóng nguội nhanh nếu chậm liên hệ.",
            "suggested_action": "Phân công ngay các khách nóng cho sale và đặt SLA gọi trong 15 phút.",
        })
    hot = leads.get("hot", 0) or 0
    if hot > 0 and hot_unassigned == 0:
        out.append({
            "title": "Tập trung chốt khách nóng",
            "area": "conversion", "severity": "medium",
            "detail": f"Có {hot} khách nóng đã được phân công. Đây là nhóm dễ chốt nhất hiện tại.",
            "suggested_action": "Ưu tiên gọi & gửi bảng giá/lịch xem nhà cho nhóm khách nóng trong hôm nay.",
        })
    total = leads.get("total", 0) or 0
    conv = leads.get("conversion_rate", 0) or 0
    if total >= 20 and conv < 5:
        out.append({
            "title": "Tỉ lệ chuyển đổi đang thấp",
            "area": "conversion", "severity": "medium",
            "detail": f"Chuyển đổi {conv}% trên {total} khách. Có thể do kịch bản chăm sóc hoặc chất lượng nguồn.",
            "suggested_action": "Rà kịch bản tư vấn, dùng Đội Sale AI chăm lại khách nguội và lọc nguồn kém.",
        })
    if (care.get("pending", 0) or 0) >= 5:
        out.append({
            "title": "Nhiều nháp chăm sóc AI chờ duyệt",
            "area": "care", "severity": "medium",
            "detail": f"Hàng đợi đang có {care.get('pending')} nháp chờ duyệt của Đội Sale AI.",
            "suggested_action": "Vào mục Đội Sale AI duyệt/bỏ qua các nháp để tiếp tục chăm khách.",
        })
    members = team.get("members") or []
    for m in members:
        if (m.get("leads", 0) or 0) >= 8 and (m.get("customers", 0) or 0) == 0:
            out.append({
                "title": f"{m.get('name') or 'Một sale'} chưa chốt được khách",
                "area": "team", "severity": "medium",
                "detail": f"Phụ trách {m.get('leads')} khách nhưng chưa có khách chốt.",
                "suggested_action": "Kèm cặp kỹ năng chốt hoặc phân bổ lại một phần khách.",
            })
    if not out:
        out.append({
            "title": "Sàn đang vận hành ổn định",
            "area": "other", "severity": "low",
            "detail": "Chưa phát hiện chỉ số bất thường rõ rệt từ dữ liệu hiện tại của sàn.",
            "suggested_action": "Tiếp tục theo dõi phễu chuyển đổi và chăm sóc đều khách nóng/ấm.",
        })
    return out


@router.post("/improvements")
async def agency_improvements(
    user: dict = Depends(require_agency),
    focus: Optional[str] = Query(default=None),
) -> dict:
    """Đề xuất cải tiến điều hành cho SÀN (scoped). Claude thật; fallback heuristic.

    KHÔNG side-effect. Trả {generated_by, generated_at, improvements, summary}."""
    rec, agency_id, team, leads = _scope(user)
    report = _scoped_report(rec, team, leads)
    generated_by = "fallback"
    improvements: list[dict] = []
    try:
        import json as _json
        user_msg = "BÁO CÁO SỐ THẬT CỦA SÀN (JSON):\n" + _json.dumps(
            report, ensure_ascii=False, default=str
        )
        if focus:
            user_msg += f"\n\nƯU TIÊN PHÂN TÍCH: {focus}"
        parsed = await ai_crm._call_claude_json(
            _AGENCY_IMPROVEMENTS_SYSTEM, user_msg, max_tokens=1200
        )
        if isinstance(parsed, dict) and isinstance(parsed.get("improvements"), list):
            cleaned = [i for i in parsed["improvements"]
                       if isinstance(i, dict) and i.get("title")]
            if cleaned:
                improvements = cleaned
                generated_by = "ai"
    except Exception as exc:  # noqa: BLE001 — luôn fallback an toàn
        log.warning("agency improvements: gọi Claude lỗi: %s", exc)
    if not improvements:
        improvements = _agency_heuristic_improvements(report)

    counts = _lead_counts(leads)
    summary = (
        f"Sàn đang có {counts['total']} khách ({counts['hot']} nóng, "
        f"{counts['customers']} đã chốt, chuyển đổi {counts['conversion_rate']}%) "
        f"với {len(team)} sale."
    )
    return {
        "generated_by": generated_by,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "focus": focus,
        "summary": summary,
        "improvements": improvements,
    }


# ---------------------------------------------------------------------------
# AI: TRỢ LÝ ĐIỀU HÀNH SÀN (chat) — Claude thật, fallback dựa số liệu
# ---------------------------------------------------------------------------

_ASSISTANT_SYSTEM = (
    "Bạn là TRỢ LÝ AI ĐIỀU HÀNH cho chủ MỘT SÀN bất động sản (đại lý F2). Bạn chỉ "
    "được dùng SỐ LIỆU SÀN (JSON) đính kèm — KHÔNG bịa thông tin ngoài đó. Trả lời "
    "NGẮN GỌN, thực dụng bằng tiếng Việt, ưu tiên hành động cụ thể. Khi chủ sàn hỏi "
    "'tình hình sàn', 'khách nào nên ưu tiên', 'làm sao tăng chốt'… hãy dựa trên số "
    "liệu để trả lời. Bạn CHỈ tư vấn — không tự thực hiện giao dịch hay gửi tin."
)


class AssistantBody(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


def _assistant_fallback(question: str, report: dict, top_hot: list[dict]) -> str:
    """Trả lời dựa số liệu khi CHƯA bật Claude (thiếu API key)."""
    leads = report.get("leads") or {}
    team = report.get("team") or {}
    lines = [
        f"Tổng quan sàn: {leads.get('total', 0)} khách — "
        f"{leads.get('hot', 0)} nóng, {leads.get('warm', 0)} ấm, "
        f"{leads.get('cold', 0)} lạnh; đã chốt {leads.get('customers', 0)} "
        f"(chuyển đổi {leads.get('conversion_rate', 0)}%). Đội sale: {team.get('count', 0)} người.",
    ]
    if leads.get("hot_unassigned", 0):
        lines.append(
            f"⚠ Có {leads['hot_unassigned']} khách NÓNG chưa phân công — nên gán "
            "sale & gọi ngay hôm nay."
        )
    if top_hot:
        names = ", ".join(
            f"{h.get('name') or 'Khách'} (điểm {h.get('ai_score', 0)})" for h in top_hot[:5]
        )
        lines.append(f"Nên ưu tiên các khách nóng/điểm cao: {names}.")
    lines.append(
        "(Trợ lý AI nâng cao chưa bật — đang trả lời dựa trên số liệu sàn. Cấu hình "
        "ANTHROPIC_API_KEY để bật tư vấn AI đầy đủ.)"
    )
    return "\n".join(lines)


@router.post("/ai-assistant")
async def agency_ai_assistant(
    body: AssistantBody,
    user: dict = Depends(require_agency),
) -> dict:
    """Chat hỏi-đáp điều hành sàn — AI trả lời dựa trên DỮ LIỆU SÀN (scoped).

    Thiếu API key / lỗi → fallback trả lời tóm tắt từ số liệu (không bịa)."""
    rec, agency_id, team, leads = _scope(user)
    report = _scoped_report(rec, team, leads)
    # Top khách nóng/điểm cao để gợi ý ưu tiên.
    top_hot = sorted(
        [l for l in leads if l.get("status") in ("hot", "warm")],
        key=lambda l: (l.get("status") == "hot", l.get("ai_score") or 0),
        reverse=True,
    )[:8]
    top_brief = [
        {"name": l.get("name"), "status": l.get("status"),
         "ai_score": l.get("ai_score", 0), "ai_tier": l.get("ai_tier"),
         "ai_next_action": (l.get("ai_next_action") or {}).get("suggested_action")
         if isinstance(l.get("ai_next_action"), dict) else None}
        for l in top_hot
    ]
    answer = ""
    source = "fallback"
    try:
        import json as _json
        context = _json.dumps(
            {"report": report, "top_priority_leads": top_brief},
            ensure_ascii=False, default=str,
        )
        text = await _call_claude_text(
            _ASSISTANT_SYSTEM,
            f"SỐ LIỆU SÀN (JSON):\n{context}\n\nCÂU HỎI CỦA CHỦ SÀN: {body.question}",
        )
        if text and text.strip():
            answer = text.strip()
            source = "ai"
    except Exception as exc:  # noqa: BLE001 — luôn fallback
        log.warning("ai-assistant gọi Claude lỗi: %s", exc)
    if not answer:
        answer = _assistant_fallback(body.question, report, top_hot)
    return {
        "answer": answer,
        "source": source,
        "top_priority_leads": top_brief,
    }


async def _call_claude_text(system: str, user_msg: str) -> Optional[str]:
    """Gọi Claude trả về TEXT thuần (cho trợ lý chat). None nếu thiếu key/lỗi."""
    from app.core.settings import settings
    if not settings.anthropic_api_key or settings.use_mock_llm:
        return None
    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=(settings.ai_crm_model or settings.llm_model),
            max_tokens=700,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        return resp.content[0].text if resp.content else None
    except Exception as exc:  # noqa: BLE001
        log.warning("_call_claude_text lỗi: %s", exc)
        return None


# ---------------------------------------------------------------------------
# PHIẾU MỜI SALE (nền) — ghi nhận khi chưa có provisioning tự động
# ---------------------------------------------------------------------------

class SaleRequestBody(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=2000)


@router.get("/sale-requests")
def list_sale_requests(user: dict = Depends(require_agency)) -> dict:
    """Danh sách phiếu mời sale của sàn (lọc cứng theo agency_id từ token)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    return {
        "agency_id": agency_id,
        "items": agency_sale_request_store.list_for_agency(agency_id),
    }


@router.post("/sale-requests", status_code=status.HTTP_201_CREATED)
def create_sale_request(
    body: SaleRequestBody,
    user: dict = Depends(require_agency),
) -> dict:
    """Ghi nhận 1 phiếu mời sale cho sàn (bước nền — KHÔNG tạo tài khoản)."""
    rec = _resolve_agency(user)
    agency_id = rec["id"]
    try:
        item = agency_sale_request_store.create_for_agency(
            agency_id,
            full_name=body.full_name,
            phone=body.phone,
            email=body.email,
            note=body.note,
            created_by=user.get("id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"ok": True, "item": item}


# ---------------------------------------------------------------------------
# GET báo cáo doanh số sàn — (giữ tương thích cũ ở trên: /report)
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
