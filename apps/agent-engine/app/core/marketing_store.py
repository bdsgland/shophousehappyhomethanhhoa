"""Store AI Marketing — chiến dịch + lịch sử nội dung AI (JSON interim).

Files:
  data/_runtime/marketing_campaigns.json → {"campaigns": [ {campaign dict} ]}
  data/_runtime/marketing_content.json    → {"content": [ {content dict} ]}

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/lead_store.py. KHÔNG hard-delete campaign khi có thể (nhưng marketing
campaign cho phép xoá hẳn — không phải dữ liệu khách). Sau migrate PostgreSQL —
giữ interface để swap dễ.
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


# ---------------------------------------------------------------------------
# Path / IO helpers (dùng chung 2 file)
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


def _ensure(rel: str, root_key: str) -> Path:
    path = _resolve(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({root_key: []}, ensure_ascii=False, indent=2))
    return path


def _load(rel: str, root_key: str) -> dict:
    path = _ensure(rel, root_key)
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        # File hỏng → coi như rỗng (không crash); lần ghi sau sẽ tạo lại.
        return {root_key: []}
    if not isinstance(data, dict) or not isinstance(data.get(root_key), list):
        return {root_key: []}
    return data


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _save(rel: str, root_key: str, data: dict) -> None:
    _write(_ensure(rel, root_key), data)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _load_campaigns() -> dict:
    return _load(settings.marketing_campaigns_file, "campaigns")


def _save_campaigns(data: dict) -> None:
    _save(settings.marketing_campaigns_file, "campaigns", data)


def _load_content() -> dict:
    return _load(settings.marketing_content_file, "content")


def _save_content(data: dict) -> None:
    _save(settings.marketing_content_file, "content", data)


# ---------------------------------------------------------------------------
# Campaign CRUD
# ---------------------------------------------------------------------------

_CAMPAIGN_FIELDS = {
    "name", "channel", "objective", "budget", "spent", "start_date",
    "end_date", "status", "utm_source", "notes",
}


def _clean_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def create_campaign(payload: dict) -> dict:
    """Tạo campaign mới từ dict (đã validate bởi Pydantic ở endpoint)."""
    now = _now()
    campaign = {
        "id": str(uuid.uuid4()),
        "name": (payload.get("name") or "").strip(),
        "channel": payload.get("channel") or "other",
        "objective": _clean_str(payload.get("objective")),
        "budget": float(payload.get("budget") or 0),
        "spent": float(payload.get("spent") or 0),
        "start_date": _clean_str(payload.get("start_date")),
        "end_date": _clean_str(payload.get("end_date")),
        "status": payload.get("status") or "draft",
        "utm_source": _clean_str(payload.get("utm_source")),
        "notes": _clean_str(payload.get("notes")),
        "created_at": now,
        "updated_at": now,
    }
    with _LOCK:
        data = _load_campaigns()
        data["campaigns"].append(campaign)
        _save_campaigns(data)
    return campaign


def list_campaigns(
    *, channel: Optional[str] = None, status: Optional[str] = None
) -> list[dict]:
    """Danh sách campaign (mới nhất trước), có lọc tuỳ chọn theo channel/status."""
    with _LOCK:
        data = _load_campaigns()
        rows = list(data["campaigns"])
    if channel:
        rows = [c for c in rows if c.get("channel") == channel]
    if status:
        rows = [c for c in rows if c.get("status") == status]
    rows.sort(key=lambda c: c.get("created_at") or "", reverse=True)
    return rows


def get_campaign(campaign_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load_campaigns()
        for c in data["campaigns"]:
            if c.get("id") == campaign_id:
                return c
    return None


def update_campaign(campaign_id: str, fields: dict) -> Optional[dict]:
    """Cập nhật field hợp lệ của campaign. None nếu không tìm thấy."""
    with _LOCK:
        data = _load_campaigns()
        for c in data["campaigns"]:
            if c.get("id") != campaign_id:
                continue
            for key, val in fields.items():
                if key not in _CAMPAIGN_FIELDS or val is None:
                    continue
                if key in ("budget", "spent"):
                    c[key] = float(val)
                elif key in ("objective", "start_date", "end_date", "utm_source", "notes"):
                    c[key] = _clean_str(val)
                elif key == "name":
                    c[key] = str(val).strip()
                else:
                    c[key] = val
            c["updated_at"] = _now()
            _save_campaigns(data)
            return c
    return None


def set_spent(campaign_id: str, *, spent: Optional[float] = None,
              add: Optional[float] = None) -> Optional[dict]:
    """Đặt chi tiêu tuyệt đối (spent) hoặc cộng thêm (add). add ưu tiên nếu có."""
    with _LOCK:
        data = _load_campaigns()
        for c in data["campaigns"]:
            if c.get("id") != campaign_id:
                continue
            cur = float(c.get("spent") or 0)
            if add is not None:
                cur = max(0.0, cur + float(add))
            elif spent is not None:
                cur = max(0.0, float(spent))
            c["spent"] = cur
            c["updated_at"] = _now()
            _save_campaigns(data)
            return c
    return None


def delete_campaign(campaign_id: str) -> bool:
    """Xoá hẳn 1 campaign. True nếu đã xoá."""
    with _LOCK:
        data = _load_campaigns()
        before = len(data["campaigns"])
        data["campaigns"] = [c for c in data["campaigns"] if c.get("id") != campaign_id]
        if len(data["campaigns"]) == before:
            return False
        _save_campaigns(data)
        return True


# ---------------------------------------------------------------------------
# Content history (lịch sử nội dung AI đã tạo)
# ---------------------------------------------------------------------------

def add_content(item: dict) -> dict:
    """Lưu 1 bản ghi nội dung đã tạo. Tự rotate khi vượt marketing_content_keep."""
    record = dict(item)
    record.setdefault("id", str(uuid.uuid4()))
    record.setdefault("created_at", _now())
    with _LOCK:
        data = _load_content()
        data["content"].append(record)
        keep = max(1, int(settings.marketing_content_keep))
        if len(data["content"]) > keep:
            # giữ N bản mới nhất (sort theo created_at để chắc chắn)
            data["content"].sort(key=lambda x: x.get("created_at") or "")
            data["content"] = data["content"][-keep:]
        _save_content(data)
    return record


def list_content(*, limit: int = 50, content_type: Optional[str] = None,
                 channel: Optional[str] = None) -> list[dict]:
    """Lịch sử nội dung (mới nhất trước), lọc tuỳ chọn + giới hạn số bản ghi."""
    with _LOCK:
        data = _load_content()
        rows = list(data["content"])
    if content_type:
        rows = [r for r in rows if r.get("content_type") == content_type]
    if channel:
        rows = [r for r in rows if r.get("channel") == channel]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows[: max(1, limit)]


def delete_content(content_id: str) -> bool:
    with _LOCK:
        data = _load_content()
        before = len(data["content"])
        data["content"] = [r for r in data["content"] if r.get("id") != content_id]
        if len(data["content"]) == before:
            return False
        _save_content(data)
        return True


def clear() -> None:
    """Xoá toàn bộ campaigns + content — chỉ dùng trong test."""
    with _LOCK:
        _save_campaigns({"campaigns": []})
        _save_content({"content": []})
