"""Schema cho luồng Import khách CRM đa nguồn (Google Sheet + file CSV/XLSX).

Hai bước: PARSE (đọc nguồn → headers + rows + gợi ý mapping) rồi COMMIT (admin
chỉnh mapping → tạo lead). Parse trả nguyên rows để FE giữ, commit gửi lại rows
+ mapping → KHÔNG cần upload/đọc Sheet lần hai.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.crm import LeadSource, LeadStatus


class ColumnMapping(BaseModel):
    """Map trường hệ thống ↔ tên cột (header) trong nguồn dữ liệu."""

    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    note: Optional[str] = None
    demand: Optional[str] = None


class SheetParseRequest(BaseModel):
    sheet_url: str = Field(..., description="Link Google Trang tính (hoặc spreadsheetId)")
    sheet_name: Optional[str] = Field(default=None, description="Tên tab; trống = tab đầu")


class ParsePreview(BaseModel):
    """Kết quả parse: header + dữ liệu + gợi ý mapping để admin xem trước."""

    headers: list[str]
    rows: list[dict]  # mỗi dict key theo header
    total: int
    suggested_mapping: ColumnMapping
    sheet_names: Optional[list[str]] = None  # với Google Sheet
    source_label: Optional[str] = None  # "google_sheet" | "file_upload"


class ImportCommitRequest(BaseModel):
    """Commit import: rows (từ parse) + mapping admin đã chỉnh + tuỳ chọn."""

    rows: list[dict]
    mapping: ColumnMapping
    source: LeadSource = LeadSource.GOOGLE_SHEET
    assigned_sale_id: Optional[str] = Field(
        default=None, description="Gán cứng cho 1 sale; trống + auto_assign → chia vòng tròn"
    )
    auto_assign: bool = Field(default=False, description="Tự chia đều cho sale đang hoạt động")
    skip_duplicates: bool = True
    auto_care: bool = Field(default=True, description="Đưa vào hàng đợi chăm sóc AI")
    default_status: LeadStatus = LeadStatus.COLD


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[dict] = Field(default_factory=list)
    duplicates: list[dict] = Field(default_factory=list)
    created_ids: list[str] = Field(default_factory=list)
    ai_scored: int = 0  # số lead được chấm điểm AI ngay (Phần B điền)
