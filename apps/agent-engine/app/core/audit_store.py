"""Audit log nhẹ cho sự kiện automation (MVP — in-memory, giới hạn N bản ghi).

Ghi lại mọi lần webhook nội bộ được gọi (booking-created, deal-closed, ...) để
admin tra cứu và để test khẳng định side-effect. Giai đoạn 2 thay bằng bảng DB.
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

_LOCK = threading.Lock()
_MAX = 500  # giữ tối đa N sự kiện gần nhất để giới hạn bộ nhớ

# Mới nhất ở cuối list.
_EVENTS: list[dict] = []


def record(
    event_type: str,
    payload: Optional[dict[str, Any]] = None,
    *,
    status: str = "ok",
    detail: str = "",
) -> dict:
    """Ghi 1 sự kiện audit. Trả về bản ghi đã tạo."""
    entry = {
        "id": str(uuid4()),
        "event_type": event_type,
        "status": status,
        "detail": detail,
        "payload": payload or {},
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    with _LOCK:
        _EVENTS.append(entry)
        if len(_EVENTS) > _MAX:
            del _EVENTS[: len(_EVENTS) - _MAX]
    return entry


def list_events(
    event_type: Optional[str] = None, limit: int = 100
) -> list[dict]:
    """Trả về sự kiện gần nhất (mới nhất trước), lọc theo event_type nếu có."""
    with _LOCK:
        items = list(reversed(_EVENTS))
    if event_type:
        items = [e for e in items if e["event_type"] == event_type]
    return items[:limit]


def clear() -> None:
    """Xoá toàn bộ (dùng trong test)."""
    with _LOCK:
        _EVENTS.clear()
