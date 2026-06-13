"""Endpoint ĐẠI LÝ F2 (sàn cấp dưới).

LUỒNG MỚI (không gate trước — vào hệ thống ngay rồi khai báo bên trong):
- POST /agency/register   → PUBLIC, rate-limit. TẠO TÀI KHOẢN agency (role="agency",
                            pending, tier base) + bản ghi hồ sơ → trả JWT (auto
                            login) để vào khu /agency trải nghiệm ngay.
- GET  /agency/me         → chủ sàn xem hồ sơ + tiến độ điều kiện F2 (role agency).
- PUT  /agency/me/profile → chủ sàn tự khai báo: DN + cam kết môi giới + >=5 sale.
- POST /agency/me/submit-for-review → gửi duyệt (chỉ khi đủ điều kiện).
- GET  /admin/agency-applications        → admin list hồ sơ F2.
- POST /admin/agency-applications/{id}/approve → duyệt (đủ điều kiện → tier f2_80 80%).
- POST /admin/agency-applications/{id}/reject  → từ chối.

BẢO MẬT:
  - Tài khoản agency tự đăng ký KHÔNG được cấp quyền admin toàn nền tảng. role
    riêng "agency"; require_agency chỉ cho thao tác trên hồ sơ của CHÍNH MÌNH
    (khoá theo owner_user_id lấy từ token). KHÔNG truy cập endpoint manager
    (require_admin) → không lộ dữ liệu toàn sàn/khách người khác.
  - Apply public chỉ tạo tài khoản pending + ghi hồ sơ; commission_tier=base
    (CHƯA 80%) cho tới khi admin duyệt đủ điều kiện.

PHẦN NỀN (hoàn thiện sau): tạo tài khoản đăng nhập cho từng sale của F2; cấu hình
hoa hồng CHI TIẾT cho sale (tái dùng commission_config_store); phân tách dữ liệu
đa-tenant cho công cụ vận hành /agency. Hiện v1: agency chỉ thấy hồ sơ + đội của
mình, KHÔNG mở endpoint vận hành toàn nền tảng.
"""

from __future__ import annotations

import logging
import threading
import time
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import require_admin, require_agency
from app.core import agency_application_store as store
from app.core import audit_store, user_store
from app.core.security import create_access_token, hash_password
from app.schemas.agency import (
    AgencyOut,
    AgencyProfileUpdate,
    AgencyRegister,
    AgencyReviewIn,
)

log = logging.getLogger("api.agency")

router = APIRouter(prefix="/agency", tags=["agency"])
admin_router = APIRouter(prefix="/admin/agency-applications", tags=["agency-admin"])


# ---------------------------------------------------------------------------
# Rate-limit cơ bản (in-memory, theo IP) — chống spam đăng ký công khai.
# ---------------------------------------------------------------------------

_RL_LOCK = threading.Lock()
_RL_HITS: dict[str, list[float]] = {}
_RL_WINDOW_SEC = 3600.0
_RL_MAX_HITS = 5
_RL_MAX_KEYS = 5000


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit_check(ip: str) -> bool:
    now = time.time()
    cutoff = now - _RL_WINDOW_SEC
    with _RL_LOCK:
        if len(_RL_HITS) > _RL_MAX_KEYS:
            _RL_HITS.clear()
        hits = [t for t in _RL_HITS.get(ip, []) if t > cutoff]
        if len(hits) >= _RL_MAX_HITS:
            _RL_HITS[ip] = hits
            return False
        hits.append(now)
        _RL_HITS[ip] = hits
        return True


# ---------------------------------------------------------------------------
# PUBLIC: đăng ký nhanh → tạo tài khoản agency + hồ sơ pending
# ---------------------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_agency(payload: AgencyRegister, request: Request) -> dict:
    """Đăng ký nhanh làm đại lý. Tạo tài khoản role="agency" (pending, tier base)
    rồi trả JWT để đăng nhập ngay vào khu /agency.

    KHÔNG cấp quyền admin. Điều kiện F2 khai báo sau, bên trong /agency.
    """
    ip = _client_ip(request)
    if not _rate_limit_check(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.",
        )

    try:
        user = user_store.create_user(
            email=payload.email,
            full_name=payload.ten_san.strip(),
            password_hash=hash_password(payload.password),
            phone=payload.phone,
            role="agency",
            source="agency_register",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi đăng ký: {type(e).__name__}",
        )

    # Tạo bản ghi hồ sơ agency (pending/base). Best-effort: lỗi không chặn login.
    try:
        store.create_agency(
            owner_user_id=user["id"],
            ten_san=payload.ten_san,
            nguoi_dai_dien=payload.nguoi_dai_dien,
            phone=payload.phone,
            email=payload.email,
        )
    except Exception:  # noqa: BLE001
        log.exception("Tạo hồ sơ agency lỗi cho user %s", user.get("id"))

    try:
        audit_store.record(
            "agency.registered",
            {"user_id": user["id"], "ten_san": payload.ten_san, "ip": ip},
            detail="Tài khoản đại lý mới đăng ký",
        )
    except Exception:  # noqa: BLE001
        pass

    token, expires_in = create_access_token(
        subject=user["id"],
        extra_claims={"email": user["email"], "role": "agency"},
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user_store.public_view(user),
    }


# ---------------------------------------------------------------------------
# AGENCY: hồ sơ của chính mình
# ---------------------------------------------------------------------------

def _own_agency_or_404(user: dict) -> dict:
    rec = store.get_by_owner(user["id"])
    if rec is None:
        # Tài khoản agency nhưng chưa có bản ghi (vd tạo thủ công) → tạo nền.
        rec = store.create_agency(
            owner_user_id=user["id"],
            ten_san=user.get("full_name") or "Sàn của tôi",
            nguoi_dai_dien=user.get("full_name"),
            phone=user.get("phone"),
            email=user.get("email"),
        )
    return rec


@router.get("/me", response_model=AgencyOut)
def get_my_agency(user: dict = Depends(require_agency)) -> AgencyOut:
    return AgencyOut(**_own_agency_or_404(user))


@router.put("/me/profile", response_model=AgencyOut)
def update_my_agency(
    payload: AgencyProfileUpdate, user: dict = Depends(require_agency)
) -> AgencyOut:
    _own_agency_or_404(user)  # đảm bảo có bản ghi
    fields = payload.model_dump(exclude_unset=True)
    rec = store.update_profile(user["id"], **fields)
    if rec is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ đại lý")
    return AgencyOut(**rec)


@router.post("/me/submit-for-review", response_model=AgencyOut)
def submit_my_agency(user: dict = Depends(require_agency)) -> AgencyOut:
    rec = _own_agency_or_404(user)
    if not rec.get("eligible"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Chưa đủ điều kiện gửi duyệt: cần khai đầy đủ thông tin doanh "
                f"nghiệp, cam kết môi giới và tối thiểu {store.MIN_SALES} sale."
            ),
        )
    updated = store.submit_for_review(user["id"])
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ đại lý")
    return AgencyOut(**updated)


# ---------------------------------------------------------------------------
# ADMIN: list + approve + reject
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=list[AgencyOut])
def list_agency_applications(
    status_filter: Optional[str] = None,
    _admin: dict = Depends(require_admin),
) -> list[AgencyOut]:
    rows = store.list_agencies(status=status_filter)
    out: list[AgencyOut] = []
    for r in rows:
        try:
            out.append(AgencyOut(**r))
        except Exception as exc:  # noqa: BLE001 — 1 bản ghi hỏng không sập list
            log.warning("Bỏ qua agency lỗi serialize (id=%s): %s", r.get("id"), exc)
    return out


@admin_router.get("/stats")
def agency_stats(_admin: dict = Depends(require_admin)) -> dict:
    return store.compute_stats()


def _review(agency_id: str, new_status: str, admin: dict, note: Optional[str]) -> AgencyOut:
    rec = store.set_status(
        agency_id,
        new_status,
        reviewed_by=admin.get("email") or admin.get("id"),
        review_note=note,
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ đại lý")
    try:
        audit_store.record_admin(
            f"agency.{new_status}",
            admin,
            target=agency_id,
            new_value={
                "status": rec.get("status"),
                "commission_tier": rec.get("commission_tier"),
            },
            detail=f"Duyệt đại lý F2 → {new_status}",
        )
    except Exception:  # noqa: BLE001
        pass
    return AgencyOut(**rec)


@admin_router.post("/{agency_id}/approve", response_model=AgencyOut)
def approve_agency(
    agency_id: str,
    payload: Optional[AgencyReviewIn] = None,
    admin: dict = Depends(require_admin),
) -> AgencyOut:
    """Duyệt làm F2. Đủ điều kiện → tier f2_80 (80%) + quyền cấu hình hoa hồng sale."""
    note = payload.review_note if payload else None
    return _review(agency_id, store.STATUS_ACTIVE, admin, note)


@admin_router.post("/{agency_id}/reject", response_model=AgencyOut)
def reject_agency(
    agency_id: str,
    payload: Optional[AgencyReviewIn] = None,
    admin: dict = Depends(require_admin),
) -> AgencyOut:
    note = payload.review_note if payload else None
    return _review(agency_id, store.STATUS_REJECTED, admin, note)
