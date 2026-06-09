"""Workspace token store — lưu bền refresh token Google Workspace (Calendar+Drive).

Lấy qua luồng OAuth "Connect" trên admin (app/api/workspace_oauth.py). Lưu 1
object JSON (data/_runtime/google_workspace.json) theo đúng convention store JSON
(Lock + atomic .tmp rename + resolve path robust) như match_store / user_store.

Format file:
  {"refresh_token": "...", "scopes": ["..."], "email": "...",
   "connected_at": "ISO8601Z", "updated_at": "ISO8601Z"}

KHÔNG bao giờ log/echo refresh_token. get_status() trả metadata an toàn (không
kèm token) để admin xem trạng thái kết nối.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.RLock()


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới google_workspace.json (neo DATA_DIR / agent-engine)."""
    p = Path(settings.google_workspace_token_file)
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
        path.write_text(json.dumps({}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure_file()
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f) or {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def save_token(
    *,
    refresh_token: str,
    scopes: Optional[list[str]] = None,
    email: Optional[str] = None,
) -> dict:
    """Ghi/đè refresh token Workspace. Trả metadata (KHÔNG kèm token)."""
    with _LOCK:
        data = _load()
        now = _now()
        record = {
            "refresh_token": refresh_token,
            "scopes": scopes or [],
            "email": email,
            "connected_at": data.get("connected_at") or now,
            "updated_at": now,
        }
        _write(_ensure_file(), record)
        return get_status()


def get_refresh_token() -> Optional[str]:
    """Trả refresh token đã lưu (None nếu chưa kết nối)."""
    with _LOCK:
        token = _load().get("refresh_token")
        return token or None


def get_status() -> dict:
    """Metadata an toàn cho admin: {connected, scopes, email, connected_at, updated_at}."""
    with _LOCK:
        data = _load()
        return {
            "connected": bool(data.get("refresh_token")),
            "scopes": data.get("scopes") or [],
            "email": data.get("email"),
            "connected_at": data.get("connected_at"),
            "updated_at": data.get("updated_at"),
        }


def clear() -> None:
    """Xoá token đã lưu (dùng trong test / ngắt kết nối)."""
    with _LOCK:
        _write(_ensure_file(), {})
