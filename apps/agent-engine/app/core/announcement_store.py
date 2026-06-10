"""In-app announcement store — thông báo điều hành hiển thị trong app.

Dùng cho Manager broadcast (kênh "inapp"). Lưu danh sách thông báo (mới nhất
trước) để FE đọc. Cùng convention store JSON (thread-safe Lock, atomic write,
resolve path robust) với sale_task_store / user_store. Sau migrate PostgreSQL.

Format file (data/_runtime/announcements.json):
  {"announcements": [
     {"id": "...", "title": "...", "message": "...", "audience": "all_sales",
      "user_ids": [...], "created_by": "<admin_email>", "created_at": "ISO"}
  ]}
"""

from __future__ import annotations

import json
import os
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_LOCK = threading.Lock()

_REL_PATH = "data/_runtime/announcements.json"
_MAX_KEEP = 200  # giữ tối đa 200 thông báo gần nhất


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới announcements.json (neo theo agent-engine / DATA_DIR)."""
    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / "announcements.json").resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / _REL_PATH).resolve()
    return (Path.cwd() / _REL_PATH).resolve()


def _ensure_file() -> Path:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"announcements": []}, ensure_ascii=False, indent=2))
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


def create(
    *,
    message: str,
    audience: str,
    user_ids: Optional[List[str]] = None,
    title: Optional[str] = None,
    created_by: str = "",
) -> Dict[str, Any]:
    """Lưu 1 thông báo in-app. Trả bản ghi đã tạo."""
    record = {
        "id": secrets.token_urlsafe(8),
        "title": title or "",
        "message": message,
        "audience": audience,
        "user_ids": list(user_ids or []),
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        data = _load()
        items = data.get("announcements", [])
        items.insert(0, record)
        data["announcements"] = items[:_MAX_KEEP]
        _write(_ensure_file(), data)
    return record


def list_recent(limit: int = 50) -> List[Dict[str, Any]]:
    with _LOCK:
        data = _load()
    return list(data.get("announcements", []))[:limit]


def clear() -> None:
    """Dùng trong test."""
    with _LOCK:
        _write(_ensure_file(), {"announcements": []})
