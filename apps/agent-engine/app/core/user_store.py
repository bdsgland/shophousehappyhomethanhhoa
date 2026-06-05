"""User store cho MVP — lưu file JSON local, KHÔNG dùng cho production.

Format file (data/_runtime/users.json):
  {
    "users": [
      {"id": "...", "email": "...", "full_name": "...", "phone": "...",
       "role": "sale", "is_active": true,
       "password_hash": "$2b$...", "created_at": "ISO8601"}
    ]
  }

Khi load lần đầu, file cũ thiếu `role`/`is_active` sẽ được migration tự động
gán mặc định ("sale", True) và ghi đè lại file.
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


def _file_path() -> Path:
    """Đường dẫn tuyệt đối tới users.json — robust với mọi cấu trúc deploy.

    Trước đây dùng `parents[4]` (giả định cố định cây thư mục) → trên Railway
    root dir là `apps/agent-engine` nên path nông hơn → `IndexError: 4` làm
    crash toàn bộ auth. Nay neo theo thư mục `agent-engine`, fallback DATA_DIR/CWD.
    """
    p = Path(settings.users_file)
    if p.is_absolute():
        return p

    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / p).resolve()

    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / p).resolve()

    # Fallback cuối: theo thư mục làm việc hiện tại (không bao giờ crash)
    return (Path.cwd() / p).resolve()


def _ensure_file() -> Path:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"users": []}, ensure_ascii=False, indent=2))
    return path


def _migrate(data: dict) -> bool:
    """Bổ sung field mới (role, is_active) cho user cũ. Trả về True nếu có thay đổi."""
    changed = False
    for u in data.get("users", []):
        if "role" not in u:
            u["role"] = "sale"
            changed = True
        if "is_active" not in u:
            u["is_active"] = True
            changed = True
    return changed


def _load() -> dict:
    path = _ensure_file()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if _migrate(data):
        _write(path, data)
    return data


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _save(data: dict) -> None:
    _write(_ensure_file(), data)


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


def list_users() -> list[dict]:
    with _LOCK:
        data = _load()
        return list(data["users"])


def create_user(
    *,
    email: str,
    full_name: str,
    password_hash: str,
    phone: Optional[str] = None,
    role: str = "sale",
    is_active: bool = True,
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
            "is_active": is_active,
            "password_hash": password_hash,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        data["users"].append(new_user)
        _save(data)
        return new_user


def update_user(
    user_id: str,
    *,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Optional[dict]:
    """Cập nhật role/is_active. Trả về user đã cập nhật, None nếu không tìm thấy."""
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                if role is not None:
                    u["role"] = role
                if is_active is not None:
                    u["is_active"] = is_active
                _save(data)
                return u
    return None


def public_view(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "phone": user.get("phone"),
        "role": user.get("role", "sale"),
        "is_active": user.get("is_active", True),
        "created_at": user["created_at"],
    }
