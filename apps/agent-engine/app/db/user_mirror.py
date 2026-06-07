"""Dual-write: phản chiếu (mirror) user JSON sang bảng Postgres `users`.

GIAI ĐOẠN dual-write (Sprint 1.1): JSON vẫn là *nguồn sự thật* (read path đọc
JSON), Postgres được ghi song song để build dữ liệu sẵn sàng cho Phase 2 (khi
đó mới chuyển read sang Postgres). Mọi hàm ở đây là **best-effort**: lỗi DB
không bao giờ làm hỏng luồng JSON — chỉ log cảnh báo.

Cơ chế: upsert theo khoá chính `id` (uuid ổn định do user_store sinh). Nhờ
upsert toàn bộ bản ghi nên gọi lặp lại là idempotent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.db import session as db


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip().replace("Z", "")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _apply(row, u: dict) -> None:
    """Gán field từ dict JSON `u` vào ORM row `row`."""
    row.email = (u.get("email") or "").strip().lower()
    row.full_name = u.get("full_name") or ""
    row.phone = u.get("phone")
    row.role = u.get("role") or "sale"
    row.is_active = bool(u.get("is_active", True))
    row.password_hash = u.get("password_hash")
    row.referral_code = u.get("referral_code")
    row.upline_email = u.get("upline_email")
    row.dob = u.get("dob")
    row.region = u.get("region")
    row.source = u.get("source")
    row.facebook_url = u.get("facebook_url")
    row.telegram_chat_id = u.get("telegram_chat_id")
    row.projects_interested = list(u.get("projects_interested") or [])
    row.favorites = list(u.get("favorites") or [])
    created = _parse_dt(u.get("created_at"))
    if created is not None:
        row.created_at = created


def mirror_user(u: dict) -> bool:
    """Upsert 1 user (dict JSON) sang Postgres. Trả True nếu đã ghi.

    No-op (trả False) nếu Postgres chưa sẵn sàng — không raise.
    """
    if not db.is_healthy():
        return False
    try:
        from app.db.models import User

        with db.db_session() as s:
            if s is None:
                return False
            row = s.get(User, u["id"])
            if row is None:
                row = User(id=u["id"])
                _apply(row, u)
                s.add(row)
            else:
                _apply(row, u)
        return True
    except Exception as e:  # noqa: BLE001 — dual-write không được làm vỡ JSON
        print(f"[DUAL-WRITE] mirror_user bỏ qua (id={u.get('id')}): "
              f"{type(e).__name__}: {e}")
        # Một lỗi đơn lẻ không nên tắt cả kênh; nhưng nếu kết nối hỏng hẳn,
        # init_db lúc startup đã set unhealthy nên ta hiếm khi vào đây.
        return False


def backfill_users() -> int:
    """Mirror toàn bộ user JSON hiện có sang Postgres (idempotent upsert).

    Gọi 1 lần lúc startup sau init_db → đảm bảo các user tạo TRƯỚC khi bật
    dual-write (admin, sale, client cũ) cũng có mặt đầy đủ trong Postgres,
    sẵn sàng cho Phase 2 chuyển read sang Postgres. Trả về số bản ghi đã mirror.
    """
    if not db.is_healthy():
        return 0
    try:
        from app.core import user_store

        users = user_store.list_users()
    except Exception:  # noqa: BLE001
        return 0
    count = 0
    for u in users:
        if mirror_user(u):
            count += 1
    return count
