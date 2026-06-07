"""Endpoint đặt lịch xem nhà — flow chốt giá trị của Eurowindow Light City.

Khoảnh khắc khách bấm "Đặt lịch xem nhà" = HOT LEAD. Mỗi booking:
  - Tự tạo/khớp Lead (dedupe theo phone/email).
  - Nếu có referral_code → gán sale phụ trách (upline qua mã giới thiệu).
  - Tính ai_score (0-100) theo mức độ tương tác.
  - Trigger n8n "Hot Lead Alert" (tái dùng automation._build_hot_lead_payload).

Endpoints:
  POST   /bookings                  → tạo booking (client hoặc ẩn danh)
  GET    /bookings                  → list (admin: tất cả; sale: của mình; client: của mình)
  GET    /bookings/{id}             → chi tiết
  PATCH  /bookings/{id}             → đổi trạng thái (theo quyền)
  POST   /bookings/{id}/reschedule  → đổi giờ hẹn
  GET    /me/bookings               → booking của user hiện tại (router riêng)

Storage: JSON store interim (app/core/booking_store.py). Sau Sprint 1.1 migrate
PostgreSQL — giữ interface store để swap dễ.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    Response,
    status,
)

from app.api import automation
from app.api import leads as leads_store
from app.api.deps import get_current_user
from app.api.inventory import get_unit
from app.core import audit_store, booking_store, user_store
from app.core.security import decode_access_token
from app.core.settings import settings
from app.schemas.automation import BookingCreatedIn
from app.schemas.booking import (
    Booking,
    BookingCreate,
    BookingReschedule,
    BookingUpdate,
)
from app.schemas.lead import Lead

router = APIRouter(prefix="/bookings", tags=["bookings"])
# Router phụ cho /me/bookings (prefix khác) — mount cùng file, đăng ký riêng.
me_router = APIRouter(tags=["bookings"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def optional_current_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    """Trả user nếu có JWT hợp lệ, None nếu khách ẩn danh (không raise)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            return None
        user = user_store.find_by_id(sub)
        if user and user.get("is_active", True):
            return user
    except Exception:  # noqa: BLE001 — token sai/ hết hạn → coi như ẩn danh
        return None
    return None


def _parse_dt(value: str) -> Optional[datetime]:
    """Parse ISO string (có/không hậu tố Z) → datetime naive (UTC)."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        return None


def _unit_summary(unit_id: str) -> str:
    """Mô tả ngắn căn từ kho — dùng cho alert n8n & hiển thị."""
    u = get_unit(unit_id)
    if not u:
        return unit_id
    return f"{u['loai']} {u['phan_khu']}, {u['dien_tich']:.0f}m², {u['gia']}"


def compute_ai_score(user: Optional[dict]) -> int:
    """AI score 0-100 cho mức độ "nóng" của khách đặt lịch.

    Base 50, cộng theo tín hiệu tương tác đo được từ tài khoản:
      +15 nếu đã lưu > 1 căn yêu thích
      +5  nếu đăng ký > 3 ngày trước (đã theo dõi dự án một thời gian)
    Hai tín hiệu cần tracking riêng (chat > 5 tin: +20, dùng calculator vay: +10)
    để dành Phase 2 khi có log tương tác — hiện chưa đo được nên bỏ qua.
    """
    score = 50
    if user:
        if len(user.get("favorites") or []) > 1:
            score += 15
        created = _parse_dt(user.get("created_at") or "")
        if created and (datetime.utcnow() - created) > timedelta(days=3):
            score += 5
    return min(score, 100)


def _find_or_create_lead(
    *,
    name: str,
    phone: str,
    email: str,
    sale_id: Optional[str],
    notes: Optional[str],
) -> Lead:
    """Khớp lead đã có (dedupe phone/email) hoặc tạo mới gắn dự án ELC."""
    existing = leads_store._find_existing(phone, email)
    if existing:
        if sale_id and not existing.assigned_sale_id:
            existing.assigned_sale_id = sale_id
        if existing.status in ("new", "nurturing"):
            existing.status = "hot"
        existing.updated_at = datetime.utcnow()
        return existing

    lead = Lead(
        id=str(uuid4()),
        full_name=name,
        phone=phone,
        email=email,
        source_channel="booking",
        project="Eurowindow Light City",
        project_slug="eurowindow-light-city",
        notes=notes,
        status="hot",
        intent_score=70,
        assigned_sale_id=sale_id,
    )
    leads_store._LEADS[lead.id] = lead
    return lead


def _to_model(record: dict) -> Booking:
    return Booking(**record)


def _client_owns(user: dict, record: dict) -> bool:
    if record.get("created_by_user_id") == user["id"]:
        return True
    email = (user.get("email") or "").lower()
    return bool(email) and (record.get("customer_email") or "").lower() == email


# ---------------------------------------------------------------------------
# POST /bookings — tạo booking
# ---------------------------------------------------------------------------

@router.post("", response_model=Booking, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    background: BackgroundTasks,
    response: Response,
    user: Optional[dict] = Depends(optional_current_user),
) -> Booking:
    """Tạo booking mới — client đã đăng nhập hoặc khách ẩn danh đều dùng được."""
    # 1) Xác định sale phụ trách qua referral_code (nếu có).
    sale_id: Optional[str] = None
    if payload.referral_code:
        sale = user_store.find_by_referral_code(payload.referral_code)
        if sale and sale.get("role") in ("sale", "admin"):
            sale_id = sale["id"]

    # 2) Tạo/khớp lead.
    lead = _find_or_create_lead(
        name=payload.customer_name,
        phone=payload.customer_phone,
        email=payload.customer_email,
        sale_id=sale_id,
        notes=payload.notes,
    )

    # 3) Tính AI score.
    ai_score = compute_ai_score(user)

    # 4) Lưu booking.
    now = datetime.utcnow()
    unit_summary = _unit_summary(payload.unit_id)
    record = {
        "id": str(uuid4()),
        "unit_id": payload.unit_id,
        "unit_summary": unit_summary,
        "lead_id": lead.id,
        "sale_id": sale_id,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "customer_email": payload.customer_email,
        "scheduled_at": payload.scheduled_at.isoformat(),
        "status": "pending",
        "notes": payload.notes,
        "ai_score": ai_score,
        "referral_code": payload.referral_code,
        "created_by_user_id": user["id"] if user else None,
        "created_at": now.isoformat() + "Z",
        "updated_at": now.isoformat() + "Z",
    }
    booking_store.create(record)

    # 5) Trigger n8n Hot Lead Alert (tái dùng logic automation đã test).
    body = BookingCreatedIn(
        lead_id=lead.id,
        unit_id=payload.unit_id,
        unit_summary=unit_summary,
        booking_time=payload.scheduled_at.strftime("%Y-%m-%d %H:%M"),
        sale_id=sale_id,
        ai_score=ai_score,
        ai_summary=payload.notes or "",
        lead_name=payload.customer_name,
        lead_phone=payload.customer_phone,
        lead_email=payload.customer_email,
    )
    hot_payload = automation._build_hot_lead_payload(body)
    audit_store.record(
        "booking-created", hot_payload, detail="đặt lịch xem nhà, đang gửi n8n"
    )
    background.add_task(
        automation._forward,
        settings.hot_lead_webhook_url(),
        hot_payload,
        "n8n.hot-lead-alert",
    )

    response.status_code = status.HTTP_201_CREATED
    return _to_model(record)


# ---------------------------------------------------------------------------
# GET /bookings — list theo quyền
# ---------------------------------------------------------------------------

@router.get("")
def list_bookings(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    sale_id: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None, description="ISO date/datetime"),
    date_to: Optional[str] = Query(default=None, description="ISO date/datetime"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> dict:
    """List booking. Admin xem tất cả; sale chỉ của mình; client chỉ của mình."""
    rows = booking_store.list_all()
    role = user.get("role")

    # Phân quyền dữ liệu.
    if role == "admin":
        if sale_id:
            rows = [b for b in rows if b.get("sale_id") == sale_id]
    elif role == "sale":
        rows = [b for b in rows if b.get("sale_id") == user["id"]]
    else:  # client
        rows = [b for b in rows if _client_owns(user, b)]

    # Lọc.
    if status_filter:
        rows = [b for b in rows if b.get("status") == status_filter]
    df = _parse_dt(date_from) if date_from else None
    dt = _parse_dt(date_to) if date_to else None
    if df or dt:
        def _in_range(b: dict) -> bool:
            sched = _parse_dt(b.get("scheduled_at") or "")
            if sched is None:
                return False
            if df and sched < df:
                return False
            if dt and sched > dt:
                return False
            return True

        rows = [b for b in rows if _in_range(b)]

    # Sắp xếp theo giờ hẹn gần nhất trước.
    rows.sort(key=lambda b: b.get("scheduled_at") or "", reverse=True)

    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "items": [_to_model(b).model_dump(mode="json") for b in page_rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ---------------------------------------------------------------------------
# GET /bookings/{id} — chi tiết
# ---------------------------------------------------------------------------

@router.get("/{booking_id}", response_model=Booking)
def get_booking(booking_id: str, user: dict = Depends(get_current_user)) -> Booking:
    record = booking_store.get(booking_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy booking")
    role = user.get("role")
    if role == "admin":
        pass
    elif role == "sale":
        if record.get("sale_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Booking không thuộc về bạn")
    else:
        if not _client_owns(user, record):
            raise HTTPException(status_code=403, detail="Booking không thuộc về bạn")
    return _to_model(record)


# ---------------------------------------------------------------------------
# PATCH /bookings/{id} — đổi trạng thái
# ---------------------------------------------------------------------------

_SALE_ALLOWED = {"confirmed", "completed", "no_show", "cancelled"}


@router.patch("/{booking_id}", response_model=Booking)
def update_booking(
    booking_id: str,
    payload: BookingUpdate,
    user: dict = Depends(get_current_user),
) -> Booking:
    record = booking_store.get(booking_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy booking")
    role = user.get("role")
    target = payload.status

    if role == "admin":
        pass
    elif role == "sale":
        if record.get("sale_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Booking không thuộc về bạn")
        if target not in _SALE_ALLOWED:
            raise HTTPException(
                status_code=403, detail="Sale không được đặt trạng thái này"
            )
    else:  # client — chỉ được huỷ, và chỉ trước 24h
        if not _client_owns(user, record):
            raise HTTPException(status_code=403, detail="Booking không thuộc về bạn")
        if target != "cancelled":
            raise HTTPException(
                status_code=403, detail="Khách hàng chỉ có thể huỷ lịch hẹn"
            )
        sched = _parse_dt(record.get("scheduled_at") or "")
        if sched and (sched - datetime.utcnow()) < timedelta(hours=24):
            raise HTTPException(
                status_code=400,
                detail="Chỉ có thể huỷ trước giờ hẹn ít nhất 24 giờ",
            )

    updated = booking_store.update(booking_id, status=target)
    return _to_model(updated)


# ---------------------------------------------------------------------------
# POST /bookings/{id}/reschedule — đổi giờ hẹn
# ---------------------------------------------------------------------------

@router.post("/{booking_id}/reschedule", response_model=Booking)
def reschedule_booking(
    booking_id: str,
    payload: BookingReschedule,
    user: dict = Depends(get_current_user),
) -> Booking:
    record = booking_store.get(booking_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy booking")
    role = user.get("role")

    if role == "admin":
        pass
    elif role == "sale":
        if record.get("sale_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Booking không thuộc về bạn")
    else:  # client — chỉ đổi trước 24h
        if not _client_owns(user, record):
            raise HTTPException(status_code=403, detail="Booking không thuộc về bạn")
        sched = _parse_dt(record.get("scheduled_at") or "")
        if sched and (sched - datetime.utcnow()) < timedelta(hours=24):
            raise HTTPException(
                status_code=400,
                detail="Chỉ có thể đổi giờ trước hẹn ít nhất 24 giờ",
            )

    # Đổi giờ → quay lại pending để sale xác nhận lại.
    updated = booking_store.update(
        booking_id,
        scheduled_at=payload.scheduled_at.isoformat(),
        status="pending",
    )
    return _to_model(updated)


# ---------------------------------------------------------------------------
# GET /me/bookings — booking của user hiện tại
# ---------------------------------------------------------------------------

@me_router.get("/me/bookings", response_model=list[Booking])
def my_bookings(user: dict = Depends(get_current_user)) -> list[Booking]:
    """Booking của user hiện tại (sale: được giao; client: tự đặt)."""
    rows = booking_store.list_all()
    role = user.get("role")
    if role == "sale":
        rows = [b for b in rows if b.get("sale_id") == user["id"]]
    elif role == "admin":
        pass  # admin: toàn bộ
    else:
        rows = [b for b in rows if _client_owns(user, b)]
    rows.sort(key=lambda b: b.get("scheduled_at") or "", reverse=True)
    return [_to_model(b) for b in rows]
