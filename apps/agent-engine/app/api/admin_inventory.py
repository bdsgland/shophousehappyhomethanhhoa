"""Admin endpoints đồng bộ quỹ căn từ Google Sheets + backup/restore.

Tách khỏi admin.py để gọn. Tất cả yêu cầu quyền admin (require_admin). Prefix
`/admin/inventory` — KHÔNG đụng các route CRUD sẵn có trong admin.py
(`GET/POST /admin/inventory`, `PATCH/DELETE /admin/inventory/{id}`) vì path khác.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, require_admin
from app.core import inventory_store, inventory_sync
from app.schemas.inventory_sync import InventorySyncRequest

router = APIRouter(prefix="/admin/inventory", tags=["admin", "inventory"])


@router.post("/sync")
async def sync_inventory(
    payload: InventorySyncRequest,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Đồng bộ quỹ căn từ link Google Sheets (auto-backup trước khi ghi đè)."""
    result = await inventory_sync.sync_from_sheet(
        sheet_url=payload.sheet_url,
        replace_all=payload.replace_all,
        gid=payload.sheet_gid,
        user_id=user.get("id"),
        user_name=user.get("full_name") or user.get("email"),
    )
    return inventory_sync._serializable(result)


@router.get("/sync/history")
def sync_history(
    limit: int = 20,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Lịch sử các lần sync (mới nhất trước)."""
    return {"history": inventory_store.get_sync_history(limit=limit)}


@router.get("/backups")
def list_backups(_admin: dict = Depends(require_admin)) -> dict:
    """Danh sách bản backup quỹ căn (mới nhất trước)."""
    return {"backups": inventory_store.list_backups()}


@router.post("/restore/{backup_timestamp}")
def restore_inventory(
    backup_timestamp: str,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Khôi phục quỹ căn từ 1 bản backup (tự backup hiện trạng trước khi ghi)."""
    try:
        count = inventory_store.restore_from_backup(backup_timestamp)
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return {
        "success": True,
        "restored_units": count,
        "from_backup": backup_timestamp,
        "by": user.get("full_name") or user.get("email"),
    }
