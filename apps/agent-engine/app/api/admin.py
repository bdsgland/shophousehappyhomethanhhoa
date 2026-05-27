"""Endpoint quản trị (yêu cầu role=admin).

- GET   /admin/overview      → tổng số user theo role, tổng lead
- GET   /admin/users         → list user (không kèm password_hash)
- PATCH /admin/users/{id}    → đổi role / is_active
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api import leads as leads_module
from app.api.deps import require_admin
from app.core import user_store
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
def overview(_admin: dict = Depends(require_admin)) -> dict:
    users = user_store.list_users()
    by_role: dict[str, int] = {}
    active = 0
    for u in users:
        by_role[u.get("role", "sale")] = by_role.get(u.get("role", "sale"), 0) + 1
        if u.get("is_active", True):
            active += 1
    return {
        "users_total": len(users),
        "users_active": active,
        "users_by_role": by_role,
        "leads_total": len(leads_module._LEADS),
        "backend_status": "ok",
    }


@router.get("/users", response_model=list[UserOut])
def list_users(_admin: dict = Depends(require_admin)) -> list[UserOut]:
    return [UserOut(**user_store.public_view(u)) for u in user_store.list_users()]


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    payload: UserUpdate,
    admin: dict = Depends(require_admin),
) -> UserOut:
    if payload.role is None and payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cần ít nhất một trường: role hoặc is_active",
        )

    # Chặn admin tự khoá / tự hạ quyền chính mình (tránh khoá toàn bộ hệ thống).
    if user_id == admin["id"]:
        if payload.role is not None and payload.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự hạ quyền admin của chính mình",
            )
        if payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự khoá tài khoản của chính mình",
            )

    updated = user_store.update_user(
        user_id, role=payload.role, is_active=payload.is_active
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User không tồn tại")
    return UserOut(**user_store.public_view(updated))
