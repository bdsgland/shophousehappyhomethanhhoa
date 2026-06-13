"""Store HỒ SƠ ĐẠI LÝ F2 (sàn cấp dưới) — JSON interim.

File: data/_runtime/agency_applications.json → {"agencies": [ {agency dict} ]}

LUỒNG:
  1. Đăng ký NHANH → tạo TÀI KHOẢN agency (role="agency") + 1 bản ghi agency ở đây
     với status="pending", commission_tier="base" (CHƯA 80%). Chủ sàn đăng nhập
     vào khu /agency để trải nghiệm + khai báo hồ sơ F2.
  2. Bên trong khu /agency, chủ sàn tự KHAI BÁO điều kiện F2: thông tin doanh
     nghiệp (tên DN, MST, địa chỉ, người đại diện pháp luật), cam kết hoạt động
     môi giới, và >= 5 tài khoản sale. Khi đủ điều kiện → "Gửi duyệt".
  3. ADMIN duyệt: đủ điều kiện + Duyệt → status="active", commission_tier="f2_80"
     (80%) + can_config_sale_commission=True. CHỈ khi đó mức hoa hồng mới lên đại lý.

BẢO MẬT: bản ghi này gắn `owner_user_id` (tài khoản role="agency"). Chủ sàn CHỈ
thao tác trên bản ghi của CHÍNH MÌNH (tầng endpoint gác theo owner_user_id từ
token). KHÔNG cấp quyền admin toàn nền tảng. Việc tạo tài khoản cho từng sale của
F2 + phân tách dữ liệu đa-tenant cho công cụ vận hành là BƯỚC NỀN (hoàn thiện sau).

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/lead_store.py & user_store.py.
"""

from __future__ import annotations

import json
import os
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.Lock()

_ROOT_KEY = "agencies"

# Trạng thái bản ghi agency.
STATUS_PENDING = "pending"    # mới đăng ký, đang trải nghiệm/khai báo
STATUS_ACTIVE = "active"      # đã được admin duyệt làm F2
STATUS_REJECTED = "rejected"  # bị từ chối
_VALID_STATUS = {STATUS_PENDING, STATUS_ACTIVE, STATUS_REJECTED}

# Mức hoa hồng.
TIER_BASE = "base"            # mặc định khi mới đăng ký (chưa phải F2)
TIER_F2 = "f2_80"            # F2 đã duyệt — 80% hoa hồng từ hệ thống
F2_COMMISSION_PCT = 80

# Số sale tối thiểu để đủ điều kiện F2.
MIN_SALES = 5


# ---------------------------------------------------------------------------
# Path / IO helpers (cùng pattern lead_store/user_store)
# ---------------------------------------------------------------------------

def _resolve(rel: str) -> Path:
    p = Path(rel)
    if p.is_absolute():
        return p
    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / p).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / p).resolve()
    return (Path.cwd() / p).resolve()


def _ensure() -> Path:
    path = _resolve(settings.agency_applications_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({_ROOT_KEY: []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or _ROOT_KEY not in data:
        data = {_ROOT_KEY: []}
    return data


def _write(data: dict) -> None:
    path = _ensure()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _norm_email(email: Optional[str]) -> Optional[str]:
    return (email or "").strip().lower() or None


def _clean(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _clean_sales(raw_sales) -> list[dict]:
    """Chuẩn hoá danh sách sale → [{name, phone, email}], bỏ dòng rỗng/không hợp lệ.

    Sale "hợp lệ" = có tên VÀ (SĐT hoặc email).
    """
    out: list[dict] = []
    if not isinstance(raw_sales, (list, tuple)):
        return out
    for s in raw_sales:
        if not isinstance(s, dict):
            continue
        name = _clean(s.get("name"))
        phone = _clean(s.get("phone"))
        email = _norm_email(s.get("email"))
        if not name or (not phone and not email):
            continue
        out.append({"name": name, "phone": phone, "email": email})
    return out


def _empty_business() -> dict:
    return {
        "ten_dn": None,
        "ma_so_thue": None,
        "dia_chi": None,
        "nguoi_dai_dien_phap_luat": None,
    }


# ---------------------------------------------------------------------------
# Eligibility / progress
# ---------------------------------------------------------------------------

def _business_ok(business: dict) -> bool:
    b = business or {}
    return bool(
        _clean(b.get("ten_dn"))
        and _clean(b.get("ma_so_thue"))
        and _clean(b.get("dia_chi"))
        and _clean(b.get("nguoi_dai_dien_phap_luat"))
    )


def compute_eligible(agency: dict) -> bool:
    """Đủ điều kiện F2: đủ thông tin DN + cam kết môi giới + >= MIN_SALES sale."""
    return bool(
        _business_ok(agency.get("business_info") or {})
        and agency.get("brokerage_declared")
        and len(agency.get("sales") or []) >= MIN_SALES
    )


def compute_progress(agency: dict) -> dict:
    """Tiến độ điều kiện (cho UI hiển thị 'Đã thêm 3/5 sale', 'Chưa khai DN'...)."""
    sales_count = len(agency.get("sales") or [])
    return {
        "business_ok": _business_ok(agency.get("business_info") or {}),
        "brokerage_ok": bool(agency.get("brokerage_declared")),
        "sales_count": sales_count,
        "sales_required": MIN_SALES,
        "sales_ok": sales_count >= MIN_SALES,
        "eligible": compute_eligible(agency),
    }


def _view(agency: dict) -> dict:
    out = dict(agency)
    out["progress"] = compute_progress(agency)
    out["eligible"] = compute_eligible(agency)
    return out


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_agency(
    *,
    owner_user_id: str,
    ten_san: str,
    nguoi_dai_dien: Optional[str],
    phone: Optional[str],
    email: Optional[str],
) -> dict:
    """Tạo bản ghi agency mới (status=pending, tier=base) gắn với tài khoản chủ sàn."""
    now = _now()
    with _LOCK:
        data = _load()
        agency = {
            "id": str(uuid.uuid4()),
            "owner_user_id": owner_user_id,
            "ten_san": _clean(ten_san) or "",
            "nguoi_dai_dien": _clean(nguoi_dai_dien),
            "phone": _clean(phone),
            "email": _norm_email(email),
            "status": STATUS_PENDING,
            "commission_tier": TIER_BASE,
            "commission_pct": None,
            # Hồ sơ điều kiện F2 (khai báo bên trong /agency) — rỗng ban đầu.
            "business_info": _empty_business(),
            "brokerage_declared": False,
            "gpkd_so": None,
            "sales": [],
            "can_config_sale_commission": False,
            "submitted_for_review": False,
            "review_note": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "created_at": now,
            "updated_at": now,
        }
        data[_ROOT_KEY].append(agency)
        _write(data)
        return _view(agency)


def get_by_owner(owner_user_id: str) -> Optional[dict]:
    with _LOCK:
        for a in _load()[_ROOT_KEY]:
            if a.get("owner_user_id") == owner_user_id:
                return _view(a)
    return None


def get_by_id(agency_id: str) -> Optional[dict]:
    with _LOCK:
        for a in _load()[_ROOT_KEY]:
            if a.get("id") == agency_id:
                return _view(a)
    return None


def update_profile(owner_user_id: str, **fields) -> Optional[dict]:
    """Chủ sàn tự cập nhật hồ sơ F2 (business_info / brokerage / sales / ...).

    Chỉ nhận key cho phép, bỏ qua None. `business_info` merge từng field con.
    `sales` được chuẩn hoá lại. Trả view đã cập nhật, None nếu không tìm thấy.
    """
    now = _now()
    with _LOCK:
        data = _load()
        for a in data[_ROOT_KEY]:
            if a.get("owner_user_id") != owner_user_id:
                continue
            # Thông tin cơ bản
            if fields.get("ten_san") is not None:
                a["ten_san"] = _clean(fields["ten_san"]) or a.get("ten_san", "")
            if fields.get("nguoi_dai_dien") is not None:
                a["nguoi_dai_dien"] = _clean(fields["nguoi_dai_dien"])
            if fields.get("phone") is not None:
                a["phone"] = _clean(fields["phone"])
            if fields.get("email") is not None:
                a["email"] = _norm_email(fields["email"])
            # Thông tin doanh nghiệp (merge từng field con)
            bi = fields.get("business_info")
            if isinstance(bi, dict):
                cur = a.get("business_info") or _empty_business()
                for k in ("ten_dn", "ma_so_thue", "dia_chi", "nguoi_dai_dien_phap_luat"):
                    if bi.get(k) is not None:
                        cur[k] = _clean(bi.get(k))
                a["business_info"] = cur
            # Cam kết môi giới + GPKD
            if fields.get("brokerage_declared") is not None:
                a["brokerage_declared"] = bool(fields["brokerage_declared"])
            if fields.get("gpkd_so") is not None:
                a["gpkd_so"] = _clean(fields["gpkd_so"])
            # Danh sách sale
            if fields.get("sales") is not None:
                a["sales"] = _clean_sales(fields["sales"])
            if fields.get("ghi_chu") is not None:
                a["ghi_chu"] = _clean(fields["ghi_chu"])
            a["updated_at"] = now
            _write(data)
            return _view(a)
    return None


def submit_for_review(owner_user_id: str) -> Optional[dict]:
    """Chủ sàn gửi hồ sơ duyệt. Chỉ đặt cờ submitted khi ĐỦ điều kiện.

    Trả view (kèm `submitted_for_review`). None nếu không tìm thấy. Nếu chưa đủ
    điều kiện → KHÔNG đặt cờ (caller kiểm `eligible` để báo lỗi)."""
    now = _now()
    with _LOCK:
        data = _load()
        for a in data[_ROOT_KEY]:
            if a.get("owner_user_id") != owner_user_id:
                continue
            if compute_eligible(a):
                a["submitted_for_review"] = True
                a["updated_at"] = now
                _write(data)
            return _view(a)
    return None


def list_agencies(status: Optional[str] = None) -> list[dict]:
    with _LOCK:
        rows = list(_load()[_ROOT_KEY])
    if status:
        rows = [a for a in rows if a.get("status") == status]
    rows.sort(key=lambda a: a.get("created_at") or "", reverse=True)
    return [_view(a) for a in rows]


def set_status(
    agency_id: str,
    status: str,
    *,
    reviewed_by: Optional[str] = None,
    review_note: Optional[str] = None,
) -> Optional[dict]:
    """Admin duyệt/từ chối.

    - APPROVE (status=active) + ĐỦ điều kiện → commission_tier="f2_80" (80%) +
      can_config_sale_commission=True.
    - APPROVE nhưng CHƯA đủ điều kiện → KHÔNG cấp tier (giữ base) — an toàn.
    - REJECT / PENDING → reset tier về base, tắt quyền cấu hình hoa hồng.

    Trả view đã cập nhật, None nếu không tìm thấy. ValueError nếu status sai.
    """
    if status not in _VALID_STATUS:
        raise ValueError(f"Trạng thái không hợp lệ: {status}")
    now = _now()
    with _LOCK:
        data = _load()
        for a in data[_ROOT_KEY]:
            if a.get("id") != agency_id:
                continue
            a["status"] = status
            a["reviewed_by"] = reviewed_by
            if review_note is not None:
                a["review_note"] = _clean(review_note)
            a["reviewed_at"] = now
            a["updated_at"] = now
            if status == STATUS_ACTIVE and compute_eligible(a):
                a["commission_tier"] = TIER_F2
                a["commission_pct"] = F2_COMMISSION_PCT
                a["can_config_sale_commission"] = True
            else:
                a["commission_tier"] = TIER_BASE
                a["commission_pct"] = None
                a["can_config_sale_commission"] = False
            _write(data)
            return _view(a)
    return None


def compute_stats() -> dict:
    with _LOCK:
        rows = list(_load()[_ROOT_KEY])
    by_status: dict[str, int] = {}
    for a in rows:
        st = a.get("status", STATUS_PENDING)
        by_status[st] = by_status.get(st, 0) + 1
    return {
        "total": len(rows),
        "pending": by_status.get(STATUS_PENDING, 0),
        "active": by_status.get(STATUS_ACTIVE, 0),
        "rejected": by_status.get(STATUS_REJECTED, 0),
    }


def clear() -> None:
    """Xoá toàn bộ — chỉ dùng trong test."""
    with _LOCK:
        _write({_ROOT_KEY: []})
