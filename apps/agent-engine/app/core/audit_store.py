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


def record_admin(
    action: str,
    actor: dict[str, Any],
    *,
    target: str = "",
    old_value: Any = None,
    new_value: Any = None,
    detail: str = "",
) -> dict:
    """Ghi nhật ký 1 thao tác quản trị (who / what / when / old / new).

    `action` ví dụ: "user.create", "user.disable", "commission.approve".
    Lưu dưới event_type "admin.<action>" để lọc qua prefix="admin.".
    """
    return record(
        f"admin.{action}",
        {
            "actor_id": actor.get("id"),
            "actor_email": actor.get("email"),
            "actor_name": actor.get("full_name"),
            "target": target,
            "old_value": old_value,
            "new_value": new_value,
        },
        detail=detail,
    )


def record_openclaw(
    method: str,
    path: str,
    *,
    status_code: int,
    duration_ms: int,
    body: Optional[dict[str, Any]] = None,
    query: Optional[dict[str, Any]] = None,
    principal: str = "openclaw_ceo",
) -> dict:
    """Ghi 1 request God-Mode của OpenClaw (mọi /openclaw/*) — tag riêng.

    `body`/`query` PHẢI được mask password/token trước khi gọi (xem middleware).
    Lưu dưới event_type "openclaw.<METHOD>" để lọc qua prefix="openclaw.".
    """
    return record(
        f"openclaw.{method.upper()}",
        {
            "tag": "OPENCLAW_GOD_MODE",
            "principal": principal,
            "method": method.upper(),
            "path": path,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "query": query or {},
            "body": body or {},
        },
        status="ok" if status_code < 400 else "error",
        detail=f"{method.upper()} {path} → {status_code} ({duration_ms}ms)",
    )


def list_events(
    event_type: Optional[str] = None,
    limit: int = 100,
    prefix: Optional[object] = None,
) -> list[dict]:
    """Trả về sự kiện gần nhất (mới nhất trước).

    - `event_type`: lọc khớp tuyệt đối loại sự kiện.
    - `prefix`: lọc theo tiền tố. Nhận str (1 tiền tố) hoặc tuple/list nhiều tiền
      tố (vd ("admin.", "openclaw.") để gộp nhật ký quản trị + God-Mode).
    """
    with _LOCK:
        items = list(reversed(_EVENTS))
    if event_type:
        items = [e for e in items if e["event_type"] == event_type]
    if prefix:
        prefixes = (prefix,) if isinstance(prefix, str) else tuple(prefix)
        items = [e for e in items if e["event_type"].startswith(prefixes)]
    return items[:limit]


def clear() -> None:
    """Xoá toàn bộ (dùng trong test)."""
    with _LOCK:
        _EVENTS.clear()
