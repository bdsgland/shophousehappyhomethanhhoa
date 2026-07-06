"""Schema "Dự án" (Project CMS) — NỘI DUNG BIÊN TẬP các tab trang Chi tiết dự án.

Đây là phần nội dung TỰ DO (editorial) mà admin sửa được + đồng bộ ra trang
sale/khách. KHÔNG bao gồm:
  - Quỹ căn / Mặt bằng  → inventory_store (app/api/inventory.py)
  - Tài liệu RAG        → learning_store (app/api/projects.py /documents)
  - Số liệu phiếu tính giá → sales_policy_store (app/api/sales_policy.py)

Các section lưu ở đây (khớp ĐÚNG shape dữ liệu mà
apps/web/components/dashboard/project-data.ts đang render, để web đọc thẳng + fallback
project-data khi store trống):
  overview, location, training, subzones, gallery360, policy(text), timeline, news

Lưu 1 object `ProjectDoc` / slug (JSON store: core/project_store.py, version +
backup, atomic). Admin chỉnh qua /admin/projects/{slug}.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# Danh sách section nội dung tự do hợp lệ (dùng cho PATCH section + ai-edit).
EDITABLE_SECTIONS = (
    "overview",
    "location",
    "training",
    "subzones",
    "gallery360",
    "policy",
    "timeline",
    "news",
)


# ---------------------------------------------------------------------------
# 1. Tổng quan
# ---------------------------------------------------------------------------
class HeroImage(BaseModel):
    src: str = ""
    caption: str = ""


class KeyValue(BaseModel):
    label: str = ""
    value: str = ""


class OverviewSection(BaseModel):
    hero_images: list[HeroImage] = Field(default_factory=list)
    rows: list[KeyValue] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 2. Vị trí
# ---------------------------------------------------------------------------
class Connection(BaseModel):
    place: str = ""
    time: str = ""


class LocationSection(BaseModel):
    description: str = ""
    connections: list[Connection] = Field(default_factory=list)
    map_lat: Optional[float] = None
    map_lng: Optional[float] = None


# ---------------------------------------------------------------------------
# 3. Đào tạo
# ---------------------------------------------------------------------------
class TrainingItem(BaseModel):
    title: str = ""
    size: str = ""
    date: str = ""
    href: str = "#"
    ready: bool = False


class TrainingSection(BaseModel):
    items: list[TrainingItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 4. Phân khu
# ---------------------------------------------------------------------------
class Subzone(BaseModel):
    name: str = ""
    style: str = ""
    units: str = ""
    desc: str = ""
    img: str = ""


class SubzonesSection(BaseModel):
    items: list[Subzone] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 7. Ảnh 360°
# ---------------------------------------------------------------------------
class Tour360(BaseModel):
    title: str = ""
    img: str = ""
    ready: bool = False


class Gallery360Section(BaseModel):
    items: list[Tour360] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 8. Chính sách bán hàng (phần MÔ TẢ editorial — số liệu giá ở sales_policy_store)
# ---------------------------------------------------------------------------
class PolicyCard(BaseModel):
    title: str = ""
    date: str = ""
    open: bool = False
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)


class PriceRow(BaseModel):
    # `from` là từ khoá Python → field price_from + alias "from" để khớp web.
    model_config = ConfigDict(populate_by_name=True)

    product: str = ""
    area: str = ""
    price_from: str = Field(default="", alias="from")


class PolicySection(BaseModel):
    policies: list[PolicyCard] = Field(default_factory=list)
    price_table: list[PriceRow] = Field(default_factory=list)
    commission_note: str = ""


# ---------------------------------------------------------------------------
# 9. Tiến độ
# ---------------------------------------------------------------------------
class TimelineItem(BaseModel):
    period: str = ""
    title: str = ""
    desc: str = ""
    img: str = ""


class TimelineSection(BaseModel):
    items: list[TimelineItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 11. Tin tức
# ---------------------------------------------------------------------------
class NewsItem(BaseModel):
    title: str = ""
    date: str = ""
    excerpt: str = ""
    img: str = ""
    url: str = ""


class NewsSection(BaseModel):
    items: list[NewsItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Tổng hợp nội dung + tài liệu dự án
# ---------------------------------------------------------------------------
class ProjectContent(BaseModel):
    overview: OverviewSection = Field(default_factory=OverviewSection)
    location: LocationSection = Field(default_factory=LocationSection)
    training: TrainingSection = Field(default_factory=TrainingSection)
    subzones: SubzonesSection = Field(default_factory=SubzonesSection)
    gallery360: Gallery360Section = Field(default_factory=Gallery360Section)
    policy: PolicySection = Field(default_factory=PolicySection)
    timeline: TimelineSection = Field(default_factory=TimelineSection)
    news: NewsSection = Field(default_factory=NewsSection)


# Map section-key → model, dùng cho PATCH 1 tab + validate ai-edit.
SECTION_MODELS: dict[str, type[BaseModel]] = {
    "overview": OverviewSection,
    "location": LocationSection,
    "training": TrainingSection,
    "subzones": SubzonesSection,
    "gallery360": Gallery360Section,
    "policy": PolicySection,
    "timeline": TimelineSection,
    "news": NewsSection,
}


class ProjectDoc(BaseModel):
    """Toàn bộ 1 dự án: metadata + nội dung biên tập + version."""

    slug: str
    name: str = ""
    tagline: str = ""
    status: str = "Đang mở bán"
    developer: str = ""
    location: str = ""
    content: ProjectContent = Field(default_factory=ProjectContent)
    version: int = 1
    last_updated_by: Optional[str] = None
    last_updated_at: Optional[datetime] = None


class ProjectSummary(BaseModel):
    """Bản rút gọn cho danh sách /admin/projects."""

    slug: str
    name: str = ""
    status: str = ""
    version: int = 1
    last_updated_at: Optional[datetime] = None


class ProjectUpdateIn(BaseModel):
    """Body PUT /admin/projects/{slug} — cập nhật meta + (tuỳ chọn) toàn bộ content."""

    name: Optional[str] = None
    tagline: Optional[str] = None
    status: Optional[str] = None
    developer: Optional[str] = None
    location: Optional[str] = None
    content: Optional[ProjectContent] = None


class ProjectAIEditIn(BaseModel):
    """Body POST /admin/projects/{slug}/ai-edit — yêu cầu AI chỉnh 1 section."""

    section: str = Field(description="Key section: overview|location|training|...")
    instruction: str = Field(min_length=1, description="Yêu cầu (vd: viết lại hấp dẫn hơn)")
    # Nội dung hiện tại (tuỳ chọn). Trống → store tự lấy nội dung đang lưu.
    current_content: Optional[dict] = None


class ProjectAIEditOut(BaseModel):
    section: str
    used_llm: bool
    # Gợi ý đã validate đúng shape section (admin xem trước rồi tự PUT/PATCH).
    suggestion: Optional[dict] = None
    # Văn bản thô khi AI trả về không parse được JSON đúng shape (để admin copy tay).
    suggestion_text: Optional[str] = None
    note: Optional[str] = None
