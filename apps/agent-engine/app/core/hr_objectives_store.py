"""HR — mục tiêu / KPI theo nhân sự + kỳ.

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/user_store.py. File: data/_runtime/hr_objectives.json:
  {
    "objectives": [
      {"id": "...", "staff_id": "...", "period": "2026-06",
       "metric": "revenue", "target": 5000000000,
       "actual_override": null, "note": "...",
       "created_at": "ISO", "updated_at": "ISO"}
    ]
  }

"actual" (thực tế) được TÍNH TỰ ĐỘNG từ dữ liệu sẵn có khi đọc:
  • revenue / deals   ← commission_store (tổng deal_amount / số deal_id của sale)
  • commission        ← commission_store (tổng tier amount mà nhân sự nhận)
  • leads / contacts / meetings ← sale_task_store (cộng dồn theo kỳ)
Admin có thể nhập actual_override để ghi đè (dữ liệu ngoài hệ thống). target nhập
thủ công.
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

_VALID_METRICS = {
    "revenue", "commission", "deals", "leads", "contacts", "meetings",
}

# Kỳ dạng tháng "YYYY-MM" → lọc dữ liệu theo tháng. Khác định dạng → tính lũy kế.
_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _file_path() -> Path:
    p = Path(settings.hr_objectives_file)
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


def _ensure_file() -> Path:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"objectives": []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure_file()
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _save(data: dict) -> None:
    _write(_ensure_file(), data)


# ---------------------------------------------------------------------------
# Tính thực tế (actual) tự động từ dữ liệu sẵn có
# ---------------------------------------------------------------------------

def _commission_actuals(staff_id: str, period: Optional[str]) -> dict:
    """Trả {revenue, commission, deals} của 1 nhân sự từ commission_store.

    revenue/deals: tính theo bản ghi mà nhân sự là sale frontline (rec.sale_id).
    commission: tổng amount ở mọi bậc (tier.user_id) mà nhân sự đứng tên nhận.
    Lọc theo tháng (saved_at) nếu period dạng YYYY-MM.
    """
    try:
        from app.core import commission_store

        records = commission_store.list_records(limit=5000)
    except Exception:  # noqa: BLE001 — thiếu dữ liệu → 0
        return {"revenue": 0.0, "commission": 0.0, "deals": 0.0}

    by_month = _MONTH_RE.match(period or "")
    revenue = 0.0
    commission = 0.0
    deal_ids: set = set()
    for rec in records:
        if by_month:
            saved = str(rec.get("saved_at") or "")
            if not saved.startswith(period):  # type: ignore[arg-type]
                continue
        if rec.get("sale_id") == staff_id:
            revenue += float(rec.get("deal_amount", 0) or 0)
            if rec.get("deal_id"):
                deal_ids.add(rec.get("deal_id"))
        for tier in rec.get("tiers", []):
            if tier.get("user_id") == staff_id:
                commission += float(tier.get("amount", 0) or 0)
    return {
        "revenue": revenue,
        "commission": commission,
        "deals": float(len(deal_ids)),
    }


def _task_actuals(staff_id: str, period: Optional[str]) -> dict:
    """Trả {leads, contacts, meetings} của 1 nhân sự từ sale_task_store."""
    try:
        from app.core import sale_task_store

        tasks = sale_task_store.list_tasks(sale_id=staff_id)
    except Exception:  # noqa: BLE001
        return {"leads": 0.0, "contacts": 0.0, "meetings": 0.0}

    by_month = _MONTH_RE.match(period or "")
    leads = contacts = meetings = 0
    for t in tasks:
        if by_month and not str(t.get("date") or "").startswith(period):  # type: ignore[arg-type]
            continue
        leads += int(t.get("new_leads_added", 0) or 0)
        contacts += int(t.get("contacts_made", 0) or 0)
        meetings += int(t.get("meetings_attended", 0) or 0)
    return {
        "leads": float(leads),
        "contacts": float(contacts),
        "meetings": float(meetings),
    }


def compute_actual(staff_id: str, metric: str, period: Optional[str] = None) -> float:
    """Tính thực tế 1 chỉ số của nhân sự theo kỳ (tự động từ dữ liệu sẵn có)."""
    if metric in ("revenue", "commission", "deals"):
        return _commission_actuals(staff_id, period).get(metric, 0.0)
    if metric in ("leads", "contacts", "meetings"):
        return _task_actuals(staff_id, period).get(metric, 0.0)
    return 0.0


def all_actuals(staff_id: str, period: Optional[str] = None) -> dict:
    """Gom toàn bộ chỉ số thực tế của 1 nhân sự (dùng cho báo cáo AI)."""
    out = _commission_actuals(staff_id, period)
    out.update(_task_actuals(staff_id, period))
    return out


# ---------------------------------------------------------------------------
# Dựng view (kèm actual + % hoàn thành)
# ---------------------------------------------------------------------------

def _completion(target: float, actual: float) -> float:
    if target <= 0:
        return 0.0
    return round(actual / target * 100, 1)


def _view(obj: dict, staff_name: Optional[str] = None) -> dict:
    auto = compute_actual(obj["staff_id"], obj["metric"], obj.get("period"))
    override = obj.get("actual_override")
    actual = float(override) if override is not None else auto
    return {
        "id": obj["id"],
        "staff_id": obj["staff_id"],
        "staff_name": staff_name,
        "period": obj["period"],
        "metric": obj["metric"],
        "target": float(obj.get("target", 0) or 0),
        "actual": actual,
        "actual_auto": auto,
        "actual_override": override,
        "completion_pct": _completion(float(obj.get("target", 0) or 0), actual),
        "note": obj.get("note"),
        "created_at": obj["created_at"],
        "updated_at": obj["updated_at"],
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def list_objectives(
    staff_id: Optional[str] = None, name_map: Optional[dict] = None
) -> list[dict]:
    """Liệt kê objectives (kèm actual + %). Lọc theo staff_id nếu truyền."""
    name_map = name_map or {}
    with _LOCK:
        data = _load()
        rows = list(data["objectives"])
    out = []
    for o in rows:
        if staff_id is not None and o.get("staff_id") != staff_id:
            continue
        out.append(_view(o, name_map.get(o.get("staff_id"))))
    out.sort(key=lambda x: (x["staff_id"], x["period"], x["metric"]))
    return out


def get_objective(obj_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for o in data["objectives"]:
            if o["id"] == obj_id:
                return _view(o)
    return None


def create_objective(
    *, staff_id: str, period: str, metric: str, target: float, note: Optional[str] = None
) -> dict:
    if metric not in _VALID_METRICS:
        raise ValueError(f"Chỉ số KPI không hợp lệ: {metric}")
    now = _now()
    obj = {
        "id": str(uuid.uuid4()),
        "staff_id": staff_id,
        "period": period.strip(),
        "metric": metric,
        "target": float(target),
        "actual_override": None,
        "note": (note or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    with _LOCK:
        data = _load()
        data["objectives"].append(obj)
        _save(data)
    return _view(obj)


def update_objective(
    obj_id: str,
    *,
    period: Optional[str] = None,
    metric: Optional[str] = None,
    target: Optional[float] = None,
    actual_override: Optional[float] = None,
    note: Optional[str] = None,
    clear_override: bool = False,
) -> Optional[dict]:
    if metric is not None and metric not in _VALID_METRICS:
        raise ValueError(f"Chỉ số KPI không hợp lệ: {metric}")
    with _LOCK:
        data = _load()
        for o in data["objectives"]:
            if o["id"] == obj_id:
                if period is not None and period.strip():
                    o["period"] = period.strip()
                if metric is not None:
                    o["metric"] = metric
                if target is not None:
                    o["target"] = float(target)
                if clear_override:
                    o["actual_override"] = None
                elif actual_override is not None:
                    o["actual_override"] = float(actual_override)
                if note is not None:
                    o["note"] = note.strip() or None
                o["updated_at"] = _now()
                _save(data)
                return _view(o)
    return None


def delete_objective(obj_id: str) -> bool:
    with _LOCK:
        data = _load()
        before = len(data["objectives"])
        data["objectives"] = [o for o in data["objectives"] if o["id"] != obj_id]
        changed = len(data["objectives"]) != before
        if changed:
            _save(data)
    return changed


def clear() -> None:
    """Xoá toàn bộ — chỉ dùng trong test."""
    with _LOCK:
        _save({"objectives": []})
