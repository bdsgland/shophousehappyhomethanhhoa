"""Lead (khách hàng) store + contact log store cho CRM — JSON interim.

Files:
  data/_runtime/leads.json         → {"leads": [ {lead dict} ]}
  data/_runtime/contact_logs.json  → {"logs": [ {log dict} ]}

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/user_store.py & booking_store.py. KHÔNG hard-delete (soft delete =
status "lost"). Sau migrate PostgreSQL — giữ interface để swap dễ.

`Lead` ở đây là khách hàng trong CRM (TÁCH BIỆT với lead nguồn chat in-memory ở
app/api/leads.py). AI score 0-100 tính theo engagement (xem compute_ai_score).
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.core.settings import settings

log = logging.getLogger("lead_store")

_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Path / IO helpers (1 cặp cho mỗi file)
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


def _ensure(rel: str, root_key: str) -> Path:
    path = _resolve(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({root_key: []}, ensure_ascii=False, indent=2))
    return path


def _load(rel: str, root_key: str) -> dict:
    path = _ensure(rel, root_key)
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _save(rel: str, root_key: str, data: dict) -> None:
    _write(_ensure(rel, root_key), data)


def _load_leads() -> dict:
    return _load(settings.leads_file, "leads")


def _save_leads(data: dict) -> None:
    _save(settings.leads_file, "leads", data)


def _load_logs() -> dict:
    return _load(settings.contact_logs_file, "logs")


def _save_logs(data: dict) -> None:
    _save(settings.contact_logs_file, "logs", data)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _auto_assign_ai_salesman(lead_id: str, product_type: Optional[str] = None) -> None:
    """Hook gọi sau khi tạo lead MỚI → tự động gán 1 sale AI (Đội Sale AI).

    AN TOÀN: lazy import + nuốt mọi lỗi (roster trống / module lỗi) để KHÔNG làm
    hỏng luồng tạo lead hiện tại. Đây là tính năng CỘNG THÊM.
    """
    try:
        from app.core import ai_salesman_store

        ai_salesman_store.auto_assign_new_lead(lead_id, product_type=product_type)
    except Exception as exc:  # noqa: BLE001 — không để auto-assign làm hỏng tạo lead
        log.warning("auto-assign sale AI lỗi cho lead %s: %s", lead_id, exc)


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        return None


def _norm_phone(phone: str) -> str:
    """Chuẩn hoá SĐT để dedupe: bỏ ký tự không phải số, +84/84 → 0."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("84") and len(digits) > 9:
        digits = "0" + digits[2:]
    return digits


def normalize_phone(phone: str) -> str:
    """Public wrapper cho `_norm_phone` — dùng khi nối nguồn khác (booking/quote)
    với lead theo SĐT chuẩn hoá (Hồ sơ 360°)."""
    return _norm_phone(phone)


# ---------------------------------------------------------------------------
# AI scoring
# ---------------------------------------------------------------------------

def compute_ai_score(lead: dict) -> int:
    """AI score 0-100 dựa trên engagement của lead.

      +20 nếu đã liên kết tài khoản web (registered)
      +30 nếu có ≥1 booking
      +10 nếu có ≥5 contact log với outcome != "no_answer"
      +5  nếu vừa được liên hệ < 3 ngày
      +5  nếu note dài > 50 ký tự
    """
    score = 0
    if lead.get("registered"):
        score += 20
    if lead.get("booking_count", 0) >= 1:
        score += 30
    if lead.get("effective_contact_count", 0) >= 5:
        score += 10
    last = _parse_dt(lead.get("last_contact_at"))
    if last and (datetime.utcnow() - last) < timedelta(days=3):
        score += 5
    if len((lead.get("note") or "")) > 50:
        score += 5
    return min(score, 100)


def _days_since_contact(lead: dict) -> Optional[int]:
    last = _parse_dt(lead.get("last_contact_at"))
    if not last:
        return None
    return (datetime.utcnow() - last).days


def public_view(lead: dict) -> dict:
    """Lead dict + field computed (days_since_contact).

    ai_score: nếu lead đã được AI chấm điểm (có `ai_scored_at`) thì GIỮ NGUYÊN
    điểm AI đã lưu; ngược lại tính lại bằng heuristic engagement (Phần A) để
    tương thích ngược.
    """
    out = dict(lead)
    if not lead.get("ai_scored_at"):
        out["ai_score"] = compute_ai_score(lead)
    out["days_since_contact"] = _days_since_contact(lead)
    return out


def apply_ai_insight(
    lead_id: str,
    *,
    ai_score: int,
    ai_reason: Optional[str] = None,
    ai_tier: Optional[str] = None,
    ai_best_time: Optional[str] = None,
    ai_next_action: Optional[dict] = None,
    new_status: Optional[str] = None,
) -> Optional[dict]:
    """Lưu kết quả AI CRM (Phần B) vào lead — KHÔNG đi qua heuristic recompute.

    Set ai_score/ai_reason/ai_tier/ai_best_time/ai_next_action + ai_scored_at=now.
    `new_status` (tuỳ chọn, từ auto_pipeline) ghi đè status nếu khác hiện tại.
    Trả public_view của lead đã cập nhật, None nếu không tìm thấy.
    """
    now = _now()
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                l["ai_score"] = int(max(0, min(100, ai_score)))
                if ai_reason is not None:
                    l["ai_reason"] = ai_reason
                if ai_tier is not None:
                    l["ai_tier"] = ai_tier
                if ai_best_time is not None:
                    l["ai_best_time"] = ai_best_time
                if ai_next_action is not None:
                    l["ai_next_action"] = ai_next_action
                l["ai_scored_at"] = now
                if new_status and new_status != l.get("status"):
                    l["status"] = new_status
                    l["updated_at"] = now
                _save_leads(data)
                return public_view(l)
    return None


# ---------------------------------------------------------------------------
# Lead CRUD
# ---------------------------------------------------------------------------

def _new_lead(
    *,
    name: str,
    phone: str,
    email: Optional[str],
    note: Optional[str],
    source: str,
    imported_by_sale_id: Optional[str],
    assigned_sale_id: Optional[str],
    status: str = "cold",
    registered: bool = False,
) -> dict:
    now = _now()
    lead = {
        "id": str(uuid.uuid4()),
        "name": (name or "").strip(),
        "phone": (phone or "").strip(),
        "email": ((email or "").strip().lower() or None),
        "source": source,
        "status": status,
        "assigned_sale_id": assigned_sale_id,
        "imported_by_sale_id": imported_by_sale_id,
        "ai_score": 0,
        "booking_count": 0,
        "contact_count": 0,
        "effective_contact_count": 0,
        "registered": registered,
        "last_contact_at": None,
        "hot_marker_at": None,
        "created_at": now,
        "updated_at": now,
        "note": (note or "").strip() or None,
    }
    lead["ai_score"] = compute_ai_score(lead)
    return lead


def _find_dupe(leads: list[dict], phone: str, email: Optional[str]) -> Optional[dict]:
    nphone = _norm_phone(phone)
    nemail = (email or "").strip().lower() or None
    for l in leads:
        if nphone and _norm_phone(l.get("phone", "")) == nphone:
            return l
        if nemail and (l.get("email") or "") == nemail:
            return l
    return None


def create_lead(
    lead_data: dict,
    imported_by_sale_id: Optional[str] = None,
    *,
    assigned_sale_id: Optional[str] = None,
    status: str = "cold",
    registered: bool = False,
) -> dict:
    """Tạo 1 lead mới. `lead_data` có name/phone/email/note/source.

    Mặc định gán assigned_sale_id = imported_by_sale_id (sale tự nhập thì tự
    phụ trách). Trả lead public_view.
    """
    assigned = assigned_sale_id if assigned_sale_id is not None else imported_by_sale_id
    with _LOCK:
        data = _load_leads()
        lead = _new_lead(
            name=lead_data.get("name", ""),
            phone=lead_data.get("phone", ""),
            email=lead_data.get("email"),
            note=lead_data.get("note"),
            source=lead_data.get("source", "manual"),
            imported_by_sale_id=imported_by_sale_id,
            assigned_sale_id=assigned,
            status=status,
            registered=registered,
        )
        # Lưu loại sản phẩm (nếu nguồn cung cấp) để Đội Sale AI ưu tiên khớp chuyên môn.
        if lead_data.get("product_type"):
            lead["product_type"] = str(lead_data["product_type"]).strip()
        data["leads"].append(lead)
        _save_leads(data)
        lead_id = lead["id"]
    # HOOK (ngoài lock): tự động gán 1 sale AI cho khách MỚI. An toàn — roster trống
    # / lỗi bất kỳ thì bỏ qua, KHÔNG vỡ luồng tạo lead cũ. Tính năng cộng thêm.
    _auto_assign_ai_salesman(lead_id, lead_data.get("product_type"))
    refreshed = get_lead(lead_id)
    return refreshed if refreshed is not None else public_view(lead)


def bulk_import_leads(
    leads_data: list[dict], sale_id: str, skip_duplicates: bool = True
) -> dict:
    """Import nhiều lead từ danh bạ.

    Trả {imported: int, skipped: int, duplicates: [{name, phone}]}.
    Dedupe theo SĐT chuẩn hoá hoặc email (trong store + trong chính batch).
    """
    imported = 0
    skipped = 0
    duplicates: list[dict] = []
    with _LOCK:
        data = _load_leads()
        leads = data["leads"]
        for raw in leads_data:
            phone = raw.get("phone", "")
            email = raw.get("email")
            dupe = _find_dupe(leads, phone, email)
            if dupe is not None:
                if skip_duplicates:
                    skipped += 1
                    duplicates.append(
                        {"name": raw.get("name", ""), "phone": phone}
                    )
                    continue
            lead = _new_lead(
                name=raw.get("name", ""),
                phone=phone,
                email=email,
                note=raw.get("note"),
                source=raw.get("source", "imported"),
                imported_by_sale_id=sale_id,
                assigned_sale_id=sale_id,
            )
            leads.append(lead)
            imported += 1
        _save_leads(data)
    return {"imported": imported, "skipped": skipped, "duplicates": duplicates}


def import_customers(
    leads_data: list[dict],
    *,
    source: str = "imported",
    imported_by_sale_id: Optional[str] = None,
    assigned_sale_id: Optional[str] = None,
    auto_assign: bool = False,
    skip_duplicates: bool = True,
    default_status: str = "cold",
    auto_care: bool = True,
) -> dict:
    """Import khách đa nguồn (Google Sheet / file). Tổng quát hơn bulk_import_leads.

    - Dedupe theo SĐT chuẩn hoá / email (trong store + trong batch).
    - `source` mặc định cho cả batch; mỗi dòng có thể tự ghi đè qua key 'row_source'.
    - `assigned_sale_id`: gán cứng cho 1 sale. Nếu None và `auto_assign` → chia
      vòng tròn (round-robin) cho các sale đang hoạt động.
    - `auto_care`: đánh dấu lead vào hàng đợi chăm sóc AI (cờ trên lead) — Phần B
      (AI scoring + insight) sẽ dùng created_ids / cờ này để chấm điểm.

    Trả {imported, skipped, errors, duplicates, created_ids}.
    """
    imported = 0
    skipped = 0
    errors: list[dict] = []
    duplicates: list[dict] = []
    created_ids: list[str] = []

    rr_pool: list[str] = []
    if auto_assign and assigned_sale_id is None:
        from app.core import user_store

        rr_pool = [s["id"] for s in user_store.list_active_sales()]
    rr_index = 0

    with _LOCK:
        data = _load_leads()
        leads = data["leads"]
        for raw in leads_data:
            name = (raw.get("name") or "").strip()
            phone = (raw.get("phone") or "").strip()
            email = raw.get("email")
            if not phone and not (email or "").strip():
                errors.append({"name": name, "reason": "Thiếu cả SĐT lẫn email"})
                continue
            dupe = _find_dupe(leads, phone, email)
            if dupe is not None:
                if skip_duplicates:
                    skipped += 1
                    duplicates.append({"name": name, "phone": phone})
                    continue
            assigned = assigned_sale_id
            if assigned is None and rr_pool:
                assigned = rr_pool[rr_index % len(rr_pool)]
                rr_index += 1
            lead = _new_lead(
                name=name,
                phone=phone,
                email=email,
                note=raw.get("note"),
                source=raw.get("row_source") or source,
                imported_by_sale_id=imported_by_sale_id,
                assigned_sale_id=assigned,
                status=default_status,
            )
            lead["auto_care"] = bool(auto_care)
            if raw.get("product_type"):
                lead["product_type"] = str(raw["product_type"]).strip()
            leads.append(lead)
            created_ids.append(lead["id"])
            imported += 1
        _save_leads(data)
    # HOOK (ngoài lock): tự động gán sale AI cho từng khách MỚI import. An toàn.
    for lid in created_ids:
        _auto_assign_ai_salesman(lid)
    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "duplicates": duplicates,
        "created_ids": created_ids,
    }


def get_lead(lead_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                return public_view(l)
    return None


def _matches_search(lead: dict, q: str) -> bool:
    q = q.lower()
    return (
        q in (lead.get("name") or "").lower()
        or q in (lead.get("phone") or "")
        or q in (lead.get("email") or "").lower()
    )


def list_leads_for_sale(
    sale_id: str, status: Optional[str] = None, search: Optional[str] = None
) -> list[dict]:
    """Danh sách lead của 1 sale (assigned_sale_id == sale_id)."""
    with _LOCK:
        data = _load_leads()
        rows = [l for l in data["leads"] if l.get("assigned_sale_id") == sale_id]
    if status:
        rows = [l for l in rows if l.get("status") == status]
    if search:
        rows = [l for l in rows if _matches_search(l, search)]
    rows.sort(key=lambda l: l.get("updated_at") or "", reverse=True)
    return [public_view(l) for l in rows]


def list_all_leads(
    *,
    status: Optional[str] = None,
    sale_id: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Danh sách toàn bộ lead (admin) — có lọc + phân trang."""
    with _LOCK:
        data = _load_leads()
        rows = list(data["leads"])
    if status:
        rows = [l for l in rows if l.get("status") == status]
    if sale_id:
        rows = [l for l in rows if l.get("assigned_sale_id") == sale_id]
    if source:
        rows = [l for l in rows if l.get("source") == source]
    if search:
        rows = [l for l in rows if _matches_search(l, search)]
    rows.sort(key=lambda l: l.get("updated_at") or "", reverse=True)
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [public_view(l) for l in page_rows],
    }


def find_dupe_excluding(
    lead_id: str, phone: Optional[str], email: Optional[str]
) -> Optional[dict]:
    """Tìm lead KHÁC (id != lead_id) trùng SĐT chuẩn hoá hoặc email.

    Dùng khi SỬA thông tin khách để tránh đụng SĐT/email của khách khác.
    Trả public_view của bản trùng (nếu có), None nếu không trùng.
    """
    nphone = _norm_phone(phone or "")
    nemail = (email or "").strip().lower() or None
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                continue
            if nphone and _norm_phone(l.get("phone", "")) == nphone:
                return public_view(l)
            if nemail and (l.get("email") or "") == nemail:
                return public_view(l)
    return None


def update_lead(lead_id: str, **fields) -> Optional[dict]:
    """Cập nhật field tuỳ ý của lead. Tự set updated_at + tính lại ai_score."""
    allowed = {
        "name", "phone", "email", "source", "status", "note", "assigned_sale_id",
        "imported_by_sale_id", "booking_count", "registered",
        "last_contact_at", "hot_marker_at", "effective_contact_count",
        "contact_count", "ai_salesman_id", "product_type",
    }
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                for k, v in fields.items():
                    if k in allowed and v is not None:
                        if k == "email":
                            l[k] = (str(v).strip().lower() or None)
                        else:
                            l[k] = v
                l["updated_at"] = _now()
                l["ai_score"] = compute_ai_score(l)
                _save_leads(data)
                return public_view(l)
    return None


def add_activity_log(
    lead_id: str,
    *,
    summary: str,
    by: Optional[str] = None,
    by_name: Optional[str] = None,
    kind: str = "update",
) -> Optional[dict]:
    """Ghi 1 mục "nhật ký hoạt động" trên hồ sơ (vd "đã cập nhật thông tin").

    Lưu vào `lead['activity_log']` — nguồn riêng để Hồ sơ 360° dựng mục timeline
    type='update' mà KHÔNG đụng contact_count (khác contact log). Trả entry đã ghi,
    None nếu lead không tồn tại.
    """
    now = _now()
    entry = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "summary": summary,
        "by": by,
        "by_name": by_name,
        "at": now,
    }
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                l.setdefault("activity_log", []).append(entry)
                _save_leads(data)
                return entry
    return None


def assign_lead(lead_id: str, sale_id: str, by_admin_id: Optional[str] = None) -> Optional[dict]:
    """Gán / chuyển lead cho 1 sale (admin reassign hoặc auto-distribute)."""
    return update_lead(lead_id, assigned_sale_id=sale_id)


def set_ai_salesman(lead_id: str, ai_salesman_id: Optional[str]) -> Optional[dict]:
    """Đặt (hoặc gỡ nếu None) sale AI phụ trách lead — KHÔNG đụng ai_score/status.

    Tách riêng update_lead vì update_lead bỏ qua giá trị None (không gỡ được). Cập
    nhật updated_at. Trả public_view của lead, None nếu không tìm thấy.
    """
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                l["ai_salesman_id"] = ai_salesman_id
                l["updated_at"] = _now()
                _save_leads(data)
                return public_view(l)
    return None


def list_leads_for_ai_salesman(
    ais_id: str,
    *,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Danh sách khách 1 sale AI đang phụ trách (ai_salesman_id == ais_id) — phân trang."""
    with _LOCK:
        rows = [l for l in _load_leads()["leads"] if l.get("ai_salesman_id") == ais_id]
    if status:
        rows = [l for l in rows if l.get("status") == status]
    if search:
        rows = [l for l in rows if _matches_search(l, search)]
    rows.sort(key=lambda l: l.get("updated_at") or "", reverse=True)
    total = len(rows)
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 200))
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [public_view(l) for l in page_rows],
    }


def soft_delete(lead_id: str) -> Optional[dict]:
    """Xoá mềm = set status 'lost' (KHÔNG hard-delete)."""
    return update_lead(lead_id, status="lost")


def mark_as_hot(lead_id: str) -> Optional[dict]:
    """Đánh dấu lead HOT + ghi mốc hot_marker_at."""
    return update_lead(lead_id, status="hot", hot_marker_at=_now())


def set_pipeline_stage(
    lead_id: str, stage: str, by: Optional[str] = None, note: Optional[str] = None
) -> Optional[dict]:
    """Đặt GIAI ĐOẠN pipeline cho lead + ghi `stage_history` (cho timeline 360).

    Pipeline stage là lớp PHÁI SINH/cấu hình nằm TRÊN `status` lõi (cold/warm/hot/
    customer/lost) — không phá enum status hiện có. Mỗi lần đổi ghi 1 bản ghi
    {from, to, at, by, note} vào `stage_history` để Hồ sơ 360° dựng timeline.
    Validation giá trị `stage` do tầng pipeline xử lý trước khi gọi.
    Trả public_view của lead đã cập nhật, None nếu không tìm thấy.
    """
    now = _now()
    with _LOCK:
        data = _load_leads()
        for l in data["leads"]:
            if l["id"] == lead_id:
                old = l.get("pipeline_stage")
                l["pipeline_stage"] = stage
                hist = l.setdefault("stage_history", [])
                hist.append(
                    {"from": old, "to": stage, "at": now, "by": by, "note": note}
                )
                l["updated_at"] = now
                _save_leads(data)
                return public_view(l)
    return None


def find_by_contact(phone: Optional[str], email: Optional[str]) -> Optional[dict]:
    """Tìm lead theo SĐT chuẩn hoá hoặc email (cho webhook lead-engaged)."""
    with _LOCK:
        data = _load_leads()
        dupe = _find_dupe(data["leads"], phone or "", email)
        return public_view(dupe) if dupe else None


# ---------------------------------------------------------------------------
# Contact logs
# ---------------------------------------------------------------------------

def add_contact_log(
    lead_id: str,
    sale_id: str,
    channel: str,
    note: str,
    outcome: str,
    *,
    created_by_name: Optional[str] = None,
    extra: Optional[dict] = None,
) -> Optional[dict]:
    """Ghi 1 contact log + cập nhật last_contact_at / contact_count của lead.

    `created_by_name` (tuỳ chọn) là tên người đăng — DENORMALIZE để Hồ sơ 360°
    dựng "dòng chăm sóc" kiểu mạng xã hội (hiện tên người + thời gian) mà không
    phải join user_store ở tầng timeline thuần.

    `extra` (tuỳ chọn) là các field bổ sung gắn vào log — dùng cho cuộc gọi tổng
    đài (call_id, call_status, duration, recording_url, direction...). KHÔNG cho
    `extra` ghi đè các khoá lõi (id/lead_id/...). Trả contact log dict, None nếu
    lead không tồn tại.
    """
    now = _now()
    log = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "sale_id": sale_id,
        "channel": channel,
        "note": note,
        "outcome": outcome,
        "created_by_name": created_by_name,
        "created_at": now,
    }
    if extra:
        for k, v in extra.items():
            log.setdefault(k, v)  # không ghi đè khoá lõi
    with _LOCK:
        leads = _load_leads()
        target = None
        for l in leads["leads"]:
            if l["id"] == lead_id:
                target = l
                break
        if target is None:
            return None
        target["contact_count"] = target.get("contact_count", 0) + 1
        if outcome != "no_answer":
            target["effective_contact_count"] = (
                target.get("effective_contact_count", 0) + 1
            )
        target["last_contact_at"] = now
        # outcome "booked" coi như nâng nhiệt; "interested" → warm tối thiểu.
        if outcome == "interested" and target.get("status") == "cold":
            target["status"] = "warm"
        target["updated_at"] = now
        target["ai_score"] = compute_ai_score(target)
        _save_leads(leads)

        logs = _load_logs()
        logs["logs"].append(log)
        _save_logs(logs)
    return log


def list_contact_logs(lead_id: str) -> list[dict]:
    with _LOCK:
        logs = _load_logs()
        rows = [x for x in logs["logs"] if x["lead_id"] == lead_id]
    rows.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return rows


def get_contact_log(log_id: str) -> Optional[dict]:
    """Đọc 1 contact log theo id. None nếu không có."""
    with _LOCK:
        logs = _load_logs()
        for x in logs["logs"]:
            if x.get("id") == log_id:
                return dict(x)
    return None


def update_contact_log(log_id: str, **fields) -> Optional[dict]:
    """Cập nhật field tuỳ ý của 1 contact log (trạng thái cuộc gọi / ghi âm...).

    Dùng cho tổng đài: cập nhật call_id / call_status / duration / recording_url /
    outcome khi nhận webhook sự kiện cuộc gọi. BỎ QUA giá trị None (không ghi đè
    dữ liệu cũ bằng None). Trả log đã cập nhật, None nếu không tìm thấy.
    """
    with _LOCK:
        logs = _load_logs()
        for x in logs["logs"]:
            if x.get("id") == log_id:
                for k, v in fields.items():
                    if v is not None:
                        x[k] = v
                _save_logs(logs)
                return dict(x)
    return None


def update_contact_log_by_call_id(call_id: str, **fields) -> Optional[dict]:
    """Như update_contact_log nhưng tìm theo `call_id` (sự kiện ghi âm chỉ có call_id).

    Stringee gửi sự kiện ghi âm (type=recording) chỉ kèm call_id — khớp log theo
    call_id đã lưu trước đó. Trả log đã cập nhật, None nếu chưa khớp được.
    """
    if not call_id:
        return None
    with _LOCK:
        logs = _load_logs()
        for x in logs["logs"]:
            if x.get("call_id") == call_id:
                for k, v in fields.items():
                    if v is not None:
                        x[k] = v
                _save_logs(logs)
                return dict(x)
    return None


# ---------------------------------------------------------------------------
# Hot lead auto-distribution
# ---------------------------------------------------------------------------

def auto_distribute_hot_lead(lead_id: str) -> Optional[str]:
    """Phân bổ 1 hot lead cho sale top theo eligibility_score.

    Trả sale_id được gán, hoặc None nếu không có sale khả dụng. Tăng
    hot_leads_received của sale đó trong task hôm nay.
    """
    from app.core import sale_task_store, user_store

    sales = user_store.list_active_sales()
    if not sales:
        return None
    ranking = sale_task_store.rank_sales_by_eligibility(sales)
    if not ranking:
        return None
    top_sale_id = ranking[0]["sale_id"]
    assign_lead(lead_id, top_sale_id)
    sale_task_store.increment_metric(top_sale_id, "hot_leads_received", 1)
    return top_sale_id


def distribute_pending_hot_leads() -> dict:
    """Phân bổ mọi hot lead chưa có sale phụ trách. Trả {distributed, leads}."""
    with _LOCK:
        data = _load_leads()
        pending = [
            l["id"]
            for l in data["leads"]
            if l.get("status") == "hot" and not l.get("assigned_sale_id")
        ]
    assigned = []
    for lid in pending:
        sale_id = auto_distribute_hot_lead(lid)
        if sale_id:
            assigned.append({"lead_id": lid, "sale_id": sale_id})
    return {"distributed": len(assigned), "leads": assigned}


# ---------------------------------------------------------------------------
# Stats (admin dashboard)
# ---------------------------------------------------------------------------

def compute_stats() -> dict:
    with _LOCK:
        data = _load_leads()
        rows = list(data["leads"])
    total = len(rows)
    by_status: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for l in rows:
        by_status[l.get("status", "cold")] = by_status.get(l.get("status", "cold"), 0) + 1
        by_source[l.get("source", "manual")] = by_source.get(l.get("source", "manual"), 0) + 1
    customers = by_status.get("customer", 0)
    lost = by_status.get("lost", 0)
    active = total - lost
    conversion = round((customers / active) * 100, 1) if active > 0 else 0.0
    top_sources = sorted(
        ({"source": k, "count": v} for k, v in by_source.items()),
        key=lambda x: x["count"],
        reverse=True,
    )
    return {
        "total_leads": total,
        "hot_leads": by_status.get("hot", 0),
        "customers": customers,
        "cold_leads": by_status.get("cold", 0),
        "warm_leads": by_status.get("warm", 0),
        "lost_leads": lost,
        "conversion_rate": conversion,
        "top_sources": top_sources,
    }


def clear() -> None:
    """Xoá toàn bộ lead + contact log — chỉ dùng trong test."""
    with _LOCK:
        _save_leads({"leads": []})
        _save_logs({"logs": []})
