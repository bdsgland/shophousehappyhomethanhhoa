"""Đội Sale AI ("1000 saleman AI") — roster nhân viên sale ảo + tự động gán khách.

File:
  data/_runtime/ai_salesmen.json → {"salesmen": [ {salesman dict} ]}

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/lead_store.py & user_store.py. KHÔNG hard-delete (status "inactive").

MỖI BẢN GHI (sale AI):
  id            "ais_0001"
  code          "AIS-0001"           (mã hiển thị ngắn)
  name          tên Việt sinh tự động (vd "Trợ lý Sale AI · Nguyễn Minh An")
  specialty     khoá phân khúc: lien_ke | shophouse | can_ho  (phân bổ vòng tròn)
  specialty_label nhãn tiếng Việt
  capacity      số khách tối đa phụ trách (mặc định settings.ai_salesman_capacity)
  assigned_count số khách đang phụ trách (duy trì tăng/giảm khi gán/huỷ)
  status        "active" | "inactive"
  created_at / updated_at

AN TOÀN: roster trống → auto_assign_new_lead BỎ QUA (trả None, không lỗi). Mọi tin
nhắn ra khách thật chỉ ở dạng NHÁP (qua crew/service) — store này CHỈ gán dữ liệu
nội bộ + duy trì tải, KHÔNG gửi gì cho khách.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

log = logging.getLogger("ai_salesman_store")

_LOCK = threading.RLock()  # RLock: cho phép hàm gọi lồng nhau trong cùng store.


# ---------------------------------------------------------------------------
# Phân khúc chuyên môn (phân bổ vòng tròn khi seed) + map từ loại sản phẩm lead
# ---------------------------------------------------------------------------

SPECIALTIES: list[dict] = [
    {"key": "lien_ke", "label": "Liền kề"},
    {"key": "shophouse", "label": "Shophouse"},
    {"key": "can_ho", "label": "Căn hộ"},
]
_SPECIALTY_LABELS = {s["key"]: s["label"] for s in SPECIALTIES}

# Map loại sản phẩm (lead.product_type / từ khoá) → khoá phân khúc để ưu tiên khớp.
_PRODUCT_TYPE_MAP = {
    "lien_ke": "lien_ke", "liền kề": "lien_ke", "lienke": "lien_ke",
    "townhouse": "lien_ke", "nha_pho": "lien_ke", "nhà phố": "lien_ke",
    "shophouse": "shophouse", "shop": "shophouse", "thuong_mai": "shophouse",
    "can_ho": "can_ho", "căn hộ": "can_ho", "canho": "can_ho",
    "apartment": "can_ho", "chung_cu": "can_ho", "chung cư": "can_ho",
}


def map_product_type(product_type: Optional[str]) -> Optional[str]:
    """Đổi loại sản phẩm tự do của lead → khoá phân khúc. None nếu không khớp."""
    if not product_type:
        return None
    key = str(product_type).strip().lower()
    if key in _SPECIALTY_LABELS:
        return key
    return _PRODUCT_TYPE_MAP.get(key)


# ---------------------------------------------------------------------------
# Sinh tên Việt tự động (deterministic theo index → seed ổn định, không trùng lặp)
# ---------------------------------------------------------------------------

_SURNAMES = [
    "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng",
    "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Mai", "Trịnh", "Đoàn",
]
_MIDDLES = [
    "Minh", "Thanh", "Quốc", "Hữu", "Đức", "Thị", "Văn", "Ngọc", "Gia", "Bảo",
    "Hải", "Thu", "Anh", "Khánh", "Tuấn", "Phương",
]
_GIVENS = [
    "An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hùng", "Khang", "Linh", "Long",
    "Mai", "Nam", "Oanh", "Phúc", "Quân", "Sơn", "Trang", "Uyên", "Vy", "Yến",
    "Hương", "Tú", "Đạt", "Hoa", "Kiên", "Lâm", "Ngân", "Thắng", "Việt", "Như",
]


def _gen_name(idx: int) -> str:
    """Tên Việt deterministic theo idx (1-based). Tiền tố 'Trợ lý Sale AI ·'."""
    s = _SURNAMES[idx % len(_SURNAMES)]
    m = _MIDDLES[(idx // len(_SURNAMES)) % len(_MIDDLES)]
    g = _GIVENS[(idx // (len(_SURNAMES) * len(_MIDDLES))) % len(_GIVENS)]
    return f"Trợ lý Sale AI · {s} {m} {g}"


# ---------------------------------------------------------------------------
# Path / IO helpers (cùng pattern lead_store)
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
    path = _resolve(settings.ai_salesmen_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"salesmen": []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure()
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    path = _ensure()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _audit(event: str, payload: dict, *, status: str = "ok", detail: str = "") -> None:
    """Ghi audit best-effort (không làm hỏng luồng nếu audit lỗi)."""
    try:
        from app.core import audit_store

        audit_store.record(f"ai_sales.{event}", payload, status=status, detail=detail)
    except Exception as exc:  # noqa: BLE001
        log.warning("audit ai_sales.%s lỗi: %s", event, exc)


# ---------------------------------------------------------------------------
# Public view
# ---------------------------------------------------------------------------

def public_view(rec: dict) -> dict:
    """Bản ghi sale AI + field computed (capacity_left, load_ratio)."""
    out = dict(rec)
    cap = rec.get("capacity", 0) or 0
    used = rec.get("assigned_count", 0) or 0
    out["capacity_left"] = max(0, cap - used)
    out["load_ratio"] = round(used / cap, 3) if cap > 0 else 0.0
    return out


# ---------------------------------------------------------------------------
# Seed roster (idempotent)
# ---------------------------------------------------------------------------

def _make_record(idx: int) -> dict:
    """Tạo 1 bản ghi sale AI cho index (1-based)."""
    now = _now()
    spec = SPECIALTIES[(idx - 1) % len(SPECIALTIES)]
    return {
        "id": f"ais_{idx:04d}",
        "code": f"AIS-{idx:04d}",
        "name": _gen_name(idx),
        "specialty": spec["key"],
        "specialty_label": spec["label"],
        "capacity": int(settings.ai_salesman_capacity),
        "assigned_count": 0,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }


def seed_roster(n: int = 1000) -> dict:
    """Tạo đủ N sale AI (idempotent — KHÔNG tạo trùng nếu id đã có).

    Tạo các index 1..N còn THIẾU. Trả {created, total, requested}.
    """
    n = max(0, int(n))
    created = 0
    with _LOCK:
        data = _load()
        existing = {s.get("id") for s in data["salesmen"]}
        for i in range(1, n + 1):
            if f"ais_{i:04d}" in existing:
                continue
            data["salesmen"].append(_make_record(i))
            created += 1
        if created:
            _save(data)
        total = len(data["salesmen"])
    if created:
        _audit("seed", {"created": created, "total": total, "requested": n},
                detail=f"seed roster +{created} (total {total})")
    return {"created": created, "total": total, "requested": n}


# ---------------------------------------------------------------------------
# List / get / stats
# ---------------------------------------------------------------------------

def _matches_search(rec: dict, q: str) -> bool:
    q = q.lower()
    return (
        q in (rec.get("name") or "").lower()
        or q in (rec.get("code") or "").lower()
        or q in (rec.get("id") or "").lower()
        or q in (rec.get("specialty_label") or "").lower()
    )


def list_roster(
    *,
    status: Optional[str] = None,
    specialty: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Danh sách sale AI có lọc + phân trang (cho 1000 bản ghi)."""
    with _LOCK:
        rows = list(_load()["salesmen"])
    if status:
        rows = [r for r in rows if r.get("status") == status]
    if specialty:
        rows = [r for r in rows if r.get("specialty") == specialty]
    if search:
        rows = [r for r in rows if _matches_search(r, search)]
    rows.sort(key=lambda r: r.get("id") or "")
    total = len(rows)
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 500))
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [public_view(r) for r in page_rows],
    }


def get(ais_id: str) -> Optional[dict]:
    with _LOCK:
        for r in _load()["salesmen"]:
            if r.get("id") == ais_id:
                return public_view(r)
    return None


def compute_stats() -> dict:
    """Thống kê đội sale AI cho dashboard admin."""
    with _LOCK:
        rows = list(_load()["salesmen"])
    total = len(rows)
    active = [r for r in rows if r.get("status") == "active"]
    total_capacity = sum(r.get("capacity", 0) or 0 for r in rows)
    total_assigned = sum(r.get("assigned_count", 0) or 0 for r in rows)
    avg_load = round(total_assigned / len(active), 2) if active else 0.0
    by_specialty: dict[str, dict] = {}
    for s in SPECIALTIES:
        by_specialty[s["key"]] = {
            "key": s["key"], "label": s["label"], "count": 0, "assigned": 0,
        }
    for r in rows:
        slot = by_specialty.get(r.get("specialty"))
        if slot:
            slot["count"] += 1
            slot["assigned"] += r.get("assigned_count", 0) or 0
    return {
        "total": total,
        "active": len(active),
        "inactive": total - len(active),
        "total_capacity": total_capacity,
        "total_assigned": total_assigned,
        "avg_load": avg_load,
        "capacity_left": max(0, total_capacity - total_assigned),
        "by_specialty": list(by_specialty.values()),
    }


# ---------------------------------------------------------------------------
# Cập nhật counter + thuật toán chọn người gán (cân tải + khớp chuyên môn)
# ---------------------------------------------------------------------------

def _adjust_count(data: dict, ais_id: Optional[str], delta: int) -> None:
    """Tăng/giảm assigned_count của 1 sale AI (in-place trên data đã load)."""
    if not ais_id:
        return
    for r in data["salesmen"]:
        if r.get("id") == ais_id:
            r["assigned_count"] = max(0, (r.get("assigned_count", 0) or 0) + delta)
            r["updated_at"] = _now()
            return


def _pick(rows: list[dict], specialty: Optional[str]) -> Optional[dict]:
    """Chọn sale AI active còn chỗ, tải thấp nhất; ưu tiên khớp chuyên môn.

    Thứ tự: trong nhóm khớp chuyên môn (nếu có specialty) chọn assigned_count thấp
    nhất; nếu nhóm khớp đã đầy/không có → chọn trong toàn bộ còn chỗ. None nếu hết.
    """
    avail = [
        r for r in rows
        if r.get("status") == "active"
        and (r.get("assigned_count", 0) or 0) < (r.get("capacity", 0) or 0)
    ]
    if not avail:
        return None
    pool = avail
    if specialty:
        matched = [r for r in avail if r.get("specialty") == specialty]
        if matched:
            pool = matched
    # Tải thấp nhất; tie-break theo id để ổn định.
    pool.sort(key=lambda r: ((r.get("assigned_count", 0) or 0), r.get("id") or ""))
    return pool[0]


# ---------------------------------------------------------------------------
# Gán / chuyển / huỷ — orchestrate với lead_store (lazy import tránh vòng)
# ---------------------------------------------------------------------------

def _lead_product_type(lead: dict) -> Optional[str]:
    """Suy loại sản phẩm từ lead (field product_type nếu có)."""
    return map_product_type(lead.get("product_type"))


def assign(
    lead_id: str,
    *,
    product_type: Optional[str] = None,
    ais_id: Optional[str] = None,
    requested_by: Optional[str] = None,
) -> dict:
    """Gán 1 sale AI cho lead (cân tải + khớp chuyên môn) hoặc gán cứng `ais_id`.

    - `ais_id` có → chuyển sang đúng người đó (nếu khác người cũ).
    - `ais_id` None → tự chọn người phù hợp (auto). product_type ưu tiên khớp.
    Trả {ok, lead_id, ai_salesman|None, reason?}. KHÔNG raise khi roster trống.
    """
    from app.core import lead_store  # lazy import tránh vòng

    lead = lead_store.get_lead(lead_id)
    if not lead:
        return {"ok": False, "lead_id": lead_id, "ai_salesman": None,
                "reason": "Không tìm thấy khách hàng"}

    spec = map_product_type(product_type) or _lead_product_type(lead)
    current = lead.get("ai_salesman_id")

    with _LOCK:
        data = _load()
        if ais_id:
            target = next((r for r in data["salesmen"] if r.get("id") == ais_id), None)
            if target is None:
                return {"ok": False, "lead_id": lead_id, "ai_salesman": None,
                        "reason": f"Sale AI không tồn tại: {ais_id}"}
        else:
            target = _pick(data["salesmen"], spec)
            if target is None:
                return {"ok": False, "lead_id": lead_id, "ai_salesman": None,
                        "reason": "Roster trống hoặc tất cả sale AI đã đầy tải"}

        target_id = target["id"]
        if current == target_id:
            # Đã gán đúng người — không đổi counter, trả bản ghi hiện tại.
            return {"ok": True, "lead_id": lead_id, "ai_salesman": public_view(target),
                    "changed": False}

        # Chuyển: giảm người cũ, tăng người mới.
        _adjust_count(data, current, -1)
        _adjust_count(data, target_id, +1)
        _save(data)
        target = next((r for r in data["salesmen"] if r.get("id") == target_id), target)

    # Cập nhật lead NGOÀI lock store (lead_store có lock riêng).
    lead_store.set_ai_salesman(lead_id, target_id)
    _audit("assign",
           {"lead_id": lead_id, "ai_salesman_id": target_id, "from": current,
            "specialty": spec, "requested_by": requested_by},
           detail=f"assign lead={lead_id} → {target_id}")
    return {"ok": True, "lead_id": lead_id, "ai_salesman": public_view(target),
            "changed": True}


def reassign(lead_id: str, ais_id: str, *, requested_by: Optional[str] = None) -> dict:
    """Chuyển lead sang 1 sale AI chỉ định."""
    return assign(lead_id, ais_id=ais_id, requested_by=requested_by)


def unassign(lead_id: str, *, requested_by: Optional[str] = None) -> dict:
    """Gỡ sale AI khỏi lead (giảm tải người cũ, xoá ai_salesman_id)."""
    from app.core import lead_store  # lazy import

    lead = lead_store.get_lead(lead_id)
    if not lead:
        return {"ok": False, "lead_id": lead_id, "reason": "Không tìm thấy khách hàng"}
    current = lead.get("ai_salesman_id")
    if not current:
        return {"ok": True, "lead_id": lead_id, "changed": False}
    with _LOCK:
        data = _load()
        _adjust_count(data, current, -1)
        _save(data)
    lead_store.set_ai_salesman(lead_id, None)
    _audit("unassign", {"lead_id": lead_id, "ai_salesman_id": current,
                        "requested_by": requested_by},
           detail=f"unassign lead={lead_id} ({current})")
    return {"ok": True, "lead_id": lead_id, "changed": True}


def auto_assign_new_lead(
    lead_id: str, *, product_type: Optional[str] = None
) -> Optional[dict]:
    """Hook AN TOÀN gọi khi có lead MỚI — gán 1 sale AI nếu roster có người.

    KHÔNG raise: roster trống / lỗi bất kỳ → trả None, KHÔNG vỡ luồng tạo lead.
    Chỉ gán khi lead chưa có ai_salesman_id (tránh đè khi import lặp).
    """
    try:
        from app.core import lead_store  # lazy import

        lead = lead_store.get_lead(lead_id)
        if not lead or lead.get("ai_salesman_id"):
            return None
        result = assign(lead_id, product_type=product_type)
        return result.get("ai_salesman") if result.get("ok") else None
    except Exception as exc:  # noqa: BLE001 — auto-assign KHÔNG được làm hỏng tạo lead
        log.warning("auto_assign_new_lead lỗi cho lead %s: %s", lead_id, exc)
        return None


# ---------------------------------------------------------------------------
# Bảo trì: đồng bộ lại assigned_count từ leads thật (sửa lệch nếu có)
# ---------------------------------------------------------------------------

def recount_from_leads() -> dict:
    """Tính lại assigned_count cho mọi sale AI từ leads thật. Trả {updated}."""
    from app.core import lead_store  # lazy import

    counts: dict[str, int] = {}
    page = 1
    while True:
        res = lead_store.list_all_leads(page=page, page_size=500)
        for l in res.get("items", []):
            aid = l.get("ai_salesman_id")
            if aid:
                counts[aid] = counts.get(aid, 0) + 1
        if page * 500 >= res.get("total", 0):
            break
        page += 1
    updated = 0
    with _LOCK:
        data = _load()
        for r in data["salesmen"]:
            new = counts.get(r["id"], 0)
            if r.get("assigned_count") != new:
                r["assigned_count"] = new
                r["updated_at"] = _now()
                updated += 1
        if updated:
            _save(data)
    return {"updated": updated}


def clear() -> None:
    """Xoá toàn bộ roster — chỉ dùng trong test."""
    with _LOCK:
        _save({"salesmen": []})
