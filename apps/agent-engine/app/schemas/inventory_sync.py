"""Schemas cho luồng đồng bộ quỹ căn (inventory) từ Google Sheets.

LƯU Ý kiến trúc: bản thân "đơn vị căn" (unit) trong store vẫn dùng dict với
field tiếng Việt cũ (`id, lo, phan_khu, loai, dien_tich, mat_tien, trang_thai,
gia_tri, gia, position`) để KHÔNG phá vỡ các consumer hiện có (client.py,
admin.py, bookings.py, n8n_stubs.py, learning.py, frontend admin). Sync chỉ MỞ
RỘNG thêm field min-max giá + metadata sheet (gia_min/gia_max/huong/view/duong…).

Các schema dưới đây chỉ phục vụ request/response của API sync.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class InventorySyncRequest(BaseModel):
    """Request đồng bộ: admin dán link Google Sheets."""

    sheet_url: str = Field(..., description="Link Google Sheets (bất kỳ dạng share nào)")
    sheet_gid: int = Field(default=0, description="gid của tab cần đọc (mặc định 0)")
    replace_all: bool = Field(
        default=True,
        description="True = thay thế toàn bộ (soft-delete căn không còn trong sheet); "
        "False = chỉ upsert, giữ nguyên căn cũ.",
    )


class InventorySyncResult(BaseModel):
    """Kết quả 1 lần sync — cũng là 1 dòng trong lịch sử sync."""

    success: bool
    total_units: int = 0  # tổng số căn hợp lệ đọc được từ sheet
    created: int = 0
    updated: int = 0
    deleted: int = 0  # số căn bị soft-delete (chỉ khi replace_all)
    errors: list[str] = Field(default_factory=list)
    sheet_url: str = ""
    sheet_gid: int = 0
    synced_at: datetime
    synced_by_user_id: Optional[str] = None
    synced_by_name: Optional[str] = None
    backup_file: Optional[str] = None  # tên file backup tạo trước khi sync


class InventoryBackupInfo(BaseModel):
    """Thông tin 1 bản backup để hiển thị/khôi phục."""

    timestamp: str
    filename: str
    size_bytes: int
    unit_count: int
