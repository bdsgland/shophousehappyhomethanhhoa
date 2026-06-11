"""API KEYS — router admin (/admin/api-keys).

Cho phép admin TẠO & QUẢN LÝ API key TOÀN QUYỀN (scope admin_full) để công cụ
ngoài (OpenClaw / script / tích hợp) điều khiển hệ thống qua:
  • REST API trên https://api.eurowindowlightcity.net/docs (nút Authorize → Bearer).
  • MCP server tại /mcp (header X-Api-Key hoặc Authorization: Bearer elc_sk_...).

Endpoints (CHỈ require_admin — chỉ admin được tạo/thu hồi):
  GET    /admin/api-keys           — danh sách key (ĐÃ CHE secret).
  POST   /admin/api-keys           — tạo key mới, TRẢ plaintext 1 LẦN DUY NHẤT.
  DELETE /admin/api-keys/{key_id}  — thu hồi key.
  GET    /admin/api-keys/whoami    — test nhanh: gọi bằng API key/JWT để kiểm tra
                                     quyền (dùng để bấm Authorize trên /docs rồi thử).

AN TOÀN: secret chỉ hash; list/POST(sau khi tạo) trả masked; plaintext chỉ xuất
hiện đúng 1 lần trong response POST. Mọi thao tác ghi audit (admin.api_key.*) —
KHÔNG bao giờ log plaintext/hash.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import require_admin, require_api_key_or_admin
from app.core import api_keys_store, audit_store

router = APIRouter(prefix="/admin/api-keys", tags=["api-keys"])


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, description="Tên gợi nhớ cho khoá")
    scope: str = Field(default=api_keys_store.DEFAULT_SCOPE, description='Hiện hỗ trợ "admin_full"')


@router.get("")
def list_api_keys(_admin: dict = Depends(require_admin)) -> dict:
    """Danh sách API key (secret đã che — chỉ prefix + 4 ký tự cuối)."""
    return {"keys": api_keys_store.list_public()}


@router.post("", status_code=201)
def create_api_key(
    payload: ApiKeyCreate = Body(...),
    admin: dict = Depends(require_admin),
) -> dict:
    """Tạo API key mới. Trả về `plaintext` 1 LẦN DUY NHẤT — không thể xem lại."""
    try:
        view = api_keys_store.create_key(
            payload.name, scope=payload.scope, by=admin.get("id")
        )
    except api_keys_store.ApiKeyError as e:
        raise HTTPException(400, str(e))
    # Audit: CHỈ id + tên + scope, KHÔNG plaintext/hash.
    audit_store.record_admin(
        "api_key.create",
        admin,
        target=view.get("id"),
        new_value={"name": view.get("name"), "scope": view.get("scope")},
    )
    return view


@router.delete("/{key_id}")
def revoke_api_key(key_id: str, admin: dict = Depends(require_admin)) -> dict:
    """Thu hồi 1 API key (giữ bản ghi để audit, không xoá cứng)."""
    view = api_keys_store.revoke_key(key_id)
    if view is None:
        raise HTTPException(404, "Không tìm thấy API key.")
    audit_store.record_admin("api_key.revoke", admin, target=key_id)
    return view


@router.get("/whoami")
def whoami(principal: dict = Depends(require_api_key_or_admin)) -> dict:
    """Kiểm tra nhanh thông tin xác thực hiện tại (API key TOÀN QUYỀN hoặc JWT admin).

    Dùng để THỬ key ngay trên /docs: bấm Authorize, dán `elc_sk_...`, gọi endpoint
    này — trả về danh tính principal nếu key hợp lệ.
    """
    return {
        "authenticated": True,
        "id": principal.get("id"),
        "role": principal.get("role"),
        "name": principal.get("full_name"),
        "via": "api_key" if principal.get("principal") == "api_key" else "jwt",
        "scope": principal.get("scope"),
    }
