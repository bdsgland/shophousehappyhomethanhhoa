"""Schema cho Sale Learning Center (thư viện tài liệu + RAG + phiếu báo giá).

Phục vụ router app/api/learning.py. Tách bạch 3 nhóm:
- LearningDocument: metadata tài liệu đã upload + index RAG.
- Quote: phiếu báo giá (input form + bản ghi đã sinh PDF).
- LearningQuestion / search: hỏi đáp AI có trích dẫn nguồn.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# Các nhóm tài liệu hiển thị/lọc ở UI. Đồng bộ với label tiếng Việt bên frontend.
# Bổ sung các nhóm sinh ra từ đồng bộ Google Drive (master_plan, units, legal,
# media, other) — xem app/core/drive_sync.classify_category.
DocumentCategory = Literal[
    "policy",  # Chính sách bán hàng / hoa hồng
    "pricing",  # Bảng giá / phiếu tính giá
    "contract",  # Hợp đồng / pháp lý
    "brochure",  # Tài liệu giới thiệu / marketing
    "training",  # Đào tạo sale
    "master_plan",  # Bản đồ / mặt bằng / phân khu
    "units",  # Thiết kế căn / loại căn
    "legal",  # Pháp lý / giấy phép
    "media",  # Video / hình ảnh / review
    "other",  # Khác
]

CATEGORIES: tuple[str, ...] = (
    "policy",
    "pricing",
    "contract",
    "brochure",
    "training",
    "master_plan",
    "units",
    "legal",
    "media",
    "other",
)


class LearningDocument(BaseModel):
    """Metadata 1 tài liệu trong thư viện."""

    id: str = Field(description="ID tài liệu (uuid)")
    title: str = Field(description="Tiêu đề hiển thị")
    category: DocumentCategory = Field(description="Nhóm tài liệu")
    type: str = Field(description="Phần mở rộng/định dạng (pdf, docx, xlsx, png…)")
    size: int = Field(description="Kích thước file (byte)")
    file_path: str = Field(description="Đường dẫn lưu trữ tương đối (nội bộ)")
    version: int = Field(default=1, description="Phiên bản tài liệu")
    chunks: int = Field(default=0, description="Số đoạn đã index vào RAG")
    indexed: bool = Field(default=False, description="Đã index RAG xong chưa")
    uploaded_by: Optional[str] = Field(default=None, description="Email người upload")
    indexed_at: Optional[datetime] = Field(default=None, description="Thời điểm index")
    download_url: str = Field(default="", description="URL tải file")
    # Nhóm theo thư mục Drive (subfolder trực tiếp chứa file) khi đồng bộ; None
    # nếu tải tay hoặc file ở folder gốc.
    group: Optional[str] = Field(default=None, description="Nhóm theo thư mục Drive")
    source: str = Field(default="upload", description="Nguồn: upload | google_drive")
    project_slug: Optional[str] = Field(
        default=None, description="Slug dự án gắn tài liệu (để lọc theo dự án)"
    )


class ProjectDocumentOut(BaseModel):
    """Tài liệu hiển thị ở mục Tài liệu trang Chi tiết dự án (portal khách)."""

    id: str
    title: str
    type: str
    size: int
    group: Optional[str] = None
    category: str = "other"
    source: str = "upload"
    updated: Optional[str] = None
    download_url: str = ""


class UploadResponse(BaseModel):
    document_id: str
    title: str
    type: str
    size: int
    category: DocumentCategory
    chunks: int
    indexed_at: Optional[datetime] = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, description="Câu truy vấn ngữ nghĩa")
    top_k: int = Field(default=5, ge=1, le=20, description="Số đoạn trả về")
    category: Optional[DocumentCategory] = Field(
        default=None, description="Giới hạn theo nhóm tài liệu"
    )


class SearchPassage(BaseModel):
    document_id: str
    title: str
    category: str
    source_file: str
    chunk_index: int
    score: float
    text: str


class SearchResponse(BaseModel):
    query: str
    passages: List[SearchPassage]


class AskRequest(BaseModel):
    question: str = Field(min_length=1, description="Câu hỏi của sale")
    session_id: Optional[str] = Field(default=None, description="ID phiên hội thoại")
    top_k: int = Field(default=5, ge=1, le=12)


class AskSource(BaseModel):
    document_id: str
    title: str
    category: str
    source_file: str
    score: float
    snippet: str


class AskResponse(BaseModel):
    """Trả về khi gọi /learning/ask ở chế độ non-stream (fallback / test)."""

    session_id: Optional[str] = None
    answer: str
    sources: List[AskSource] = Field(default_factory=list)


# ----- Phiếu báo giá -----


class QuoteRequest(BaseModel):
    unit_id: str = Field(description="Mã căn trong quỹ hàng (vd BM-01)")
    customer_name: str = Field(min_length=1)
    customer_phone: str = Field(default="", description="SĐT khách")
    sale_name: str = Field(default="", description="Tên sale lập phiếu")
    sale_phone: str = Field(default="", description="SĐT sale")
    payment_plan: Literal["standard", "fast", "loan"] = Field(
        default="standard",
        description="standard=tiến độ chuẩn, fast=thanh toán nhanh, loan=vay NH",
    )
    discount_pct: float = Field(default=0.0, ge=0, le=50, description="Chiết khấu %")
    note: Optional[str] = Field(default=None, description="Ghi chú thêm")


class PaymentMilestone(BaseModel):
    label: str
    pct: float
    amount: float


class QuoteResponse(BaseModel):
    quote_id: str
    unit_id: str
    customer_name: str
    sale_name: str
    list_price: float = Field(description="Giá niêm yết (VND)")
    discount_pct: float
    discount_amount: float
    total_price: float = Field(description="Giá sau chiết khấu (VND)")
    payment_plan: str
    milestones: List[PaymentMilestone]
    pdf_url: str
    created_at: datetime
