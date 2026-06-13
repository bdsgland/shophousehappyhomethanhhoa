"""Hàng đợi hành động chăm sóc của "Đội Sale AI" (Auto-Care queue).

Để đội sale AI TỰ ĐỘNG CHẠY: chu kỳ quét (ai_care_engine) sinh các mục hành động
NHÁP vào hàng đợi này; admin DUYỆT / BỎ QUA trên giao diện. Mỗi mục là 1 đề xuất
chăm sóc 1 khách kèm tin nhắn NHÁP — KHÔNG bao giờ tự gửi cho khách (trừ khi cờ
ai_care_auto_send bật + có kênh kết nối; mặc định TẮT).

File: data/_runtime/ai_care_queue.json → {"items": [ {item} ]}

Cùng convention store JSON (RLock, atomic write, resolve path robust, audit best-
effort) với ai_salesman_store / lead_store.

MỖI MỤC:
  id            "care_xxxxxxxx"
  lead_id / lead_name
  ai_salesman_id / ai_salesman_name
  action_type   "nurture" | "reengage" | "hot_follow_up" | ...
  channel       "zalo" | "sms" | "email"
  draft         nội dung tin NHÁP
  suggested_time thời điểm gửi gợi ý (text)
  summary       tóm tắt tình hình khách (từ bộ não AI)
  potential_score / readiness / reason
  matched_units danh sách căn đề xuất (rút gọn)
  status        "pending" | "approved" | "skipped" | "sent"
  engine / model  nguồn sinh (claude-direct/heuristic + model)
  due_at        hạn nên xử lý (ISO)
  created_at / updated_at
  approved_by / approved_at / skipped_by / sent_at (khi có)

AN TOÀN: store chỉ lưu NHÁP nội bộ. clear() chỉ dùng test.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.settings import settings

log = logging.getLogger("ai_care_queue_store")

_LOCK = threading.RLock()

_ACTIVE = ("pending", "approved")  # các trạng thái còn "sống" (chưa đóng)


# ---------------------------------------------------------------------------
# Path / IO helpers (cùng pattern ai_salesman_store)
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
    path = _resolve(settings.ai_care_queue_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"items": []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"items": []}
    data.setdefault("items", [])
    return data


def _save(data: dict) -> None:
    path = _ensure()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _audit(event: str, payload: dict, *, status: str = "ok", detail: str = "") -> None:
    try:
        from app.core import audit_store

        audit_store.record(f"ai_care.{event}", payload, status=status, detail=detail)
    except Exception as exc:  # noqa: BLE001
        log.warning("audit ai_care.%s lỗi: %s", event, exc)


# ---------------------------------------------------------------------------
# Tạo mục
# ---------------------------------------------------------------------------
def has_active_for_lead(lead_id: str) -> bool:
    """True nếu khách đã có mục pending/approved trong hàng đợi (tránh tạo trùng)."""
    with _LOCK:
        for it in _load()["items"]:
            if it.get("lead_id") == lead_id and it.get("status") in _ACTIVE:
                return True
    return False


def create_item(
    *,
    lead_id: str,
    lead_name: Optional[str] = None,
    ai_salesman_id: Optional[str] = None,
    ai_salesman_name: Optional[str] = None,
    action_type: str = "nurture",
    channel: str = "zalo",
    draft: str = "",
    suggested_time: str = "",
    summary: str = "",
    potential_score: Optional[int] = None,
    readiness: Optional[int] = None,
    reason: str = "",
    matched_units: Optional[List[Dict[str, Any]]] = None,
    engine: Optional[str] = None,
    model: Optional[str] = None,
    due_at: Optional[str] = None,
    requested_by: Optional[str] = None,
) -> dict:
    """Thêm 1 mục hành động NHÁP vào hàng đợi (status=pending). Rotate khi vượt keep."""
    now = _now()
    item = {
        "id": f"care_{uuid.uuid4().hex[:10]}",
        "lead_id": lead_id,
        "lead_name": lead_name,
        "ai_salesman_id": ai_salesman_id,
        "ai_salesman_name": ai_salesman_name,
        "action_type": action_type,
        "channel": channel,
        "draft": draft,
        "suggested_time": suggested_time,
        "summary": summary,
        "potential_score": potential_score,
        "readiness": readiness,
        "reason": reason,
        "matched_units": [
            {
                "id": u.get("id"),
                "loai": u.get("loai"),
                "phan_khu": u.get("phan_khu"),
                "gia": u.get("gia"),
                "match_percent": u.get("match_percent"),
            }
            for u in (matched_units or [])[:3]
        ],
        "status": "pending",
        "engine": engine,
        "model": model,
        "due_at": due_at or now,
        "created_at": now,
        "updated_at": now,
        "requires_confirmation": True,
        "auto_sent": False,
    }
    with _LOCK:
        data = _load()
        data["items"].append(item)
        # Rotate: giữ N mục mới nhất (theo created_at) để chặn phình file.
        keep = max(50, int(settings.ai_care_queue_keep))
        if len(data["items"]) > keep:
            data["items"].sort(key=lambda x: x.get("created_at") or "")
            data["items"] = data["items"][-keep:]
        _save(data)
    _audit("create", {"id": item["id"], "lead_id": lead_id, "channel": channel,
                      "requested_by": requested_by},
           detail=f"care draft cho lead={lead_id}")
    return item


# ---------------------------------------------------------------------------
# List / get / stats
# ---------------------------------------------------------------------------
def list_items(
    *,
    status: Optional[str] = None,
    ai_salesman_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Danh sách mục hàng đợi có lọc + phân trang (mới nhất TRƯỚC)."""
    with _LOCK:
        rows = list(_load()["items"])
    if status:
        rows = [r for r in rows if r.get("status") == status]
    if ai_salesman_id:
        rows = [r for r in rows if r.get("ai_salesman_id") == ai_salesman_id]
    if lead_id:
        rows = [r for r in rows if r.get("lead_id") == lead_id]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    total = len(rows)
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 200))
    start = (page - 1) * page_size
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": rows[start : start + page_size],
    }


def get(item_id: str) -> Optional[dict]:
    with _LOCK:
        for it in _load()["items"]:
            if it.get("id") == item_id:
                return dict(it)
    return None


def compute_stats() -> dict:
    """Thống kê hàng đợi cho dashboard (đếm theo trạng thái)."""
    with _LOCK:
        rows = list(_load()["items"])
    by_status: Dict[str, int] = {}
    for r in rows:
        s = r.get("status") or "pending"
        by_status[s] = by_status.get(s, 0) + 1
    return {
        "total": len(rows),
        "pending": by_status.get("pending", 0),
        "approved": by_status.get("approved", 0),
        "skipped": by_status.get("skipped", 0),
        "sent": by_status.get("sent", 0),
        "by_status": by_status,
    }


# ---------------------------------------------------------------------------
# Đổi trạng thái — approve / skip / mark_sent
# ---------------------------------------------------------------------------
def _set_status(
    item_id: str, new_status: str, *, by: Optional[str] = None, extra: Optional[dict] = None
) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for it in data["items"]:
            if it.get("id") == item_id:
                it["status"] = new_status
                it["updated_at"] = _now()
                if extra:
                    it.update(extra)
                _save(data)
                return dict(it)
    return None


def approve(item_id: str, *, by: Optional[str] = None) -> Optional[dict]:
    """Duyệt 1 mục → status=approved.

    AN TOÀN: KHÔNG tự gửi tin cho khách. Chỉ khi settings.ai_care_auto_send=True
    VÀ có kênh gửi kết nối thì hệ thống mới gửi (hiện chưa nối kênh → vẫn chỉ
    đánh dấu approved). Người thật tự gửi tin sau khi duyệt.
    """
    item = _set_status(item_id, "approved", by=by,
                        extra={"approved_by": by, "approved_at": _now()})
    if item:
        _audit("approve", {"id": item_id, "lead_id": item.get("lead_id"), "by": by},
               detail=f"approve care {item_id}")
    return item


def skip(item_id: str, *, by: Optional[str] = None) -> Optional[dict]:
    """Bỏ qua 1 mục → status=skipped (không gửi, không xoá)."""
    item = _set_status(item_id, "skipped", by=by,
                       extra={"skipped_by": by, "skipped_at": _now()})
    if item:
        _audit("skip", {"id": item_id, "lead_id": item.get("lead_id"), "by": by},
               detail=f"skip care {item_id}")
    return item


def mark_sent(item_id: str, *, by: Optional[str] = None) -> Optional[dict]:
    """Đánh dấu đã gửi (do người thật gửi tay, hoặc kênh tự động trong tương lai)."""
    item = _set_status(item_id, "sent", by=by,
                       extra={"sent_by": by, "sent_at": _now(), "auto_sent": False})
    if item:
        _audit("mark_sent", {"id": item_id, "lead_id": item.get("lead_id"), "by": by},
               detail=f"mark sent care {item_id}")
    return item


def clear() -> None:
    """Xoá sạch hàng đợi — CHỈ dùng trong test."""
    with _LOCK:
        _save({"items": []})
