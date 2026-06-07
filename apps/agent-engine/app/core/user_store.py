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
import re
import secrets
import string
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.Lock()

_REF_ALPHABET = string.ascii_uppercase + string.digits


def _gen_referral_code(full_name: str, existing: set[str]) -> str:
    """Sinh mã giới thiệu dạng `RAI-XXX-YYYY` (3 chữ từ tên + 4 ký tự ngẫu nhiên).

    3 chữ lấy từ các ký tự ASCII của tên (tên gọi tiếng Việt nằm cuối) → ví dụ
    "Phạm Văn Thu" → "THU". Bảo đảm không trùng với mã đã tồn tại.
    """
    letters = re.sub(r"[^A-Za-z]", "", full_name).upper()
    stem = letters[-3:] if len(letters) >= 3 else (letters or "RAI")
    while len(stem) < 3:
        stem += secrets.choice(string.ascii_uppercase)
    for _ in range(50):
        suffix = "".join(secrets.choice(_REF_ALPHABET) for _ in range(4))
        code = f"RAI-{stem}-{suffix}"
        if code not in existing:
            return code
    # Cực hiếm khi đụng — thêm ký tự để chắc chắn duy nhất
    return f"RAI-{stem}-{secrets.token_hex(3).upper()}"


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
    """Bổ sung field mới (role, is_active, profile, referral) cho user cũ.

    Trả về True nếu có thay đổi (để ghi đè lại file).
    """
    changed = False
    users = data.get("users", [])
    existing_codes = {u["referral_code"] for u in users if u.get("referral_code")}
    for u in users:
        if "role" not in u:
            u["role"] = "sale"
            changed = True
        if "is_active" not in u:
            u["is_active"] = True
            changed = True
        if "dob" not in u:
            u["dob"] = None
            changed = True
        if "region" not in u:
            u["region"] = None
            changed = True
        if "upline_email" not in u:
            u["upline_email"] = None
            changed = True
        if "projects_interested" not in u:
            u["projects_interested"] = []
            changed = True
        if "favorites" not in u:
            u["favorites"] = []
            changed = True
        if "telegram_chat_id" not in u:
            u["telegram_chat_id"] = None
            changed = True
        # Khách hàng (client) không có mã giới thiệu; chỉ sinh cho admin/sale.
        if u.get("role") != "client" and not u.get("referral_code"):
            code = _gen_referral_code(u.get("full_name", ""), existing_codes)
            u["referral_code"] = code
            existing_codes.add(code)
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


def _mirror(user: dict) -> None:
    """Dual-write best-effort sang Postgres (giai đoạn dual-write Sprint 1.1).

    JSON vẫn là nguồn sự thật ở release này; Postgres được ghi song song để
    sẵn sàng cho Phase 2. Mọi lỗi đều nuốt — KHÔNG được ảnh hưởng luồng JSON.
    """
    try:
        from app.db.user_mirror import mirror_user

        mirror_user(user)
    except Exception:  # noqa: BLE001
        pass


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
    dob: Optional[str] = None,
    region: Optional[str] = None,
    upline_email: Optional[str] = None,
    projects_interested: Optional[list[str]] = None,
    source: Optional[str] = None,
    facebook_url: Optional[str] = None,
) -> dict:
    with _LOCK:
        data = _load()
        email_l = email.strip().lower()
        existing_codes = {
            u["referral_code"] for u in data["users"] if u.get("referral_code")
        }
        for u in data["users"]:
            if u["email"].lower() == email_l:
                raise ValueError("Email đã được đăng ký")
        full_name_clean = full_name.strip()
        # Khách hàng không có mã giới thiệu (không tham gia hệ thống hoa hồng).
        referral_code = (
            None
            if role == "client"
            else _gen_referral_code(full_name_clean, existing_codes)
        )
        new_user = {
            "id": str(uuid.uuid4()),
            "email": email_l,
            "full_name": full_name_clean,
            "phone": (phone or "").strip() or None,
            "role": role,
            "is_active": is_active,
            "dob": (dob or "").strip() or None,
            "region": (region or "").strip() or None,
            "upline_email": (upline_email or "").strip().lower() or None,
            "referral_code": referral_code,
            "projects_interested": list(projects_interested or []),
            "favorites": [],
            "telegram_chat_id": None,
            "source": (source or "").strip() or None,
            "facebook_url": (facebook_url or "").strip() or None,
            "password_hash": password_hash,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        data["users"].append(new_user)
        _save(data)
        _mirror(new_user)
        return new_user


def find_by_referral_code(code: str) -> Optional[dict]:
    code_l = code.strip().lower()
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if (u.get("referral_code") or "").lower() == code_l:
                return u
    return None


def list_downlines(email: str) -> list[dict]:
    """Danh sách user nhận `email` này làm người giới thiệu (upline)."""
    email_l = email.strip().lower()
    with _LOCK:
        data = _load()
        return [
            u for u in data["users"]
            if (u.get("upline_email") or "").lower() == email_l
        ]


def update_profile(
    user_id: str,
    *,
    full_name: Optional[str] = None,
    phone: Optional[str] = None,
    dob: Optional[str] = None,
    region: Optional[str] = None,
    projects_interested: Optional[list[str]] = None,
) -> Optional[dict]:
    """Cập nhật hồ sơ cá nhân. Trả về user đã cập nhật, None nếu không tìm thấy."""
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                if full_name is not None and full_name.strip():
                    u["full_name"] = full_name.strip()
                if phone is not None:
                    u["phone"] = phone.strip() or None
                if dob is not None:
                    u["dob"] = dob.strip() or None
                if region is not None:
                    u["region"] = region.strip() or None
                if projects_interested is not None:
                    u["projects_interested"] = list(projects_interested)
                _save(data)
                _mirror(u)
                return u
    return None


def add_favorite(user_id: str, unit_id: str) -> Optional[list[str]]:
    """Thêm 1 căn vào danh sách yêu thích. Trả về list mới (đã khử trùng lặp)."""
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                favs = u.get("favorites") or []
                if unit_id not in favs:
                    favs.append(unit_id)
                u["favorites"] = favs
                _save(data)
                _mirror(u)
                return favs
    return None


def remove_favorite(user_id: str, unit_id: str) -> Optional[list[str]]:
    """Xoá 1 căn khỏi danh sách yêu thích. Trả về list còn lại."""
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                favs = [x for x in (u.get("favorites") or []) if x != unit_id]
                u["favorites"] = favs
                _save(data)
                _mirror(u)
                return favs
    return None


def get_favorites(user_id: str) -> list[str]:
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                return list(u.get("favorites") or [])
    return []


def set_telegram_chat_id(user_id: str, chat_id: Optional[str]) -> Optional[dict]:
    """Liên kết / huỷ liên kết Telegram chat_id cho user. None để gỡ liên kết."""
    chat_id_clean = (str(chat_id).strip() or None) if chat_id is not None else None
    with _LOCK:
        data = _load()
        # Bảo đảm 1 chat_id chỉ gắn cho 1 user (gỡ ở user cũ nếu trùng).
        if chat_id_clean:
            for u in data["users"]:
                if u.get("telegram_chat_id") == chat_id_clean and u["id"] != user_id:
                    u["telegram_chat_id"] = None
        for u in data["users"]:
            if u["id"] == user_id:
                u["telegram_chat_id"] = chat_id_clean
                _save(data)
                _mirror(u)
                return u
    return None


def find_by_telegram_chat_id(chat_id: str) -> Optional[dict]:
    chat_id_clean = str(chat_id).strip()
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u.get("telegram_chat_id") == chat_id_clean:
                return u
    return None


def list_active_sales(days: int = 7) -> list[dict]:
    """Sale đang hoạt động — MVP: tài khoản role=sale còn mở (is_active).

    Tham số `days` để dành cho khi có tracking last_active_at (giai đoạn 2);
    hiện chưa lưu hoạt động theo thời gian nên trả toàn bộ sale đang mở.
    """
    with _LOCK:
        data = _load()
        return [
            u
            for u in data["users"]
            if u.get("role") == "sale" and u.get("is_active", True)
        ]


def set_password(user_id: str, password_hash: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for u in data["users"]:
            if u["id"] == user_id:
                u["password_hash"] = password_hash
                _save(data)
                _mirror(u)
                return u
    return None


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
                _mirror(u)
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
        "dob": user.get("dob"),
        "region": user.get("region"),
        "referral_code": user.get("referral_code"),
        "upline_email": user.get("upline_email"),
        "projects_interested": user.get("projects_interested") or [],
        "favorites": user.get("favorites") or [],
        "telegram_chat_id": user.get("telegram_chat_id"),
        "created_at": user["created_at"],
    }
