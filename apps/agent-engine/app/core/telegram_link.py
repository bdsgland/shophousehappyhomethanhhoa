"""Liên kết tài khoản Sale với Telegram chat_id qua token dùng-một-lần.

Luồng:
  1. Sale bấm "Liên kết Telegram" ở /agent/profile → FE gọi
     POST /me/telegram/link-token → backend issue token, trả deep-link
     `https://t.me/<bot>?start=<token>`.
  2. Sale mở link, bấm Start → Telegram gửi `/start <token>` cho bot.
  3. Bot (qua n8n hoặc webhook) gọi POST /me/telegram/link với
     {verification_token, chat_id} → backend consume token, set chat_id cho user.

Token sống ngắn (mặc định 15 phút), lưu in-memory. Giai đoạn 2 chuyển sang Redis.
"""

from __future__ import annotations

import secrets
import threading
import time
from typing import Optional

_LOCK = threading.Lock()
_TTL_SECONDS = 15 * 60

# token -> (user_id, expires_at_epoch)
_TOKENS: dict[str, tuple[str, float]] = {}


def _purge_expired(now: float) -> None:
    expired = [t for t, (_, exp) in _TOKENS.items() if exp < now]
    for t in expired:
        _TOKENS.pop(t, None)


def issue_token(user_id: str, ttl_seconds: int = _TTL_SECONDS) -> str:
    """Sinh token mới gắn với user_id (mỗi user chỉ giữ token mới nhất)."""
    now = time.time()
    token = secrets.token_urlsafe(18)
    with _LOCK:
        _purge_expired(now)
        # Huỷ token cũ của user này để tránh tích tụ.
        for t, (uid, _) in list(_TOKENS.items()):
            if uid == user_id:
                _TOKENS.pop(t, None)
        _TOKENS[token] = (user_id, now + ttl_seconds)
    return token


def consume_token(token: str) -> Optional[str]:
    """Đổi token lấy user_id (dùng-một-lần). Trả None nếu sai/hết hạn."""
    now = time.time()
    with _LOCK:
        _purge_expired(now)
        entry = _TOKENS.pop(token, None)
    if not entry:
        return None
    user_id, exp = entry
    if exp < now:
        return None
    return user_id


def deep_link(bot_username: str, token: str) -> str:
    """Dựng link mở bot Telegram kèm token (Telegram gửi `/start <token>`)."""
    username = bot_username.lstrip("@")
    return f"https://t.me/{username}?start={token}"


def clear() -> None:
    """Dùng trong test."""
    with _LOCK:
        _TOKENS.clear()
