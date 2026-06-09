"""Match store — lịch sử yêu cầu Live Match (JSON, thread-safe atomic write).

Format file (data/_runtime/match_requests.json):
  {"matches": [ {MatchRequest dict}, ... ]}

Cùng convention store JSON (Lock + atomic .tmp rename + resolve path robust) với
app/core/user_store.py & sale_task_store.py. Sau migrate PostgreSQL ở Phase 2.

Record là dict thuần (không phải Pydantic) để ghi/đọc JSON gọn; tầng service +
schema chịu trách nhiệm validate. Timestamp lưu dạng ISO8601 + "Z" (UTC).
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.RLock()  # RLock: create() có thể gọi update() lồng nhau an toàn


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới match_requests.json (neo theo agent-engine / DATA_DIR)."""
    p = Path(settings.match_requests_file)
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
        path.write_text(json.dumps({"matches": []}, ensure_ascii=False, indent=2))
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


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def create(
    *, customer_id: str, customer_name: str, customer_email: str
) -> dict:
    """Tạo 1 match request mới ở trạng thái pending. Trả record."""
    record = {
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "sale_id": None,
        "sale_name": None,
        "status": "pending",
        "meet_link": None,
        "meet_event_id": None,
        "invited_sales": [],
        "declined_by": [],
        "invite_expires_at": None,
        "created_at": _now(),
        "accepted_at": None,
        "completed_at": None,
        "duration_seconds": None,
        "outcome": None,
        "outcome_note": None,
    }
    with _LOCK:
        data = _load()
        data["matches"].append(record)
        _save(data)
        return dict(record)


def get(match_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for m in data["matches"]:
            if m["id"] == match_id:
                return dict(m)
    return None


def update(match_id: str, **fields) -> Optional[dict]:
    """Cập nhật các field cho 1 match. Bỏ qua giá trị None (giữ nguyên cũ).

    Để xoá field (set về None) dùng update_force. Trả record mới hoặc None.
    """
    with _LOCK:
        data = _load()
        for m in data["matches"]:
            if m["id"] == match_id:
                for k, v in fields.items():
                    if v is not None:
                        m[k] = v
                _save(data)
                return dict(m)
    return None


def update_force(match_id: str, **fields) -> Optional[dict]:
    """Như update nhưng ghi cả giá trị None (dùng để clear invite_expires_at...)."""
    with _LOCK:
        data = _load()
        for m in data["matches"]:
            if m["id"] == match_id:
                m.update(fields)
                _save(data)
                return dict(m)
    return None


def list_all() -> list[dict]:
    with _LOCK:
        data = _load()
        return [dict(m) for m in data["matches"]]


def find_active_for_customer(customer_id: str) -> Optional[dict]:
    """Match còn 'sống' (chưa kết thúc) gần nhất của khách — tránh tạo trùng."""
    active = {"pending", "invited", "accepted", "live"}
    with _LOCK:
        data = _load()
        for m in reversed(data["matches"]):
            if m["customer_id"] == customer_id and m["status"] in active:
                return dict(m)
    return None


def clear() -> None:
    """Xoá toàn bộ — chỉ dùng trong test."""
    with _LOCK:
        _save({"matches": []})
