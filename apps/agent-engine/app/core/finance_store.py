"""Store TÀI CHÍNH — chi phí + doanh thu nhập tay (JSON, MVP).

Format file (data/_runtime/finance.json):
  {
    "costs": [
      {"id","category","name","amount","recurring","date","note",
       "created_at","updated_at"}
    ],
    "manual_revenue": [
      {"id","name","amount","date","source","note","created_at","updated_at"}
    ],
    "seeded": true
  }

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/sale_task_store.py & user_store.py. Sau migrate PostgreSQL.

Lần đầu khởi tạo: seed vài khoản chi phí MẪU (đánh dấu "ví dụ — sửa lại" trong
note) để admin có dữ liệu mẫu rồi sửa theo thực tế. Doanh thu KHÔNG seed (lấy
thật từ hoa hồng).
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
from app.schemas.finance import COST_CATEGORIES, RECURRENCE_KINDS

_LOCK = threading.Lock()

_SEED_NOTE = "ví dụ — sửa lại"


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _today() -> str:
    return datetime.utcnow().date().isoformat()


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới finance.json (neo theo agent-engine / DATA_DIR)."""
    p = Path(settings.finance_file)
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


def _seed_costs() -> list[dict]:
    """Vài khoản chi phí MẪU — admin sửa lại theo thực tế (note đánh dấu rõ)."""
    month_start = datetime.utcnow().date().replace(day=1).isoformat()
    samples = [
        ("nền tảng", "Hosting + hạ tầng (Railway/VPS)", 3_000_000, "monthly"),
        ("nền tảng", "Chi phí API AI (Claude/n8n)", 2_500_000, "monthly"),
        ("marketing", "Quảng cáo Facebook/Google", 30_000_000, "monthly"),
        ("nhân sự", "Lương đội vận hành & sale support", 60_000_000, "monthly"),
        ("vận hành", "Văn phòng + tiện ích", 15_000_000, "monthly"),
    ]
    out: list[dict] = []
    for category, name, amount, recurring in samples:
        out.append(
            {
                "id": uuid.uuid4().hex[:12],
                "category": category,
                "name": name,
                "amount": float(amount),
                "recurring": recurring,
                "date": month_start,
                "note": _SEED_NOTE,
                "created_at": _now(),
                "updated_at": None,
            }
        )
    return out


def _ensure_file() -> Path:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        data = {
            "costs": _seed_costs(),
            "manual_revenue": [],
            "seeded": True,
        }
        _write(path, data)
    return path


def _load() -> dict:
    path = _ensure_file()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("costs", [])
    data.setdefault("manual_revenue", [])
    return data


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _save(data: dict) -> None:
    _write(_ensure_file(), data)


def _validate_cost(category: str, recurring: str) -> None:
    if category not in COST_CATEGORIES:
        raise ValueError(
            f"Hạng mục không hợp lệ. Hợp lệ: {', '.join(COST_CATEGORIES)}"
        )
    if recurring not in RECURRENCE_KINDS:
        raise ValueError(
            f"Kiểu lặp không hợp lệ. Hợp lệ: {', '.join(RECURRENCE_KINDS)}"
        )


# ---------------------------------------------------------------------------
# Chi phí — CRUD
# ---------------------------------------------------------------------------

def list_costs() -> list[dict]:
    with _LOCK:
        items = list(_load()["costs"])
    items.sort(key=lambda c: (c.get("date", ""), c.get("created_at", "")), reverse=True)
    return items


def create_cost(payload: dict) -> dict:
    _validate_cost(payload.get("category", ""), payload.get("recurring", "monthly"))
    cost = {
        "id": uuid.uuid4().hex[:12],
        "category": payload["category"],
        "name": payload["name"],
        "amount": float(payload.get("amount") or 0),
        "recurring": payload.get("recurring", "monthly"),
        "date": payload.get("date") or _today(),
        "note": payload.get("note") or "",
        "created_at": _now(),
        "updated_at": None,
    }
    with _LOCK:
        data = _load()
        data["costs"].append(cost)
        _save(data)
    return cost


def update_cost(cost_id: str, payload: dict) -> Optional[dict]:
    if "category" in payload or "recurring" in payload:
        _validate_cost(
            payload.get("category", "nền tảng"),
            payload.get("recurring", "monthly"),
        )
    with _LOCK:
        data = _load()
        for c in data["costs"]:
            if c["id"] == cost_id:
                for key in ("category", "name", "recurring", "date", "note"):
                    if key in payload and payload[key] is not None:
                        c[key] = payload[key]
                if payload.get("amount") is not None:
                    c["amount"] = float(payload["amount"])
                c["updated_at"] = _now()
                _save(data)
                return c
    return None


def delete_cost(cost_id: str) -> bool:
    with _LOCK:
        data = _load()
        before = len(data["costs"])
        data["costs"] = [c for c in data["costs"] if c["id"] != cost_id]
        if len(data["costs"]) == before:
            return False
        _save(data)
        return True


# ---------------------------------------------------------------------------
# Doanh thu thủ công — CRUD
# ---------------------------------------------------------------------------

def list_manual_revenue() -> list[dict]:
    with _LOCK:
        items = list(_load()["manual_revenue"])
    items.sort(key=lambda r: (r.get("date", ""), r.get("created_at", "")), reverse=True)
    return items


def create_manual_revenue(payload: dict) -> dict:
    rev = {
        "id": uuid.uuid4().hex[:12],
        "name": payload["name"],
        "amount": float(payload.get("amount") or 0),
        "date": payload.get("date") or _today(),
        "source": payload.get("source") or "khác",
        "note": payload.get("note") or "",
        "created_at": _now(),
        "updated_at": None,
    }
    with _LOCK:
        data = _load()
        data["manual_revenue"].append(rev)
        _save(data)
    return rev


def update_manual_revenue(rev_id: str, payload: dict) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for r in data["manual_revenue"]:
            if r["id"] == rev_id:
                for key in ("name", "date", "source", "note"):
                    if key in payload and payload[key] is not None:
                        r[key] = payload[key]
                if payload.get("amount") is not None:
                    r["amount"] = float(payload["amount"])
                r["updated_at"] = _now()
                _save(data)
                return r
    return None


def delete_manual_revenue(rev_id: str) -> bool:
    with _LOCK:
        data = _load()
        before = len(data["manual_revenue"])
        data["manual_revenue"] = [
            r for r in data["manual_revenue"] if r["id"] != rev_id
        ]
        if len(data["manual_revenue"]) == before:
            return False
        _save(data)
        return True


def clear() -> None:
    """Xoá toàn bộ — chỉ dùng trong test."""
    with _LOCK:
        _save({"costs": [], "manual_revenue": [], "seeded": True})
