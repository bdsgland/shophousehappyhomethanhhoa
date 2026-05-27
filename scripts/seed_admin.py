"""Seed tài khoản admin mặc định cho hệ thống Agent Proptech (MVP).

Chạy:
    cd apps/agent-engine
    source .venv/bin/activate
    python ../../scripts/seed_admin.py

Hành vi:
- Nếu users.json đã có ít nhất 1 user role=admin → bỏ qua, in thông báo.
- Nếu chưa có:
    1. Sinh mật khẩu ngẫu nhiên 16 ký tự (chữ + số + ký tự đặc biệt).
    2. Tạo user admin@rai-elc.local với hash bcrypt.
    3. In MỘT LẦN ra stdout: EMAIL + PASSWORD (phải lưu ngay, không tái sinh).
    4. Tạo file flag data/_runtime/.admin_seeded để mọi lần chạy lại đều no-op.

Có thể chạy nhiều lần an toàn — idempotent.
"""

from __future__ import annotations

import secrets
import string
import sys
from pathlib import Path

# Thêm apps/agent-engine vào sys.path để import được package `app`
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
ENGINE_DIR = REPO_ROOT / "apps" / "agent-engine"
sys.path.insert(0, str(ENGINE_DIR))

from app.core import user_store  # noqa: E402
from app.core.security import hash_password  # noqa: E402

ADMIN_EMAIL = "admin@rai-elc.com"
PASSWORD_LEN = 16
SEEDED_FLAG = ENGINE_DIR.parent.parent / "data" / "_runtime" / ".admin_seeded"


def _generate_password(length: int = PASSWORD_LEN) -> str:
    """Sinh mật khẩu mạnh: bắt buộc có chữ hoa, chữ thường, số, ký tự đặc biệt."""
    specials = "!@#$%^&*-_=+"
    alphabet = string.ascii_letters + string.digits + specials
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
            and any(c in specials for c in pw)
        ):
            return pw


def main() -> int:
    existing_admin = next(
        (u for u in user_store.list_users() if u.get("role") == "admin"), None
    )
    if existing_admin:
        print(
            f"[seed_admin] Đã có admin ({existing_admin['email']}). "
            "Bỏ qua. Nếu quên mật khẩu, xoá user trong users.json rồi chạy lại."
        )
        return 0

    password = _generate_password()
    user_store.create_user(
        email=ADMIN_EMAIL,
        full_name="Quản trị viên hệ thống",
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )

    SEEDED_FLAG.parent.mkdir(parents=True, exist_ok=True)
    SEEDED_FLAG.write_text("seeded\n", encoding="utf-8")

    bar = "=" * 60
    print(bar)
    print("TÀI KHOẢN ADMIN MỚI ĐƯỢC TẠO — LƯU NGAY, KHÔNG IN LẠI!")
    print(bar)
    print(f"  EMAIL    : {ADMIN_EMAIL}")
    print(f"  PASSWORD : {password}")
    print(bar)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
