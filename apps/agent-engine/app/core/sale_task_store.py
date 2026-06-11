"""Sale daily-task store — KPI hàng ngày + hiệu suất tuần + xếp hạng nhận hot lead.

Format file (data/_runtime/sale_tasks.json):
  {
    "tasks": [
      {"sale_id": "...", "date": "2026-06-08",
       "new_leads_added": 0, "contacts_made": 0, "meetings_attended": 0,
       "hot_leads_received": 0, "hot_leads_closed": 0, "score": 0,
       "target_new_leads": 10, "target_contacts": 20, "target_meetings": 1,
       "checked_in": false}
    ]
  }

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/user_store.py & booking_store.py. Sau migrate PostgreSQL.

`meetings_attended` được tính lại từ booking_store lúc đọc (số booking sale đã
hoàn thành trong ngày) để luôn chính xác mà không phải sửa luồng bookings.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.Lock()

# Trọng số tính score ngày: lead 40%, contact 30%, meeting 30%.
_W_LEADS = 0.4
_W_CONTACTS = 0.3
_W_MEETINGS = 0.3

_METRICS = {
    "new_leads_added",
    "contacts_made",
    "meetings_attended",
    "hot_leads_received",
    "hot_leads_closed",
}


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới sale_tasks.json (neo theo agent-engine / DATA_DIR)."""
    p = Path(settings.sale_tasks_file)
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
        path.write_text(json.dumps({"tasks": []}, ensure_ascii=False, indent=2))
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


def _today_str() -> str:
    return datetime.utcnow().date().isoformat()


def _new_task(sale_id: str, day: str) -> dict:
    return {
        "sale_id": sale_id,
        "date": day,
        "new_leads_added": 0,
        "contacts_made": 0,
        "meetings_attended": 0,
        "hot_leads_received": 0,
        "hot_leads_closed": 0,
        "score": 0,
        "target_new_leads": 10,
        "target_contacts": 20,
        "target_meetings": 1,
        "checked_in": False,
    }


def compute_score(task: dict) -> int:
    """Tính % hoàn thành target × trọng số (lead 40%, contact 30%, meeting 30%)."""
    def pct(done: int, target: int) -> float:
        if target <= 0:
            return 1.0
        return min(1.0, done / target)

    s = (
        _W_LEADS * pct(task.get("new_leads_added", 0), task.get("target_new_leads", 10))
        + _W_CONTACTS * pct(task.get("contacts_made", 0), task.get("target_contacts", 20))
        + _W_MEETINGS * pct(task.get("meetings_attended", 0), task.get("target_meetings", 1))
    )
    return round(s * 100)


def _count_completed_meetings(sale_id: str, day: str) -> int:
    """Số booking sale đã hoàn thành (status=completed) trong ngày `day` (UTC)."""
    try:
        from app.core import booking_store
    except Exception:  # noqa: BLE001
        return 0
    count = 0
    for b in booking_store.list_all():
        if b.get("sale_id") != sale_id or b.get("status") != "completed":
            continue
        ts = (b.get("updated_at") or "").replace("Z", "")
        if ts[:10] == day:
            count += 1
    return count


def _hydrate(task: dict) -> dict:
    """Tính lại meetings_attended (từ bookings) + score trước khi trả ra."""
    task["meetings_attended"] = _count_completed_meetings(task["sale_id"], task["date"])
    task["score"] = compute_score(task)
    return task


def get_or_create_today_task(sale_id: str) -> dict:
    """Lấy task hôm nay của sale (tạo mới nếu chưa có). Đã hydrate score/meetings."""
    day = _today_str()
    with _LOCK:
        data = _load()
        for t in data["tasks"]:
            if t["sale_id"] == sale_id and t["date"] == day:
                return _hydrate(t)
        task = _new_task(sale_id, day)
        data["tasks"].append(task)
        _save(data)
        return _hydrate(task)


def increment_metric(sale_id: str, metric: str, by: int = 1) -> dict:
    """Tăng 1 chỉ số của task hôm nay (gọi sau mỗi action). Trả task đã hydrate."""
    if metric not in _METRICS:
        raise ValueError(f"Chỉ số không hợp lệ: {metric}")
    day = _today_str()
    with _LOCK:
        data = _load()
        target = None
        for t in data["tasks"]:
            if t["sale_id"] == sale_id and t["date"] == day:
                target = t
                break
        if target is None:
            target = _new_task(sale_id, day)
            data["tasks"].append(target)
        target[metric] = target.get(metric, 0) + by
        target["score"] = compute_score(target)
        _save(data)
        return _hydrate(target)


def check_in_today(sale_id: str) -> dict:
    """Sale check-in hoàn thành ngày. Idempotent."""
    day = _today_str()
    with _LOCK:
        data = _load()
        target = None
        for t in data["tasks"]:
            if t["sale_id"] == sale_id and t["date"] == day:
                target = t
                break
        if target is None:
            target = _new_task(sale_id, day)
            data["tasks"].append(target)
        target["checked_in"] = True
        target["score"] = compute_score(target)
        _save(data)
        return _hydrate(target)


def _week_start(d: date) -> date:
    """Thứ Hai của tuần chứa `d`."""
    return d - timedelta(days=d.weekday())


def _tasks_in_week(tasks: list[dict], sale_id: str, week_start: date) -> list[dict]:
    week_end = week_start + timedelta(days=6)
    out = []
    for t in tasks:
        if t["sale_id"] != sale_id:
            continue
        try:
            td = date.fromisoformat(t["date"])
        except ValueError:
            continue
        if week_start <= td <= week_end:
            out.append(_hydrate(dict(t)))
    return out


def get_weekly_performance(sale_id: str, sale_name: str = "") -> dict:
    """Hiệu suất tuần hiện tại của 1 sale (chưa xếp hạng — rank=0)."""
    ws = _week_start(datetime.utcnow().date())
    with _LOCK:
        data = _load()
        week = _tasks_in_week(data["tasks"], sale_id, ws)
    return _build_performance(sale_id, sale_name, ws, week, rank=0)


def _build_performance(
    sale_id: str, sale_name: str, ws: date, week: list[dict], rank: int
) -> dict:
    if week:
        avg = sum(t["score"] for t in week) / len(week)
    else:
        avg = 0.0
    total_leads = sum(t.get("new_leads_added", 0) for t in week)
    total_hot = sum(t.get("hot_leads_received", 0) for t in week)
    total_closed = sum(t.get("hot_leads_closed", 0) for t in week)
    # Eligibility: ưu tiên sale điểm cao + có hoạt động (tránh sale "ngủ").
    # avg score (0-100) là chính; cộng nhẹ cho việc đã check-in/đóng deal.
    eligibility = round(avg + min(total_closed * 2.0, 10.0), 2)
    return {
        "sale_id": sale_id,
        "sale_name": sale_name,
        "week_start": ws.isoformat(),
        "avg_daily_score": round(avg, 2),
        "total_leads_added": total_leads,
        "total_hot_leads_received": total_hot,
        "total_deals_closed": total_closed,
        "eligibility_score": eligibility,
        "rank": rank,
    }


def rank_sales_by_eligibility(sales: Optional[list[dict]] = None) -> list[dict]:
    """Xếp hạng sale theo eligibility_score (giảm dần) cho tuần hiện tại.

    `sales` là list user dict (role=sale). Nếu None → tự lấy active sales.
    Trả list SalePerformance dict đã gán `rank` (1-based).
    """
    if sales is None:
        from app.core import user_store

        sales = user_store.list_active_sales()
    ws = _week_start(datetime.utcnow().date())
    with _LOCK:
        data = _load()
        tasks = list(data["tasks"])
    perfs = []
    for s in sales:
        week = _tasks_in_week(tasks, s["id"], ws)
        perfs.append(
            _build_performance(s["id"], s.get("full_name", ""), ws, week, rank=0)
        )
    perfs.sort(key=lambda p: p["eligibility_score"], reverse=True)
    for i, p in enumerate(perfs, start=1):
        p["rank"] = i
    return perfs


def list_tasks(sale_id: Optional[str] = None) -> list[dict]:
    """Liệt kê task (đã hydrate score/meetings). Lọc theo sale_id nếu truyền.

    Dùng cho module HR tổng hợp KPI thực tế của nhân sự theo kỳ. Trả bản sao
    (dict copy) để caller không sửa nhầm store.
    """
    with _LOCK:
        data = _load()
        tasks = list(data["tasks"])
    out = []
    for t in tasks:
        if sale_id is not None and t.get("sale_id") != sale_id:
            continue
        out.append(_hydrate(dict(t)))
    return out


def clear() -> None:
    """Xoá toàn bộ task — chỉ dùng trong test."""
    with _LOCK:
        _save({"tasks": []})
