"""Pydantic schema cho TIN TỨC / BLOG (news_store) + cấu hình SEO (seo_settings).

Bài tin tức = nội dung biên tập công khai (overview/blog) để chuẩn SEO website.
Chỉ admin tạo/sửa; public chỉ đọc bài đã `published`. Mọi field text tự do —
KHÔNG chứa PII. AI chỉ tạo/đề xuất nội dung (không tự publish).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# SEO meta của 1 bài
# ---------------------------------------------------------------------------


class ArticleSEO(BaseModel):
    meta_title: str = ""
    meta_description: str = ""
    keywords: list[str] = Field(default_factory=list)
    og_image: str = ""


# ---------------------------------------------------------------------------
# Bài tin tức
# ---------------------------------------------------------------------------


class NewsArticle(BaseModel):
    """1 bài tin tức/blog đầy đủ (admin view + lưu store)."""

    id: str = ""
    slug: str = ""
    title: str = ""
    excerpt: str = ""
    content: str = ""  # markdown / html
    cover_image: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = ""
    project_slug: Optional[str] = None  # gắn dự án (slug) — None = tin chung
    seo: ArticleSEO = Field(default_factory=ArticleSEO)
    status: str = "draft"  # draft | published
    published_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    author: Optional[str] = None


class NewsCreate(BaseModel):
    """Tạo bài mới (slug tự sinh từ title nếu trống)."""

    title: str
    slug: Optional[str] = None
    excerpt: str = ""
    content: str = ""
    cover_image: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = ""
    project_slug: Optional[str] = None
    seo: Optional[ArticleSEO] = None
    status: str = "draft"
    author: Optional[str] = None


class NewsUpdate(BaseModel):
    """Cập nhật bài — field None = giữ nguyên."""

    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    cover_image: Optional[str] = None
    tags: Optional[list[str]] = None
    category: Optional[str] = None
    project_slug: Optional[str] = None
    seo: Optional[ArticleSEO] = None
    status: Optional[str] = None
    author: Optional[str] = None


class NewsListItem(BaseModel):
    """Mục tóm tắt cho danh sách (admin + public) — không kèm content nặng."""

    id: str
    slug: str
    title: str
    excerpt: str = ""
    cover_image: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = ""
    project_slug: Optional[str] = None
    status: str = "draft"
    published_at: Optional[str] = None
    updated_at: Optional[str] = None
    author: Optional[str] = None


class NewsListResponse(BaseModel):
    items: list[NewsListItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20


# ---------------------------------------------------------------------------
# AI SEO — request/response
# ---------------------------------------------------------------------------


class AIGenerateArticleIn(BaseModel):
    topic: str  # chủ đề / từ khoá chính
    tone: str = "chuyên nghiệp, gần gũi"
    length: str = "medium"  # short | medium | long
    category: str = ""
    keywords: list[str] = Field(default_factory=list)


class AIGenerateArticleOut(BaseModel):
    used_llm: bool
    title: str = ""
    slug: str = ""
    excerpt: str = ""
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = ""
    seo: ArticleSEO = Field(default_factory=ArticleSEO)
    message: Optional[str] = None


class AIOptimizeSEOIn(BaseModel):
    title: str = ""
    excerpt: str = ""
    content: str = ""
    keywords: list[str] = Field(default_factory=list)


class AIOptimizeSEOOut(BaseModel):
    used_llm: bool
    seo: ArticleSEO = Field(default_factory=ArticleSEO)
    suggestions: list[str] = Field(default_factory=list)
    message: Optional[str] = None


class AISuggestKeywordsIn(BaseModel):
    topic: str


class AISuggestKeywordsOut(BaseModel):
    used_llm: bool
    keywords: list[str] = Field(default_factory=list)
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# SEO settings (site-wide + override theo page key)
# ---------------------------------------------------------------------------


class SeoPageOverride(BaseModel):
    title: str = ""
    description: str = ""
    keywords: list[str] = Field(default_factory=list)
    og_image: str = ""


class SeoSettings(BaseModel):
    """Cấu hình SEO mặc định toàn site + override từng trang."""

    site_name: str = "Happy Home Thanh Hóa"
    # Template tiêu đề, %s = tiêu đề trang. VD "%s | Happy Home Thanh Hóa".
    title_template: str = "%s | Happy Home Thanh Hóa"
    default_title: str = "Shophouse Happy Home Thanh Hóa — Cận thị · Cận giang · Cận lộ"
    default_description: str = (
        "Shophouse Happy Home tại trung tâm hành chính mới TP. Thanh Hóa, "
        "TP Thanh Hoá. Trang giới thiệu chính thức kèm trợ lý tư vấn AI 24/7."
    )
    default_keywords: list[str] = Field(default_factory=list)
    default_og_image: str = ""
    base_url: str = "https://happyhomethanhhoa.bdsg.land"
    twitter_handle: str = ""
    robots: str = "index, follow"
    # Override theo page key (vd "home", "news", "project").
    pages: dict[str, SeoPageOverride] = Field(default_factory=dict)
    version: int = 1
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class SeoSettingsUpdate(BaseModel):
    """Cập nhật SEO settings — field None = giữ nguyên."""

    site_name: Optional[str] = None
    title_template: Optional[str] = None
    default_title: Optional[str] = None
    default_description: Optional[str] = None
    default_keywords: Optional[list[str]] = None
    default_og_image: Optional[str] = None
    base_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    robots: Optional[str] = None
    pages: Optional[dict[str, SeoPageOverride]] = None
