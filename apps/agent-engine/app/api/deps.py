"""FastAPI dependencies — auth current user."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from typing import Optional

import jwt

from app.core import user_store
from app.core.security import decode_access_token


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu token Bearer",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token thiếu subject")
    user = user_store.find_by_id(sub)
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khoá")
    return user


CurrentUser = Depends(get_current_user)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency đảm bảo user hiện tại có role admin."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền quản trị viên",
        )
    return user
