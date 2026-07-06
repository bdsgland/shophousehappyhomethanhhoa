"""Endpoint quản trị (yêu cầu role=admin).

- GET   /admin/overview          → tổng số user theo role, tổng lead
- GET   /admin/users             → list user (không kèm password_hash)
- PATCH /admin/users/{id}        → đổi role / is_active
- GET   /admin/dashboard/kpi     → KPI tổng quan cho admin dashboard (cards + charts)
- GET   /admin/platforms/health  → ping sức khoẻ 5 nền tảng (server-side, tránh CORS)
"""

from __future__ import annotations

import csv
import io
import logging
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.api import inventory as inventory_module
from app.api import leads as leads_module
from app.api.deps import require_admin, require_admin_or_service
from app.core import (
    audit_store,
    commission_store,
    inventory_store,
    learning_store,
    settings_store,
    user_store,
)
from app.core.security import hash_password
from app.core.settings import settings
from app.schemas.admin import (
    AdminUserCreate,
    AdminUserUpdate,
    BulkImportResult,
    InventoryUnitCreate,
    InventoryUnitUpdate,
    ResetPasswordOut,
    SettingsUpdate,
)
from app.schemas.user import UserOut, UserUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
def overview(_admin: dict = Depends(require_admin)) -> dict:
    users = user_store.list_users()
    by_role: dict[str, int] = {}
    active = 0
    for u in users:
        by_role[u.get("role", "sale")] = by_role.get(u.get("role", "sale"), 0) + 1
        if u.get("is_active", True):
            active += 1
    return {
        "users_total": len(users),
        "users_active": active,
        "users_by_role": by_role,
        "leads_total": len(leads_module._LEADS),
        "backend_status": "ok",
    }


@router.get("/users", response_model=list[UserOut])
def list_users(_admin: dict = Depends(require_admin)) -> list[UserOut]:
    out: list[UserOut] = []
    for u in user_store.list_users():
        try:
            out.append(UserOut(**user_store.public_view(u)))
        except Exception as exc:  # noqa: BLE001 — 1 record hỏng KHÔNG được sập cả list
            log.warning(
                "Bỏ qua user lỗi serialize (id=%s, email=%s): %s",
                u.get("id"),
                u.get("email"),
                exc,
            )
    return out


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    payload: AdminUserUpdate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    if not payload.model_dump(exclude_unset=True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cần ít nhất một trường để cập nhật",
        )

    # Chặn admin tự khoá / tự hạ quyền chính mình (tránh khoá toàn bộ hệ thống).
    if user_id == admin["id"]:
        if payload.role is not None and payload.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự hạ quyền admin của chính mình",
            )
        if payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự khoá tài khoản của chính mình",
            )

    before = user_store.find_by_id(user_id)
    if not before:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    try:
        updated = user_store.update_user(
            user_id,
            role=payload.role,
            is_active=payload.is_active,
            full_name=payload.full_name,
            phone=payload.phone,
            email=payload.email,
            region=payload.region,
            upline_email=payload.upline_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    audit_store.record_admin(
        "user.update",
        admin,
        target=user_id,
        old_value={"role": before.get("role"), "is_active": before.get("is_active")},
        new_value=payload.model_dump(exclude_unset=True),
        detail=f"cập nhật {updated.get('email')}",
    )
    return UserOut(**user_store.public_view(updated))


def _lead_date(lead) -> datetime | None:
    """Lấy ngày tạo lead (an toàn với cả object/dict)."""
    val = getattr(lead, "created_at", None)
    if val is None and isinstance(lead, dict):
        val = lead.get("created_at")
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", ""))
        except ValueError:
            return None
    return val


@router.get("/dashboard/kpi")
def dashboard_kpi(_admin: dict = Depends(require_admin)) -> dict:
    """KPI tổng quan cho admin dashboard.

    Trả số liệu THỰC từ các store hiện có (user/lead/inventory). Khi hệ thống
    còn mới (chưa nhiều hoạt động) các mảng chart có thể bằng 0 — frontend tự
    hiển thị trạng thái "chưa có dữ liệu" thay vì vẽ đường phẳng gây hiểu nhầm.
    """
    now = datetime.utcnow()
    today = now.date()

    # --- Leads ---
    leads = list(leads_module._LEADS.values())
    lead_today = 0
    for l in leads:
        d = _lead_date(l)
        if d and d.date() == today:
            lead_today += 1

    # Chuỗi 30 ngày gần nhất (cho line chart)
    lead_trend = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date()
        cnt = sum(1 for l in leads if (_lead_date(l) or datetime.min).date() == day)
        lead_trend.append({"date": day.isoformat(), "count": cnt})

    # --- Users ---
    users = user_store.list_users()
    by_role: dict[str, int] = {}
    for u in users:
        r = u.get("role", "sale")
        by_role[r] = by_role.get(r, 0) + 1

    # --- Inventory ---
    # QUAN TRỌNG: khi store chưa sync (rỗng) hệ thống dùng quỹ căn MOCK để map
    # không trống. Số đó KHÔNG phải dữ liệu thật → tuyệt đối không đưa vào KPI
    # "đơn đặt cọc" / "doanh thu". Chỉ tính KPI khi đã có inventory THẬT.
    inventory_is_demo = inventory_store.is_empty()
    units = inventory_module.get_units()
    reserved = sum(1 for u in units if u["trang_thai"] == "Đặt cọc")
    sold = sum(1 for u in units if u["trang_thai"] == "Đã bán")
    available = sum(1 for u in units if u["trang_thai"] == "Còn hàng")

    commission_rate = settings_store.commission_rate()
    if inventory_is_demo:
        # Chưa có quỹ căn thật → KPI cọc/doanh thu = 0 (không bịa từ mock).
        orders = 0
        revenue_projection = 0.0
    else:
        booked_value = sum(
            u["gia_tri"] for u in units if u["trang_thai"] in ("Đặt cọc", "Đã bán")
        )
        orders = reserved
        revenue_projection = round(booked_value * commission_rate, 2)

    # --- Top sale theo hoa hồng (MVP: chưa có giao dịch thật → để trống) ---
    top_sales: list[dict] = []

    return {
        "lead_today": lead_today,
        "lead_total": len(leads),
        "users_total": len(users),
        "users_by_role": by_role,
        "orders_this_month": orders,  # đơn đặt cọc đang giữ chỗ (0 nếu chưa có data thật)
        "revenue_projection_ty": revenue_projection,  # tỷ đồng (hoa hồng ước tính)
        "commission_rate": commission_rate,  # tỷ lệ thật từ settings (không hardcode)
        "inventory": {
            "total": len(units),
            "available": available,
            "sold": sold,
            "reserved": reserved,
            "is_demo": inventory_is_demo,  # FE hiển thị badge "Dữ liệu mẫu"
        },
        "lead_trend": lead_trend,
        "top_sales": top_sales,
        "generated_at": now.isoformat() + "Z",
    }


# ---------------------------------------------------------------------------
# Daily Briefing (n8n workflow 3) — sales active + leads cần follow-up
# ---------------------------------------------------------------------------

@router.get("/sales/active")
def sales_active(
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Danh sách sale đang hoạt động — n8n daily-briefing loop qua từng người.

    Cho phép service token (X-Internal-Token) để n8n gọi không cần đăng nhập.
    """
    sales = user_store.list_active_sales()
    return {
        "sales": [
            {
                "id": s["id"],
                "full_name": s["full_name"],
                "email": s["email"],
                "phone": s.get("phone"),
                "telegram_chat_id": s.get("telegram_chat_id"),
                "telegram_linked": bool(s.get("telegram_chat_id")),
            }
            for s in sales
        ],
        "count": len(sales),
    }


def _lead_brief(lead) -> dict:
    """Rút gọn lead cho briefing (chỉ field cần để Claude tóm tắt)."""
    return {
        "id": lead.id,
        "full_name": lead.full_name,
        "phone": lead.phone,
        "status": lead.status,
        "intent_score": lead.intent_score,
        "project": lead.project,
        "next_followup_at": lead.next_followup_at.isoformat() + "Z"
        if lead.next_followup_at
        else None,
        "updated_at": lead.updated_at.isoformat() + "Z" if lead.updated_at else None,
    }


@router.get("/leads/needs-followup")
def leads_needs_followup(
    sale_id: str = Query(..., description="user_id của sale"),
    _principal: dict = Depends(require_admin_or_service),
) -> dict:
    """Tổng hợp lead cần follow-up của 1 sale cho briefing sáng.

    Nhóm: hot leads chưa liên hệ / lịch gọi lại hôm nay / lead "ngủ đông" 3+ ngày /
    booking sắp đến trong 24h. Lọc theo lead.assigned_sale_id == sale_id.
    """
    now = datetime.utcnow()
    today = now.date()
    in_24h = now + timedelta(hours=24)
    dormant_before = now - timedelta(days=3)

    mine = [
        l for l in leads_module._LEADS.values() if l.assigned_sale_id == sale_id
    ]

    hot_uncontacted = [
        l for l in mine if l.status == "hot" and l.contacted_at is None
    ]
    callbacks_today = [
        l for l in mine if l.next_followup_at and l.next_followup_at.date() == today
    ]
    upcoming_bookings = [
        l for l in mine if l.next_followup_at and now <= l.next_followup_at <= in_24h
    ]
    dormant = [
        l
        for l in mine
        if l.status in ("new", "nurturing", "hot")
        and (l.updated_at or now) < dormant_before
    ]

    return {
        "sale_id": sale_id,
        "generated_at": now.isoformat() + "Z",
        "hot_uncontacted": [_lead_brief(l) for l in hot_uncontacted],
        "callbacks_today": [_lead_brief(l) for l in callbacks_today],
        "upcoming_bookings_24h": [_lead_brief(l) for l in upcoming_bookings],
        "dormant_3days": [_lead_brief(l) for l in dormant],
        "counts": {
            "hot_uncontacted": len(hot_uncontacted),
            "callbacks_today": len(callbacks_today),
            "upcoming_bookings_24h": len(upcoming_bookings),
            "dormant_3days": len(dormant),
        },
    }


def _platforms_config() -> list[dict]:
    """Danh sách nền tảng cần health-check. URL có thể override qua env."""
    return [
        {"key": "api", "name": "Agent Engine (API)", "url": "self"},
        {"key": "n8n", "name": "n8n Automation", "url": settings.platform_n8n_url},
        {"key": "dify", "name": "Dify", "url": settings.platform_dify_url},
        {
            "key": "bot",
            "name": "OpenClaw",
            "url": settings.platform_bot_url,
            "note": "Login UI lỗi — chờ fix",
        },
        {"key": "chat", "name": "Chatwoot", "url": settings.platform_chat_url},
    ]


@router.get("/platforms/health")
async def platforms_health(_admin: dict = Depends(require_admin)) -> dict:
    """Ping sức khoẻ 5 nền tảng từ phía server (tránh giới hạn CORS của trình duyệt).

    Coi là "up" nếu nhận được HTTP < 500 (kể cả 401/302 — tức là dịch vụ sống,
    chỉ là cần auth). "down" nếu timeout / lỗi kết nối / 5xx.
    """
    results: list[dict] = []
    async with httpx.AsyncClient(
        timeout=6.0, follow_redirects=False, verify=True
    ) as client:
        for p in _platforms_config():
            entry = {k: v for k, v in p.items() if k != "url"}
            entry["url"] = p["url"]
            if p["url"] == "self":
                entry["url"] = "https://api-happyhomethanhhoa.bdsg.land"
                entry["status"] = "up"
                entry["code"] = 200
                results.append(entry)
                continue
            try:
                r = await client.get(
                    p["url"], headers={"User-Agent": "HH-Admin-HealthCheck/1.0"}
                )
                entry["code"] = r.status_code
                entry["status"] = "up" if r.status_code < 500 else "down"
            except Exception as e:  # noqa: BLE001 — mọi lỗi mạng coi là down
                entry["code"] = None
                entry["status"] = "down"
                entry["error"] = type(e).__name__
            results.append(entry)
    return {
        "platforms": results,
        "checked_at": datetime.utcnow().isoformat() + "Z",
    }


# ===========================================================================
# PHASE 2 — Quản lý User (CRUD đầy đủ)
# ===========================================================================

def _gen_temp_password(length: int = 10) -> str:
    """Sinh mật khẩu tạm có cả chữ + số (thoả ràng buộc đăng nhập)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isalpha() for c in pwd) and any(c.isdigit() for c in pwd):
            return pwd


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user_admin(
    payload: AdminUserCreate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    """Admin tạo user mới trực tiếp (bỏ qua luồng đăng ký công khai)."""
    password = payload.password or _gen_temp_password()
    try:
        created = user_store.create_user(
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(password),
            phone=payload.phone,
            role=payload.role,
            region=payload.region,
            upline_email=payload.upline_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    audit_store.record_admin(
        "user.create", admin, target=created["id"],
        new_value={"email": created["email"], "role": created["role"]},
        detail=f"tạo {created['email']}",
    )
    return UserOut(**user_store.public_view(created))


@router.delete("/users/{user_id}")
def delete_user_admin(
    user_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    """Soft-delete: khoá tài khoản (is_active=False). KHÔNG hard delete."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Không thể tự khoá chính mình")
    updated = user_store.soft_delete(user_id)
    if not updated:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    audit_store.record_admin(
        "user.disable", admin, target=user_id,
        detail=f"khoá {updated.get('email')}",
    )
    return {"ok": True, "user_id": user_id, "is_active": False}


@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password_admin(
    user_id: str,
    admin: dict = Depends(require_admin),
) -> ResetPasswordOut:
    """Sinh mật khẩu tạm, ghi đè hash, trả về cho admin chuyển cho user."""
    user = user_store.find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    temp = _gen_temp_password()
    user_store.set_password(user_id, hash_password(temp))
    audit_store.record_admin(
        "user.reset_password", admin, target=user_id,
        detail=f"reset mật khẩu {user.get('email')}",
    )
    return ResetPasswordOut(user_id=user_id, temp_password=temp)


@router.post("/users/bulk-import", response_model=BulkImportResult)
async def bulk_import_users(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
) -> BulkImportResult:
    """Import user từ CSV. Cột: email, full_name, phone, role, region, upline_email.

    Chỉ xử lý tối đa 50 dòng đầu (tránh quá tải bộ nhớ ở MVP).
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "File rỗng")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    created = skipped = 0
    errors: list[str] = []
    for i, row in enumerate(reader):
        if i >= 50:
            errors.append("Đã đạt giới hạn 50 dòng — phần còn lại bỏ qua.")
            break
        email = (row.get("email") or "").strip()
        full_name = (row.get("full_name") or row.get("name") or "").strip()
        if not email or not full_name:
            skipped += 1
            continue
        try:
            user_store.create_user(
                email=email,
                full_name=full_name,
                password_hash=hash_password(_gen_temp_password()),
                phone=(row.get("phone") or "").strip() or None,
                role=(row.get("role") or "sale").strip() or "sale",
                region=(row.get("region") or "").strip() or None,
                upline_email=(row.get("upline_email") or "").strip() or None,
            )
            created += 1
        except ValueError:
            skipped += 1  # email trùng → bỏ qua
        except Exception as e:  # noqa: BLE001
            errors.append(f"Dòng {i + 1}: {type(e).__name__}")
    audit_store.record_admin(
        "user.bulk_import", admin,
        detail=f"tạo {created}, bỏ qua {skipped}",
    )
    return BulkImportResult(created=created, skipped=skipped, errors=errors)


# ===========================================================================
# PHASE 2 — Sale & Hoa hồng
# ===========================================================================

@router.get("/sales")
def list_sales(_admin: dict = Depends(require_admin)) -> dict:
    """Danh sách sale + thống kê downline / deal / hoa hồng."""
    users = user_store.list_users()
    commissions = commission_store.list_records(limit=1000)

    # Tổng hợp hoa hồng theo sale_id (mọi bậc mà người đó nhận).
    commission_by_user: dict[str, float] = {}
    deals_by_user: dict[str, set] = {}
    for rec in commissions:
        for tier in rec.get("tiers", []):
            uid = tier.get("user_id")
            if not uid:
                continue
            commission_by_user[uid] = commission_by_user.get(uid, 0) + float(
                tier.get("amount", 0)
            )
            deals_by_user.setdefault(uid, set()).add(rec.get("deal_id"))

    sales = []
    for u in users:
        if u.get("role") != "sale":
            continue
        downlines = [
            d for d in users
            if (d.get("upline_email") or "").lower() == u["email"].lower()
        ]
        sales.append(
            {
                "id": u["id"],
                "full_name": u["full_name"],
                "email": u["email"],
                "phone": u.get("phone"),
                "referral_code": u.get("referral_code"),
                "is_active": u.get("is_active", True),
                "downline_count": len(downlines),
                "total_deals": len(deals_by_user.get(u["id"], set())),
                "total_commission": round(commission_by_user.get(u["id"], 0)),
            }
        )
    sales.sort(key=lambda s: s["total_commission"], reverse=True)
    return {"sales": sales, "count": len(sales)}


def _user_label(user_id: str | None) -> str:
    if not user_id:
        return ""
    u = user_store.find_by_id(user_id)
    return u["full_name"] if u else user_id


@router.get("/commissions")
def list_commissions_admin(
    sale_id: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Liệt kê bản ghi hoa hồng (5 bậc) — flatten theo từng người nhận."""
    records = commission_store.list_records(sale_id=sale_id, limit=1000)
    rows = []
    for rec in records:
        st = rec.get("status", "pending")
        if status_filter and st != status_filter:
            continue
        for tier in rec.get("tiers", []):
            rows.append(
                {
                    "deal_id": rec["deal_id"],
                    "deal_amount": rec.get("deal_amount", 0),
                    "sale_name": rec.get("sale_name") or _user_label(rec.get("sale_id")),
                    "tier_role": tier.get("role"),
                    "recipient": _user_label(tier.get("user_id")),
                    "pct": tier.get("pct", 0),
                    "commission_amount": round(float(tier.get("amount", 0))),
                    "status": st,
                    "approved_at": rec.get("approved_at"),
                    "paid_at": rec.get("paid_at"),
                    "saved_at": rec.get("saved_at"),
                }
            )
    total = sum(r["commission_amount"] for r in rows)
    return {"records": rows, "count": len(rows), "total_commission": total}


@router.post("/commissions/{deal_id}/approve")
def approve_commission(
    deal_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    rec = commission_store.set_status(
        deal_id, status="approved",
        approved_at=datetime.utcnow().isoformat() + "Z",
    )
    if not rec:
        raise HTTPException(404, "Không tìm thấy bản ghi hoa hồng")
    audit_store.record_admin("commission.approve", admin, target=deal_id)
    return {"ok": True, "deal_id": deal_id, "status": rec["status"]}


@router.post("/commissions/{deal_id}/mark-paid")
def mark_commission_paid(
    deal_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    rec = commission_store.set_status(
        deal_id, status="paid",
        paid_at=datetime.utcnow().isoformat() + "Z",
    )
    if not rec:
        raise HTTPException(404, "Không tìm thấy bản ghi hoa hồng")
    audit_store.record_admin("commission.mark_paid", admin, target=deal_id)
    return {"ok": True, "deal_id": deal_id, "status": rec["status"]}


@router.get("/referral-tree")
def referral_tree(_admin: dict = Depends(require_admin)) -> dict:
    """Cây giới thiệu đệ quy theo upline_email → downline."""
    users = user_store.list_users()
    children: dict[str, list[dict]] = {}
    for u in users:
        up = (u.get("upline_email") or "").lower()
        children.setdefault(up, []).append(u)

    def build(node: dict) -> dict:
        kids = children.get(node["email"].lower(), [])
        return {
            "id": node["id"],
            "full_name": node["full_name"],
            "email": node["email"],
            "role": node.get("role"),
            "referral_code": node.get("referral_code"),
            "children": [build(k) for k in kids if k["id"] != node["id"]],
        }

    # Gốc: user không có upline (hoặc upline không tồn tại trong hệ thống).
    emails = {u["email"].lower() for u in users}
    roots = [
        u for u in users
        if not (u.get("upline_email") or "").lower()
        or (u.get("upline_email") or "").lower() not in emails
    ]
    return {"tree": [build(r) for r in roots], "total": len(users)}


# ===========================================================================
# PHASE 2 — Quản lý quỹ căn (inventory CRUD)
# ===========================================================================

@router.get("/inventory")
def admin_list_inventory(
    phan_khu: Optional[str] = Query(default=None),
    loai: Optional[str] = Query(default=None),
    trang_thai: Optional[str] = Query(default=None),
    quy: Optional[str] = Query(default=None),
    _admin: dict = Depends(require_admin),
) -> dict:
    rows = inventory_module.get_units()
    if phan_khu and phan_khu not in ("", "Tất cả"):
        rows = [u for u in rows if u["phan_khu"] == phan_khu]
    if loai and loai not in ("", "Tất cả"):
        rows = [u for u in rows if u["loai"] == loai]
    if trang_thai and trang_thai not in ("", "Tất cả"):
        rows = [u for u in rows if u["trang_thai"] == trang_thai]
    if quy and quy not in ("", "Tất cả"):
        rows = [u for u in rows if u.get("quy") == quy]
    return {"units": rows, "count": len(rows)}


@router.post("/inventory", status_code=status.HTTP_201_CREATED)
def admin_create_inventory(
    payload: InventoryUnitCreate,
    admin: dict = Depends(require_admin),
) -> dict:
    try:
        unit = inventory_module.admin_create_unit(payload.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    audit_store.record_admin("inventory.create", admin, target=unit["id"])
    return unit


@router.patch("/inventory/{unit_id}")
def admin_update_inventory(
    unit_id: str,
    payload: InventoryUnitUpdate,
    admin: dict = Depends(require_admin),
) -> dict:
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        raise HTTPException(400, "Không có thay đổi nào")
    try:
        unit = inventory_module.admin_update_unit(unit_id, changes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not unit:
        raise HTTPException(404, "Căn không tồn tại")
    audit_store.record_admin(
        "inventory.update", admin, target=unit_id, new_value=changes
    )
    return unit


@router.delete("/inventory/{unit_id}")
def admin_delete_inventory(
    unit_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    ok = inventory_module.admin_delete_unit(unit_id)
    if not ok:
        raise HTTPException(404, "Căn không tồn tại")
    audit_store.record_admin("inventory.delete", admin, target=unit_id)
    return {"ok": True, "unit_id": unit_id}


# ===========================================================================
# PHASE 2 — Kho tài liệu (KB) — reindex
# ===========================================================================

@router.get("/kb/stats")
def kb_stats(_admin: dict = Depends(require_admin)) -> dict:
    return learning_store.index_stats()


@router.post("/kb/reindex-all")
def kb_reindex_all(admin: dict = Depends(require_admin)) -> dict:
    result = learning_store.reindex_all()
    audit_store.record_admin("kb.reindex", admin, detail=str(result))
    return {"ok": True, **result}


# ===========================================================================
# PHASE 2 — Cấu hình hệ thống + Audit log + Backup
# ===========================================================================

@router.get("/settings")
def get_settings_admin(_admin: dict = Depends(require_admin)) -> dict:
    return {
        "config": settings_store.get_settings(),
        "integrations": settings_store.integrations_status(),
    }


@router.patch("/settings")
def patch_settings_admin(
    payload: SettingsUpdate,
    admin: dict = Depends(require_admin),
) -> dict:
    patch = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        raise HTTPException(400, "Không có thay đổi nào")
    config = settings_store.update_settings(patch)
    audit_store.record_admin("settings.update", admin, new_value=patch)
    return {"config": config, "integrations": settings_store.integrations_status()}


@router.get("/audit-log")
def get_audit_log(
    limit: int = Query(default=100, le=500),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Nhật ký thao tác quản trị (prefix admin.*)."""
    events = audit_store.list_events(prefix="admin.", limit=limit)
    return {"events": events, "count": len(events)}


# Lịch sử backup (in-memory MVP) — script backup_db.py ghi nhận qua đây.
_BACKUP_HISTORY: list[dict] = []


@router.post("/backup/trigger")
def trigger_backup(admin: dict = Depends(require_admin)) -> dict:
    """Kích hoạt backup thủ công. MVP: ghi nhận thời điểm + đếm bản ghi.

    Backup thật (pg_dump / export JSON) chạy qua app/scripts/backup_db.py trên
    Railway cron; endpoint này ghi nhận yêu cầu để hiển thị lịch sử cho admin.
    """
    entry = {
        "id": secrets.token_hex(6),
        "triggered_by": admin.get("email"),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "users": len(user_store.list_users()),
        "status": "requested",
    }
    _BACKUP_HISTORY.insert(0, entry)
    del _BACKUP_HISTORY[20:]
    audit_store.record_admin("backup.trigger", admin)
    return {"ok": True, "backup": entry}


@router.get("/backup/list")
def list_backups(_admin: dict = Depends(require_admin)) -> dict:
    return {"backups": _BACKUP_HISTORY}
