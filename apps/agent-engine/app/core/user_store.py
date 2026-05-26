"""User store cho MVP — lưu file JSON local, KHÔNG dùng cho production.

Format file (data/_runtime/users.json):
  {
    "users": [
      {"id": "...", "email": "...", "full_name": "...", "phone": "...",
       "role": "sale", "password_hash": "$2b$...", "created_at": "ISO8601"}
    ]
  }
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.Lock()


def _file_path() -> Path:
    p = Path(settings.users_file)
    if not p.is_absolute():
        # Resolve tương đối repo root (.../app/core/user_store.py → 4 cấp)
        p = (Path(__file__).resolve().parents[4] / p).resolve()
    return p


def _ensure_file() -> Path:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"users": []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure_file()
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    path = _ensure_file()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def find_by_email(email: str) -> Optional[dict]:
    email_l = email.strip().lower()
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["email"].lower() == email_l:
                return u
    return None


def find_by_id(user_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                return u
    return None


def create_user(
    *,
    email: str,
    full_name: str,
    password_hash: str,
    phone: Optional[str] = None,
    role: str = "sale",
) -> dict:
    with _LOCK:
        data = _load()
        email_l = email.strip().lower()
        for u in data["users"]:
            if u["email"].lower() == email_l:
                raise ValueError("Email đã được đăng ký")
        new_user = {
            "id": str(uuid.uuid4()),
            "email": email_l,
            "full_name": full_name.strip(),
            "phone": (phone or "").strip() or None,
            "role": role,
            "password_hash": password_hash,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        data["users"].append(new_user)
        _save(data)
        return new_user


def public_view(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "phone": user.get("phone"),
        "role": user.get("role", "sale"),
        "created_at": user["created_at"],
    }
