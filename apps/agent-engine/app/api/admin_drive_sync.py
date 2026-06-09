"""Admin — Đồng bộ tài liệu chính thống từ Google Drive vào KB/RAG.

Endpoints (đều yêu cầu role admin):
  POST   /admin/documents/sync-drive            → khởi chạy job nền, trả job_id
  GET    /admin/documents/sync-drive/jobs/{id}  → trạng thái + tiến độ job
  GET    /admin/documents/sync-drive/history    → lịch sử các lần sync
  GET    /admin/documents                       → list tài liệu (master view, lọc/tìm/phân trang)

Job chạy nền qua BackgroundTasks (không block request). Tiến độ ghi xuống
data/_runtime/drive_sync_jobs.json để UI poll.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.api.deps import get_current_user, require_admin
from app.core import drive_sync, learning_store
from app.core.settings import settings
from app.schemas.drive_sync import (
    DriveSyncJob,
    DriveSyncRequest,
    DriveSyncResult,
    DriveSyncStartResponse,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-drive-sync"])


async def _run_job(job_id: str, request: DriveSyncRequest, user_id: Optional[str]):
    try:
        await drive_sync.run_sync_job(job_id, request, user_id)
    except Exception as e:  # noqa: BLE001
        log.exception("drive_sync job %s lỗi không bắt được: %s", job_id, e)
        drive_sync.update_job(job_id, status="failed", error=str(e)[:300])


@router.post("/documents/sync-drive", response_model=DriveSyncStartResponse)
async def sync_from_drive(
    request: DriveSyncRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_admin),
) -> DriveSyncStartResponse:
    """Khởi chạy đồng bộ Drive (nền). Trả job_id để theo dõi tiến độ."""
    if not drive_sync.extract_folder_id(request.folder_url):
        raise HTTPException(400, "Link folder Drive không hợp lệ (thiếu folders/<id>).")
    job_id = str(uuid.uuid4())
    drive_sync.create_job(job_id, request.folder_url)
    background_tasks.add_task(_run_job, job_id, request, current_user.get("email"))
    log.info(
        "drive_sync.start email=%s job=%s folder=%s",
        current_user.get("email"), job_id, request.folder_url,
    )
    return DriveSyncStartResponse(job_id=job_id, status="started")


@router.get("/documents/sync-drive/jobs/{job_id}", response_model=DriveSyncJob)
def get_sync_job(job_id: str, _admin: dict = Depends(require_admin)) -> DriveSyncJob:
    job = drive_sync.get_job(job_id)
    if not job:
        raise HTTPException(404, "Không tìm thấy job đồng bộ")
    return DriveSyncJob(**job)


@router.get("/documents/sync-drive/history", response_model=list[DriveSyncResult])
def sync_history(_admin: dict = Depends(require_admin)) -> list[DriveSyncResult]:
    return [DriveSyncResult(**h) for h in drive_sync.list_history()]


@router.get("/documents/sync-drive/config")
def sync_config(_admin: dict = Depends(require_admin)) -> dict:
    """Gợi ý cấu hình cho UI (folder mặc định + tình trạng kết nối Google)."""
    from app.core.google_meet import is_configured

    return {
        "default_folder_url": settings.drive_default_folder_url,
        "google_configured": is_configured(),
    }


@router.get("/documents")
def list_documents(
    category: Optional[str] = None,
    search: Optional[str] = None,
    source: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Master view toàn bộ tài liệu trong learning_store (lọc + tìm + phân trang)."""
    docs = learning_store.list_documents(category)
    if source:
        docs = [d for d in docs if d.get("source", "upload") == source]
    if search:
        q = search.strip().lower()
        docs = [d for d in docs if q in (d.get("title", "").lower())]
    total = len(docs)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    start = (page - 1) * page_size
    items = docs[start : start + page_size]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": d["id"],
                "title": d.get("title", ""),
                "category": d.get("category", "other"),
                "type": d.get("type", ""),
                "size": d.get("size", 0),
                "source": d.get("source", "upload"),
                "chunks": d.get("chunks", 0),
                "indexed": d.get("indexed", False),
                "uploaded_by": d.get("uploaded_by"),
                "created_at": d.get("created_at"),
                "download_url": f"/learning/documents/{d['id']}/download",
            }
            for d in items
        ],
    }
