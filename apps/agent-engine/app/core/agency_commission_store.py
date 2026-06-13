"""Cấu hình HOA HỒNG THEO SÀN F2 (đa-tenant) — JSON interim. (BƯỚC NỀN)

File: data/_runtime/agency_commission.json → {"configs": {<agency_id>: {cfg}}}

KHÁC `commission_config_store` (1 object cấu hình DUY NHẤT toàn nền tảng cho cơ
chế hoa hồng đang chạy): store NÀY tách theo `agency_id`, mỗi sàn 1 cấu hình con
mô tả cách sàn F2 chia phần hoa hồng (trong khuôn khổ 80% sàn được hưởng) cho đội
sale frontline của CHÍNH sàn.

ĐÂY LÀ BƯỚC NỀN: store + đọc/ghi cấu hình của sàn. KHÔNG đụng và KHÔNG thay đổi
cơ chế tính/chia hoa hồng toàn nền tảng (commission_config_store) đang vận hành —
việc áp dụng cấu hình này vào dòng tiền thực tế là phần hoàn thiện sau.

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/user_store.py & lead_store.py.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

_LOCK = threading.Lock()

_ROOT_KEY = "configs"
_FILE = "data/_runtime/agency_commission.json"

# Mức chia mặc định cho sale frontline của sàn (%, trong phần sàn được hưởng).
DEFAULT_FRONTLINE_PCT = 50


# ---------------------------------------------------------------------------
# Path / IO helpers (cùng pattern lead_store/user_store)
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


def _default_config(agency_id: str) -> dict:
    return {
        "agency_id": agency_id,
        "frontline_pct": DEFAULT_FRONTLINE_PCT,
        "note": None,
        "version": 0,
        "updated_at": None,
        "is_default": True,
    }


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def get_config(agency_id: str) -> dict:
    """Trả cấu hình hoa hồng của sàn. Chưa cấu hình → trả mặc định (is_default)."""
    aid = (agency_id or "").strip()
    if not aid:
        return _default_config("")
    with _LOCK:
        cfg = _load()[_ROOT_KEY].get(aid)
    if not cfg:
        return _default_config(aid)
    out = _default_config(aid)
    out.update(cfg)
    out["agency_id"] = aid
    out["is_default"] = False
    return out


def set_config(
    agency_id: str,
    *,
    frontline_pct: Optional[int] = None,
    note: Optional[str] = None,
) -> dict:
    """Lưu cấu hình hoa hồng cho sàn. Tạo mới nếu chưa có, tăng version mỗi lần ghi.

    Validate: frontline_pct trong [0, 100]. Trả cấu hình đã lưu. CHỈ caller có
    quyền (can_config_sale_commission) mới được gọi — kiểm ở tầng endpoint."""
    aid = (agency_id or "").strip()
    if not aid:
        raise ValueError("Thiếu agency_id")
    if frontline_pct is not None:
        try:
            frontline_pct = int(frontline_pct)
        except (TypeError, ValueError):
            raise ValueError("frontline_pct phải là số nguyên")
        if frontline_pct < 0 or frontline_pct > 100:
            raise ValueError("frontline_pct phải trong khoảng 0–100")
    now = _now()
    with _LOCK:
        data = _load()
        cur = data[_ROOT_KEY].get(aid) or _default_config(aid)
        if frontline_pct is not None:
            cur["frontline_pct"] = frontline_pct
        if note is not None:
            cur["note"] = (str(note).strip() or None)
        cur["agency_id"] = aid
        cur["version"] = int(cur.get("version") or 0) + 1
        cur["updated_at"] = now
        cur.pop("is_default", None)
        data[_ROOT_KEY][aid] = cur
        _write(data)
    return get_config(aid)


def clear() -> None:
    """Xoá toàn bộ — chỉ dùng trong test."""
    with _LOCK:
        _write({_ROOT_KEY: {}})
