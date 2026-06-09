"""Schema cho tính năng Đồng bộ tài liệu từ Google Drive.

Luồng: admin dán link folder Drive → backend list toàn bộ file (recursive) →
tải về → lưu vào learning_store (persist Volume) → re-index BM25 cho RAG chatbot.

Chạy nền (BackgroundTasks) nên trả job_id ngay; client poll trạng thái qua
GET /admin/documents/sync-drive/jobs/{job_id}.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class DriveSyncRequest(BaseModel):
    """Tham số khởi chạy 1 lần đồng bộ."""

    folder_url: str = Field(
        description="Link folder Google Drive (chứa folders/<id> trong URL)"
    )
    project_slug: str = Field(
        default="eurowindow-light-city", description="Slug dự án (gắn metadata)"
    )
    skip_existing: bool = Field(
        default=True, description="Bỏ qua file đã có (so khớp theo content hash)"
    )
    reindex_rag: bool = Field(
        default=True, description="Build lại chỉ mục BM25 cho chatbot sau khi sync"
    )


class DriveSyncFileResult(BaseModel):
    """Kết quả xử lý 1 file trong lần sync."""

    file_id: str
    name: str
    category: str
    status: Literal["uploaded", "skipped", "failed"]
    error: Optional[str] = None
    size_bytes: int = 0
    document_id: Optional[str] = None


class DriveSyncResult(BaseModel):
    """Tổng kết 1 lần sync — lưu vào lịch sử + đính kèm job khi hoàn tất."""

    success: bool
    total_files: int = 0
    uploaded: int = 0
    skipped: int = 0
    failed: int = 0
    files: List[DriveSyncFileResult] = Field(default_factory=list)
    rag_chunks_added: int = 0
    synced_at: datetime
    triggered_by_user_id: Optional[str] = None
    duration_seconds: float = 0.0
    error: Optional[str] = None


class DriveSyncJob(BaseModel):
    """Trạng thái 1 job nền (cho UI poll tiến độ)."""

    job_id: str
    status: Literal[
        "queued", "listing", "downloading", "indexing", "completed", "failed"
    ]
    folder_url: str = ""
    total_files: int = 0
    processed: int = 0
    uploaded: int = 0
    skipped: int = 0
    failed: int = 0
    current_file: str = ""
    progress: int = 0  # 0..100
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    result: Optional[DriveSyncResult] = None


class DriveSyncStartResponse(BaseModel):
    job_id: str
    status: str
