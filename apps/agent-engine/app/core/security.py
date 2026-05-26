"""Bảo mật MVP: hash mật khẩu bằng bcrypt, sinh/giải mã JWT bằng PyJWT.

Lưu ý production:
- JWT_SECRET BẮT BUỘC phải set qua .env / secrets manager — không dùng default.
- Bổ sung refresh token, rotation, blacklist.
- Bật HTTPS, secure cookie, SameSite=strict.
- Áp dụng rate-limit cho /auth/login và /auth/register.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
import jwt

from app.core.settings import settings


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _jwt_secret() -> str:
    secret = settings.jwt_secret
    if not secret:
        # An toàn cho dev: sinh secret tạm thời theo process. Sẽ invalidate token cũ
        # khi restart — chấp nhận được ở MVP, không chấp nhận ở production.
        secret = _RUNTIME_SECRET
    return secret


_RUNTIME_SECRET = secrets.token_urlsafe(48)


def create_access_token(
    subject: str, extra_claims: Optional[dict[str, Any]] = None
) -> tuple[str, int]:
    """Trả về (token, expires_in_seconds)."""
    now = datetime.now(tz=timezone.utc)
    expires_in = settings.jwt_expires_minutes * 60
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
        "iss": "agent-proptech",
    }
    if extra_claims:
        payload.update(extra_claims)
    token = jwt.encode(payload, _jwt_secret(), algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=[settings.jwt_algorithm],
        options={"require": ["exp", "iat", "sub"]},
    )
