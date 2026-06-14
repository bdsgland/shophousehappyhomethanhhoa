"""Phiếu MỜI / GHI NHẬN sale cho sàn F2 (đa-tenant) — JSON interim. (BƯỚC NỀN)

File: data/_runtime/agency_sale_requests.json
      → {"requests": {<agency_id>: [ {request}, ... ]}}

Khi sàn F2 chưa có cơ chế provisioning tài khoản sale tự động, chủ sàn vẫn cần
"thêm/mời sale". Store NÀY ghi nhận yêu cầu đó theo TỪNG SÀN (lọc cứng agency_id)
để admin xử lý sau — KHÔNG tạo tài khoản, KHÔNG đụng user_store.

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/agency_commission_store.py & user_store.py.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

_LOCK = threading.Lock()

_ROOT_KEY = "requests"
_FILE = "data/_runtime/agency_sale_requests.json"

_VALID_STATUS = {"pending", "contacted", "joined", "rejected"}


# ---------------------------------------------------------------------------
# Path / IO helpers (cùng pattern agency_commission_store)
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
    path = _resolve(_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({_ROOT_KEY: {}}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get(_ROOT_KEY), dict):
        data = {_ROOT_KEY: {}}
    return data


def _write(data: dict) -> None:
    path = _ensure()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# Public API — LUÔN lọc theo agency_id (đa-tenant)
# ---------------------------------------------------------------------------

def list_for_agency(agency_id: str) -> list[dict]:
    """Danh sách phiếu mời sale của 1 sàn (mới nhất trước). [] nếu agency rỗng."""
    aid = (agency_id or "").strip()
    if not aid:
        return []
    with _LOCK:
        data = _load()
        rows = list(data[_ROOT_KEY].get(aid, []))
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows


def create_for_agency(
    agency_id: str,
    *,
    full_name: str,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    note: Optional[str] = None,
    created_by: Optional[str] = None,
) -> dict:
    """Ghi nhận 1 phiếu mời sale cho sàn. Lọc cứng theo agency_id (từ token)."""
    aid = (agency_id or "").strip()
    if not aid:
        raise ValueError("Thiếu agency_id")
    name = (full_name or "").strip()
    if not name:
        raise ValueError("Thiếu họ tên sale")
    rec = {
        "id": str(uuid.uuid4()),
        "agency_id": aid,
        "full_name": name,
        "phone": (phone or "").strip() or None,
        "email": ((email or "").strip().lower() or None),
        "note": (note or "").strip() or None,
        "status": "pending",
        "created_by": created_by,
        "created_at": _now(),
        "updated_at": _now(),
    }
    with _LOCK:
        data = _load()
        bucket = data[_ROOT_KEY].setdefault(aid, [])
        bucket.append(rec)
        _write(data)
    return rec


def update_status_for_agency(
    agency_id: str, request_id: str, status: str
) -> Optional[dict]:
    """Đổi trạng thái 1 phiếu — CHỈ trong phạm vi sàn (chống IDOR chéo sàn)."""
    aid = (agency_id or "").strip()
    st = (status or "").strip()
    if st not in _VALID_STATUS:
        raise ValueError(f"Trạng thái không hợp lệ: {status}")
    with _LOCK:
        data = _load()
        bucket = data[_ROOT_KEY].get(aid, [])
        for r in bucket:
            if r.get("id") == request_id:
                r["status"] = st
                r["updated_at"] = _now()
                _write(data)
                return r
    return None
