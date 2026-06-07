"""Booking store cho MVP — lưu file JSON local, KHÔNG dùng cho production.

Format file (data/_runtime/bookings.json):
  {
    "bookings": [
      {"id": "...", "unit_id": "...", "lead_id": "...", "sale_id": null,
       "customer_name": "...", "customer_phone": "...", "customer_email": "...",
       "scheduled_at": "ISO8601", "status": "pending", "notes": null,
       "ai_score": 50, "created_at": "ISO8601", "updated_at": "ISO8601"}
    ]
  }

Cùng convention với app/core/user_store.py: thread-safe (Lock), atomic write
(.tmp → replace), resolve path robust cho Railway. Sau Sprint 1.1 sẽ migrate
sang PostgreSQL — giữ interface (create/get/list_all/update) để swap dễ.
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

_LOCK = threading.Lock()


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới bookings.json — robust với mọi cấu trúc deploy.

    Neo theo thư mục `agent-engine`, fallback DATA_DIR / CWD (giống user_store).
    """
    p = Path(settings.bookings_file)
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
        path.write_text(json.dumps({"bookings": []}, ensure_ascii=False, indent=2))
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


def create(record: dict) -> dict:
    """Tạo booking mới. `record` là dict đã serialize (datetime → ISO string).

    Tự sinh `id` nếu chưa có. Trả về record đã lưu.
    """
    with _LOCK:
        data = _load()
        record.setdefault("id", str(uuid.uuid4()))
        data["bookings"].append(record)
        _save(data)
        return record


def get(booking_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for b in data["bookings"]:
            if b["id"] == booking_id:
                return b
    return None


def list_all() -> list[dict]:
    with _LOCK:
        data = _load()
        return list(data["bookings"])


def update(booking_id: str, **fields) -> Optional[dict]:
    """Cập nhật field tuỳ ý của booking. Tự set updated_at. None nếu không thấy."""
    with _LOCK:
        data = _load()
        for b in data["bookings"]:
            if b["id"] == booking_id:
                for k, v in fields.items():
                    if v is not None:
                        b[k] = v
                b["updated_at"] = datetime.utcnow().isoformat() + "Z"
                _save(data)
                return b
    return None


def clear() -> None:
    """Xoá toàn bộ booking — chỉ dùng trong test."""
    with _LOCK:
        _save({"bookings": []})
