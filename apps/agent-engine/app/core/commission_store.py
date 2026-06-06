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
        record = {**record, "saved_at": datetime.utcnow().isoformat() + "Z"}
        _RECORDS[deal_id] = record
        return record


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
