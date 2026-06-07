"""Lưu bản ghi phân bổ hoa hồng (MVP — in-memory).

n8n workflow "Commission Calculator" tính 5 bậc rồi POST về
/commissions/distribute; record được lưu ở đây cho admin tra cứu + đối soát.
Giai đoạn 2 thay bằng bảng PostgreSQL `commissions`.
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Optional

_LOCK = threading.Lock()

# deal_id -> record (idempotent: cùng deal_id ghi đè, tránh nhân đôi khi n8n retry)
_RECORDS: dict[str, dict] = {}


def upsert(record: dict) -> dict:
    """Lưu / cập nhật bản ghi hoa hồng theo deal_id."""
    deal_id = record["deal_id"]
    with _LOCK:
        prev = _RECORDS.get(deal_id, {})
        record = {**record, "saved_at": datetime.utcnow().isoformat() + "Z"}
        # Giữ trạng thái duyệt / chi trả khi n8n retry ghi đè (idempotent).
        record.setdefault("status", prev.get("status", "pending"))
        record.setdefault("approved_at", prev.get("approved_at"))
        record.setdefault("paid_at", prev.get("paid_at"))
        _RECORDS[deal_id] = record
        return record


def set_status(
    deal_id: str,
    *,
    status: Optional[str] = None,
    approved_at: Optional[str] = None,
    paid_at: Optional[str] = None,
) -> Optional[dict]:
    """Cập nhật trạng thái duyệt / chi trả hoa hồng. None nếu không tìm thấy."""
    with _LOCK:
        rec = _RECORDS.get(deal_id)
        if not rec:
            return None
        if status is not None:
            rec["status"] = status
        if approved_at is not None:
            rec["approved_at"] = approved_at
        if paid_at is not None:
            rec["paid_at"] = paid_at
        _RECORDS[deal_id] = rec
        return rec


def get(deal_id: str) -> Optional[dict]:
    with _LOCK:
        return _RECORDS.get(deal_id)


def list_records(sale_id: Optional[str] = None, limit: int = 100) -> list[dict]:
    with _LOCK:
        items = list(_RECORDS.values())
    items.sort(key=lambda r: r.get("saved_at", ""), reverse=True)
    if sale_id:
        items = [r for r in items if r.get("sale_id") == sale_id]
    return items[:limit]


def clear() -> None:
    """Dùng trong test."""
    with _LOCK:
        _RECORDS.clear()
