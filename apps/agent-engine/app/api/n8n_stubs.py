"""Stub endpoint cho 30+ workflow n8n (04-34) gọi vào.

Mục tiêu: cung cấp API surface mà các workflow n8n đã import đang giả định có
sẵn, để chạy được 1 quy trình end-to-end. Tất cả endpoint dùng prefix `/admin`
và xác thực bằng `require_admin_or_service` — n8n gọi kèm header
`X-Internal-Token`, còn admin có thể gọi bằng JWT.

Nguyên tắc stub:
  - Ưu tiên query DỮ LIỆU THẬT từ các store sẵn có (user/lead/booking/inventory).
  - Khi chưa có nguồn dữ liệu thật (cost API, competitor price, ads...) → trả
    mock list 5-10 record kèm `"_stub": True` để n8n vẫn chạy luồng.
  - TODO Phase 3: thay mock + tính toán in-memory bằng query Postgres thật.

Đường dẫn khớp đúng path mà workflow JSON hardcode (xem README-SYNC-REPORT.md).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api import inventory as inventory_module
from app.api import leads as leads_module
from app.api.deps import require_admin_or_service
from app.core import (
    audit_store,
    booking_store,
    commission_store,
    inventory_store,
    settings_store,
    user_store,
)
from app.core.settings import settings
from app.schemas.n8n import (
    AudienceMatchIn,
    BonusIn,
    CampaignLogIn,
    EscalationIn,
    InboxRouteIn,
    LeaderboardUpdateIn,
    PostLogIn,
    SegmentPreviewIn,
    TierUpgradeIn,
)

router = APIRouter(prefix="/admin", tags=["n8n-stubs"])

_NOW = datetime.utcnow  # alias dễ mock trong test


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_dt(val) -> Optional[datetime]:
    """Parse ISO datetime (chấp nhận hậu tố 'Z'). None nếu không hợp lệ."""
    if isinstance(val, datetime):
        return val
    if isinstance(val, str) and val:
        try:
            return datetime.fromisoformat(val.replace("Z", ""))
        except ValueError:
            return None
    return None


def _user_brief(u: dict) -> dict:
    """Rút gọn user cho n8n (loại bỏ password_hash, giữ field liên hệ)."""
    return {
        "id": u["id"],
        "full_name": u.get("full_name"),
        "email": u.get("email"),
        "phone": u.get("phone"),
        "telegram_chat_id": u.get("telegram_chat_id"),
        "dob": u.get("dob"),
    }


# ===========================================================================
# LIFECYCLE — leads / users / bookings
# ===========================================================================

@router.get("/leads/silent-14d")
def leads_silent(
    days: int = Query(default=14, ge=1, le=365),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 06 — lead im lặng >= `days` ngày (re-engagement).

    Lọc theo `updated_at` (fallback `created_at`) cũ hơn mốc. Query thật từ
    in-memory _LEADS. TODO Phase 3: chuyển sang bảng leads Postgres.
    """
    cutoff = _NOW() - timedelta(days=days)
    out = []
    for lead in leads_module._LEADS.values():
        ref = _parse_dt(getattr(lead, "updated_at", None)) or _parse_dt(
            getattr(lead, "created_at", None)
        )
        if ref and ref <= cutoff and lead.status not in ("handed_off", "lost"):
            out.append(
                {
                    "id": lead.id,
                    "full_name": lead.full_name,
                    "phone": lead.phone,
                    "email": lead.email,
                    "status": lead.status,
                    "last_activity": ref.isoformat() + "Z",
                }
            )
    return {"days": days, "count": len(out), "leads": out}


@router.get("/leads/favorites-7d-no-booking")
def leads_favorites_no_booking(
    days: int = Query(default=7, ge=1, le=365),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 07 — user có favorites > `days` ngày nhưng chưa đặt lịch (cart abandon).

    Đối chiếu favorites của user với booking_store. Query thật.
    """
    cutoff = _NOW() - timedelta(days=days)
    booked_emails = {
        b.get("customer_email") for b in booking_store.list_all() if b.get("customer_email")
    }
    out = []
    for u in user_store.list_users():
        favs = u.get("favorites") or []
        created = _parse_dt(u.get("created_at"))
        if favs and (created is None or created <= cutoff) and u.get("email") not in booked_emails:
            out.append({**_user_brief(u), "favorites": favs})
    return {"days": days, "count": len(out), "users": out}


@router.get("/users/birthday-today")
def users_birthday_today(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 09 — user có sinh nhật hôm nay (so khớp dd-mm của `dob`)."""
    today = _NOW().date()
    out = []
    for u in user_store.list_users():
        dob = _parse_dt(u.get("dob"))
        if dob and dob.month == today.month and dob.day == today.day:
            out.append(_user_brief(u))
    return {"date": today.isoformat(), "count": len(out), "users": out}


@router.get("/bookings/upcoming-24h")
def bookings_upcoming(
    hours: int = Query(default=24, ge=1, le=168),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 05 — booking trong `hours` giờ tới (nhắc lịch xem nhà)."""
    now = _NOW()
    horizon = now + timedelta(hours=hours)
    out = []
    for b in booking_store.list_all():
        sched = _parse_dt(b.get("scheduled_at"))
        if sched and now <= sched <= horizon and b.get("status") in ("pending", "confirmed"):
            out.append(b)
    return {"hours": hours, "count": len(out), "bookings": out}


@router.get("/bookings/completed-yesterday")
def bookings_completed_yesterday(
    days_ago: int = Query(default=1, ge=0, le=30),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 10 — booking hoàn thành `days_ago` ngày trước (gửi NPS feedback)."""
    target = (_NOW() - timedelta(days=days_ago)).date()
    out = []
    for b in booking_store.list_all():
        if b.get("status") != "completed":
            continue
        ref = _parse_dt(b.get("updated_at")) or _parse_dt(b.get("scheduled_at"))
        if ref and ref.date() == target:
            out.append(b)
    return {"date": target.isoformat(), "count": len(out), "bookings": out}


# ===========================================================================
# SALE OPS
# ===========================================================================

@router.get("/sales/inactive-3d")
def sales_inactive(
    days: int = Query(default=3, ge=1, le=90),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 12 — sale chưa đăng nhập >= `days` ngày.

    LƯU Ý: hệ thống chưa lưu `last_login_at` (Phase 3 sẽ bổ sung). Hiện trả về
    danh sách sale đang mở để n8n có đối tượng nhắc, kèm `_stub` cảnh báo.
    TODO Phase 3: lọc theo last_login_at thực.
    """
    sales = user_store.list_active_sales(days=days)
    return {
        "days": days,
        "count": len(sales),
        "sales": [_user_brief(s) for s in sales],
        "_stub": "chưa có last_login_at — trả toàn bộ sale đang mở",
    }


@router.get("/sales/{sale_id}/weekly-stats")
def sale_weekly_stats(
    sale_id: str,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 11 — thống kê tuần của 1 sale (báo cáo thứ 2)."""
    sale = user_store.find_by_id(sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Không tìm thấy sale")
    week_ago = _NOW() - timedelta(days=7)
    deals = commission_store.list_records(sale_id=sale_id)
    leads_assigned = sum(
        1 for l in leads_module._LEADS.values() if l.assigned_sale_id == sale_id
    )
    bookings = [b for b in booking_store.list_all() if b.get("sale_id") == sale_id]
    bookings_week = [
        b for b in bookings if (_parse_dt(b.get("created_at")) or datetime.min) >= week_ago
    ]
    return {
        "sale": _user_brief(sale),
        "period_days": 7,
        "leads_assigned": leads_assigned,
        "bookings_total": len(bookings),
        "bookings_this_week": len(bookings_week),
        "deals_closed": len(deals),
        "generated_at": _NOW().isoformat() + "Z",
    }


@router.post("/sales/{sale_id}/upgrade-tier", status_code=status.HTTP_200_OK)
def sale_upgrade_tier(
    sale_id: str,
    body: TierUpgradeIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 14 — hoàn thành training → mở khoá bậc hoa hồng cao hơn."""
    sale = user_store.find_by_id(sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Không tìm thấy sale")
    audit_store.record(
        "sale-upgrade-tier",
        {"sale_id": sale_id, "tier": body.tier, "reason": body.reason},
        detail=f"mở khoá tier {body.tier} cho {sale.get('full_name')}",
    )
    # TODO Phase 3: ghi tier vào bảng users/commission_tiers.
    return {"status": "upgraded", "sale_id": sale_id, "tier": body.tier}


@router.post("/sales/{sale_id}/bonus", status_code=status.HTTP_200_OK)
def sale_bonus(
    sale_id: str,
    body: BonusIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 34 — thưởng giới thiệu cho sale."""
    sale = user_store.find_by_id(sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Không tìm thấy sale")
    audit_store.record(
        "sale-bonus",
        {"sale_id": sale_id, "amount": body.amount, "reason": body.reason},
        detail=f"thưởng {body.amount} cho {sale.get('full_name')}",
    )
    # TODO Phase 3: cộng vào bảng bonus/ví hoa hồng.
    return {"status": "recorded", "sale_id": sale_id, "amount": body.amount}


# ===========================================================================
# ADMIN INSIGHTS — kpi / inventory / cost
# ===========================================================================

@router.get("/kpi/today")
def kpi_today(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 16 — KPI trong ngày (leads / bookings / deals / doanh thu dự kiến)."""
    today = _NOW().date()
    leads = list(leads_module._LEADS.values())
    leads_today = sum(
        1 for l in leads if (_parse_dt(getattr(l, "created_at", None)) or datetime.min).date() == today
    )
    bookings = booking_store.list_all()
    bookings_today = sum(
        1 for b in bookings if (_parse_dt(b.get("created_at")) or datetime.min).date() == today
    )
    # Quỹ căn mock (chưa sync) KHÔNG được tính vào doanh thu → 0 cho tới khi có
    # inventory thật. Tỷ lệ hoa hồng lấy từ settings, không hardcode.
    if inventory_store.is_empty():
        booked_value = 0.0
    else:
        booked_value = sum(
            u["gia_tri"]
            for u in inventory_module.get_units()
            if u["trang_thai"] in ("Đặt cọc", "Đã bán")
        )
    return {
        "date": today.isoformat(),
        "leads_today": leads_today,
        "leads_total": len(leads),
        "bookings_today": bookings_today,
        "bookings_total": len(bookings),
        "deals_total": len(commission_store.list_records()),
        "revenue_projection_ty": round(booked_value * settings_store.commission_rate(), 2),
        "generated_at": _NOW().isoformat() + "Z",
    }


@router.get("/inventory/low")
def inventory_low(
    threshold: float = Query(default=0.1, ge=0, le=1),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 17 — phân khu còn tỷ lệ căn trống < `threshold` (cảnh báo cháy hàng)."""
    units = inventory_module.get_units()
    by_zone: dict[str, dict] = {}
    for u in units:
        z = by_zone.setdefault(u["phan_khu"], {"total": 0, "available": 0})
        z["total"] += 1
        if u["trang_thai"] == "Còn hàng":
            z["available"] += 1
    low = []
    for zone, z in by_zone.items():
        ratio = z["available"] / z["total"] if z["total"] else 0
        if ratio < threshold:
            low.append({"phan_khu": zone, "available": z["available"], "total": z["total"], "ratio": round(ratio, 3)})
    return {"threshold": threshold, "count": len(low), "low_stock_zones": low}


@router.get("/cost/anthropic-today")
def cost_anthropic_today(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 18 — chi phí Anthropic API hôm nay.

    STUB: chưa có pipeline đo usage thật → trả số mock + cờ cấu hình key.
    TODO Phase 3: đọc usage thật từ Anthropic Admin API / bảng usage nội bộ.
    """
    return {
        "date": _NOW().date().isoformat(),
        "provider": "anthropic",
        "input_tokens": 0,
        "output_tokens": 0,
        "estimated_cost_usd": 0.0,
        "api_key_configured": bool(settings.anthropic_api_key),
        "mock_mode": settings.use_mock_llm or not settings.anthropic_api_key,
        "_stub": True,
    }


# ===========================================================================
# DEALS / ESCALATION / LEADERBOARD
# ===========================================================================

@router.post("/escalations", status_code=status.HTTP_201_CREATED)
def create_escalation(
    body: EscalationIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 13 — sale không phản hồi lead nóng → ghi escalation cho manager."""
    rec = audit_store.record(
        "escalation",
        body.model_dump(),
        status="warning",
        detail=f"escalate lead={body.lead_id} sale={body.sale_id} ({body.severity})",
    )
    return {"status": "escalated", "escalation_id": rec["id"], "severity": body.severity}


@router.post("/leaderboard/update", status_code=status.HTTP_200_OK)
def leaderboard_update(
    body: LeaderboardUpdateIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 15 — deal mới chốt → cập nhật leaderboard.

    STUB: tính bảng xếp hạng từ commission_store theo sale. TODO Phase 3: bảng
    leaderboard riêng + lưu lịch sử.
    """
    audit_store.record("leaderboard-update", body.model_dump(), detail="cập nhật leaderboard")
    tally: dict[str, float] = {}
    for r in commission_store.list_records():
        tally[r.get("sale_id", "?")] = tally.get(r.get("sale_id", "?"), 0) + float(r.get("deal_amount", 0) or 0)
    ranking = sorted(
        ({"sale_id": k, "total_volume": round(v, 2)} for k, v in tally.items()),
        key=lambda x: x["total_volume"],
        reverse=True,
    )
    return {"status": "updated", "leaderboard": ranking[:10]}


# ===========================================================================
# INTEGRATION — inbox routing
# ===========================================================================

@router.post("/inbox/route", status_code=status.HTTP_200_OK)
def inbox_route(
    body: InboxRouteIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 24 — email/inbound → phân loại keyword → định tuyến phòng ban.

    STUB: phân loại bằng keyword đơn giản. TODO Phase 3: thay bằng LLM classifier.
    """
    text = f"{body.subject} {body.body}".lower()
    if any(k in text for k in ("giá", "mua", "đặt cọc", "booking", "xem nhà")):
        dept = "sales"
    elif any(k in text for k in ("hoá đơn", "thanh toán", "hợp đồng", "công nợ")):
        dept = "finance"
    elif any(k in text for k in ("lỗi", "khiếu nại", "hỗ trợ", "support")):
        dept = "support"
    else:
        dept = "general"
    rec = audit_store.record("inbox-route", {"from": body.from_email, "dept": dept}, detail=f"→ {dept}")
    return {"status": "routed", "department": dept, "ticket_id": rec["id"]}


# ===========================================================================
# MARKETING
# ===========================================================================

@router.get("/units/hot-pick")
def units_hot_pick(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 25/26/27 — chọn căn nổi bật để auto-publish nội dung marketing.

    Chọn căn còn hàng giá trị cao nhất (dễ tạo nội dung 'sản phẩm hot'). Query thật.
    """
    available = [u for u in inventory_module.get_units() if u["trang_thai"] == "Còn hàng"]
    if not available:
        raise HTTPException(status_code=404, detail="Hết căn còn hàng để pick")
    pick = max(available, key=lambda u: u["gia_tri"])
    return {"unit": pick, "available_count": len(available)}


@router.get("/marketing/keywords/pool")
def marketing_keywords(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 28 — pool từ khoá SEO cho blog auto.

    STUB: danh sách từ khoá BĐS cố định. TODO Phase 3: kéo từ Google Search Console.
    """
    keywords = [
        "biệt thự happy home thanh hoa",
        "căn hộ cao cấp hà nội",
        "đầu tư bất động sản 2026",
        "shophouse light city giá",
        "tiến độ happy home thanh hoa",
        "chính sách bán hàng light city",
        "nhà phố thương mại hà nội",
    ]
    return {"count": len(keywords), "keywords": keywords, "_stub": True}


@router.get("/marketing/google-ads/yesterday")
def google_ads_yesterday(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 30 — hiệu suất Google Ads hôm qua.

    STUB: FastAPI sẽ làm proxy OAuth ở Phase 3. Hiện trả mock metrics.
    """
    return {
        "date": (_NOW().date() - timedelta(days=1)).isoformat(),
        "impressions": 0,
        "clicks": 0,
        "cost_usd": 0.0,
        "conversions": 0,
        "_stub": True,
    }


@router.get("/marketing/competitor-prices")
def competitor_prices(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 31 — giá đối thủ (mock 5 dự án). TODO Phase 3: scrape thật."""
    rows = [
        {"project": "Vinhomes Ocean Park", "price_per_m2_trieu": 120, "trend": "up"},
        {"project": "Masterise Lumiere", "price_per_m2_trieu": 180, "trend": "flat"},
        {"project": "Ecopark Grand", "price_per_m2_trieu": 95, "trend": "up"},
        {"project": "The Manor Central Park", "price_per_m2_trieu": 150, "trend": "down"},
        {"project": "Sunshine City", "price_per_m2_trieu": 88, "trend": "flat"},
    ]
    return {"count": len(rows), "competitors": rows, "_stub": True}


@router.post("/marketing/posts/log", status_code=status.HTTP_201_CREATED)
def marketing_post_log(
    body: PostLogIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 25 — log bài đã auto-publish."""
    rec = audit_store.record(
        "marketing-post",
        {"channel": body.channel, "unit_id": body.unit_id, "external_post_id": body.external_post_id},
        detail=f"đăng {body.channel}",
    )
    return {"status": "logged", "post_log_id": rec["id"], "channel": body.channel}


@router.post("/marketing/segments/preview", status_code=status.HTTP_200_OK)
def segments_preview(
    body: SegmentPreviewIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 32 — preview tệp khách theo tiêu chí trước khi gửi campaign."""
    cutoff = _NOW() - timedelta(days=body.min_age_days) if body.min_age_days else None
    matched = []
    for u in user_store.list_users():
        if body.role and u.get("role") != body.role:
            continue
        if body.has_favorites is not None and bool(u.get("favorites")) != body.has_favorites:
            continue
        if cutoff:
            created = _parse_dt(u.get("created_at"))
            if created and created > cutoff:
                continue
        matched.append(_user_brief(u))
    return {"count": len(matched), "sample": matched[:10]}


@router.post("/marketing/audience/match", status_code=status.HTTP_200_OK)
def audience_match(
    body: AudienceMatchIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 33 — match danh sách khách cho sự kiện/quảng cáo (theo criteria thô)."""
    users = user_store.list_users()
    role = body.criteria.get("role")
    if role:
        users = [u for u in users if u.get("role") == role]
    audience = [_user_brief(u) for u in users[: body.limit]]
    return {"matched": len(audience), "audience": audience}


@router.post("/marketing/campaigns/{campaign_id}/log", status_code=status.HTTP_201_CREATED)
def campaign_log(
    campaign_id: str,
    body: CampaignLogIn,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 32 — log kết quả gửi campaign."""
    rec = audit_store.record(
        "campaign-log",
        {"campaign_id": campaign_id, **body.model_dump()},
        detail=f"campaign {campaign_id}: sent={body.sent}",
    )
    return {"status": "logged", "campaign_id": campaign_id, "log_id": rec["id"]}


@router.post("/marketing/events/{event_id}/invites", status_code=status.HTTP_200_OK)
def event_invites(
    event_id: str,
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Workflow 33 — dựng danh sách mời sự kiện (toàn bộ client đang mở)."""
    invites = [
        _user_brief(u)
        for u in user_store.list_users()
        if u.get("role") == "client" and u.get("is_active", True)
    ]
    return {"event_id": event_id, "count": len(invites), "invites": invites}
