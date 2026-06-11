"""HR — ma trận phân quyền theo vai trò (role × permission).

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust)
với app/core/user_store.py. File: data/_runtime/hr_roles.json:
  {
    "roles": {
      "admin": {"label_vi": "Quản trị", "permissions": {"view_reports": true, ...}},
      ...
    }
  }

LƯU Ý QUAN TRỌNG: ma trận này là lớp CẤU HÌNH/HIỂN THỊ dùng cho trang Nhân sự.
Nó KHÔNG thay thế và KHÔNG can thiệp vào các dependency phân quyền hiện có
(require_admin / require_sale ở app/api/deps.py) — để tránh phá vỡ luồng đang chạy.
Hàm has_permission() được cung cấp sẵn cho tương lai (nếu muốn enforce mềm) nhưng
mặc định KHÔNG được wire vào guard nào.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from app.core.settings import settings

_LOCK = threading.Lock()

# Danh mục quyền (key → nhãn tiếng Việt). Thứ tự hiển thị giữ nguyên list này.
PERMISSIONS_CATALOG: list[dict] = [
    {"key": "view_reports", "label_vi": "Xem báo cáo / dashboard"},
    {"key": "view_customers", "label_vi": "Xem khách hàng"},
    {"key": "manage_leads", "label_vi": "Quản lý lead / khách hàng"},
    {"key": "manage_inventory", "label_vi": "Quản lý quỹ căn"},
    {"key": "manage_finance", "label_vi": "Tài chính / hoa hồng"},
    {"key": "manage_marketing", "label_vi": "Marketing"},
    {"key": "manage_hr", "label_vi": "Nhân sự"},
    {"key": "manage_automation", "label_vi": "Automation"},
    {"key": "manage_settings", "label_vi": "Cấu hình hệ thống"},
]

_PERMISSION_KEYS = [p["key"] for p in PERMISSIONS_CATALOG]

# Nhãn tiếng Việt cho từng vai trò.
ROLE_LABELS: dict[str, str] = {
    "admin": "Quản trị",
    "manager": "Quản lý",
    "sale": "Sale",
    "marketing": "Marketing",
    "accountant": "Kế toán",
    "support": "Hỗ trợ / CSKH",
    "client": "Khách hàng",
}

# Ma trận mặc định: vai trò → tập quyền được bật.
_DEFAULT_GRANTS: dict[str, set[str]] = {
    "admin": set(_PERMISSION_KEYS),  # admin có toàn quyền
    "manager": {
        "view_reports", "view_customers", "manage_leads",
        "manage_inventory", "manage_automation",
    },
    "sale": {"view_reports", "view_customers", "manage_leads"},
    "marketing": {"view_reports", "view_customers", "manage_marketing"},
    "accountant": {"view_reports", "manage_finance"},
    "support": {"view_customers", "manage_leads"},
    "client": set(),
}


def _default_matrix() -> dict:
    roles: dict[str, dict] = {}
    for role, label in ROLE_LABELS.items():
        grants = _DEFAULT_GRANTS.get(role, set())
        roles[role] = {
            "label_vi": label,
            "permissions": {k: (k in grants) for k in _PERMISSION_KEYS},
        }
    return {"roles": roles}


def _file_path() -> Path:
    p = Path(settings.hr_roles_file)
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
        path.write_text(
            json.dumps(_default_matrix(), ensure_ascii=False, indent=2)
        )
    return path


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _migrate(data: dict) -> bool:
    """Bổ sung vai trò / quyền mới còn thiếu (tương thích khi mở rộng catalog)."""
    changed = False
    roles = data.setdefault("roles", {})
    for role, label in ROLE_LABELS.items():
        if role not in roles:
            grants = _DEFAULT_GRANTS.get(role, set())
            roles[role] = {
                "label_vi": label,
                "permissions": {k: (k in grants) for k in _PERMISSION_KEYS},
            }
            changed = True
            continue
        entry = roles[role]
        entry.setdefault("label_vi", label)
        perms = entry.setdefault("permissions", {})
        for k in _PERMISSION_KEYS:
            if k not in perms:
                # admin mặc định bật quyền mới; vai trò khác tắt cho an toàn.
                perms[k] = role == "admin"
                changed = True
    return changed


def _load() -> dict:
    path = _ensure_file()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if _migrate(data):
        _write(path, data)
    return data


def get_matrix() -> dict:
    """Trả ma trận quyền đầy đủ (catalog + roles) cho FE hiển thị."""
    data = _load()
    rows = []
    for role, label in ROLE_LABELS.items():
        entry = data["roles"].get(role, {})
        perms = entry.get("permissions", {})
        rows.append(
            {
                "role": role,
                "label_vi": entry.get("label_vi", label),
                "permissions": {k: bool(perms.get(k, False)) for k in _PERMISSION_KEYS},
            }
        )
    return {
        "permissions_catalog": list(PERMISSIONS_CATALOG),
        "roles": rows,
    }


def update_role_permissions(role: str, permissions: dict[str, bool]) -> dict:
    """Cập nhật quyền cho 1 vai trò. Chỉ nhận key có trong catalog.

    KHÔNG cho sửa vai trò 'admin' (luôn full quyền — tránh tự khoá quản trị).
    Trả ma trận mới.
    """
    if role == "admin":
        raise ValueError("Không thể chỉnh quyền vai trò admin (luôn toàn quyền).")
    if role not in ROLE_LABELS:
        raise ValueError(f"Vai trò không hợp lệ: {role}")
    with _LOCK:
        data = _load()
        entry = data["roles"].setdefault(
            role, {"label_vi": ROLE_LABELS[role], "permissions": {}}
        )
        perms = entry.setdefault("permissions", {})
        for k, v in permissions.items():
            if k in _PERMISSION_KEYS:
                perms[k] = bool(v)
        _write(_ensure_file(), data)
    return get_matrix()


def has_permission(role: str, permission: str) -> bool:
    """Kiểm tra 1 vai trò có 1 quyền hay không (helper, KHÔNG tự enforce).

    admin luôn True. Dùng được nếu sau này muốn enforce mềm ở tầng endpoint.
    """
    if role == "admin":
        return True
    data = _load()
    entry = data["roles"].get(role, {})
    return bool(entry.get("permissions", {}).get(permission, False))


def reset_to_default() -> dict:
    """Khôi phục ma trận mặc định."""
    with _LOCK:
        _write(_ensure_file(), _default_matrix())
    return get_matrix()
