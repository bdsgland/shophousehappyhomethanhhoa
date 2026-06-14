"""API SEO & Tin tức.

Hai router xuất ra (đăng ký riêng trong main.py):

  admin_router  (prefix /admin/news, require_admin)
    GET    /admin/news                      → danh sách bài (lọc status/tag/category)
    POST   /admin/news                      → tạo bài (mặc định draft)
    GET    /admin/news/{id}                 → chi tiết bài (đầy đủ content)
    PUT    /admin/news/{id}                 → cập nhật bài
    DELETE /admin/news/{id}                 → xoá bài
    POST   /admin/news/{id}/publish         → xuất bản
    POST   /admin/news/{id}/unpublish       → gỡ xuất bản
    POST   /admin/news/ai-generate          → AI viết bài (KHÔNG lưu)
    POST   /admin/news/ai-optimize          → AI tối ưu SEO 1 bài (KHÔNG lưu)
    POST   /admin/news/ai-suggest-keywords  → AI gợi ý từ khoá
    GET    /admin/news/seo-settings         → đọc cấu hình SEO site-wide
    PUT    /admin/news/seo-settings         → cập nhật cấu hình SEO

  public_router (prefix /news, không auth — chỉ bài published)
    GET    /news                            → danh sách bài published (phân trang/lọc)
    GET    /news/{slug}                     → chi tiết 1 bài published

AN TOÀN: admin mới sửa; public chỉ đọc bài published; AI chỉ tạo/đề xuất nội
dung (không tự publish trừ khi admin bấm). Thiếu API key → fallback (không 500).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, require_admin
from app.core import ai_seo, news_store, seo_settings_store
from app.schemas.news import (
    AIGenerateArticleIn,
    AIGenerateArticleOut,
    AIOptimizeSEOIn,
    AIOptimizeSEOOut,
    AISuggestKeywordsIn,
    AISuggestKeywordsOut,
    ArticleSEO,
    NewsArticle,
    NewsCreate,
    NewsListResponse,
    NewsUpdate,
    SeoSettings,
    SeoSettingsUpdate,
)

# Audit best-effort (không để lỗi audit làm hỏng thao tác).
try:
    from app.core import audit_store
except Exception:  # noqa: BLE001 - pragma
    audit_store = None  # type: ignore[assignment]


def _audit(action: str, admin: dict, **kwargs) -> None:
    if audit_store is None:
        return
    try:
        audit_store.record_admin(action, admin, **kwargs)
    except Exception:  # noqa: BLE001 — audit không được làm hỏng response
        pass


admin_router = APIRouter(prefix="/admin/news", tags=["admin", "news", "seo"])
public_router = APIRouter(prefix="/news", tags=["news"])
public_seo_router = APIRouter(prefix="/seo", tags=["seo"])


@public_seo_router.get("/settings", response_model=SeoSettings)
def public_seo_settings() -> SeoSettings:
    """Cấu hình SEO site-wide (CÔNG KHAI, chỉ đọc) — web áp vào metadata các trang.

    Không chứa bí mật; chỉ là meta mặc định + override theo page key.
    """
    return seo_settings_store.get()


# ===========================================================================
# SEO settings (đặt TRƯỚC route /{id} để không bị nuốt bởi path param)
# ===========================================================================

@admin_router.get("/seo-settings", response_model=SeoSettings)
def get_seo_settings(_admin: dict = Depends(require_admin)) -> SeoSettings:
    return seo_settings_store.get()


@admin_router.put("/seo-settings", response_model=SeoSettings)
def update_seo_settings(
    payload: SeoSettingsUpdate,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> SeoSettings:
    saved = seo_settings_store.update(payload, by_admin_id=user.get("id"))
    _audit("seo.settings_update", _admin, new_value={"version": saved.version})
    return saved


# ===========================================================================
# AI SEO (đặt TRƯỚC route /{id})
# ===========================================================================

@admin_router.post("/ai-generate", response_model=AIGenerateArticleOut)
async def ai_generate_article(
    payload: AIGenerateArticleIn, _admin: dict = Depends(require_admin)
) -> AIGenerateArticleOut:
    """AI viết bài từ chủ đề/từ khoá — KHÔNG tự lưu (admin xem rồi tạo)."""
    article, used_llm = await ai_seo.generate_article(payload.model_dump())
    title = article.get("title", "")
    slug = news_store.slugify(title)
    msg = None if used_llm else "Chưa bật AI (thiếu API key) — đang dùng bản nháp mẫu."
    return AIGenerateArticleOut(
        used_llm=used_llm,
        title=title,
        slug=slug,
        excerpt=article.get("excerpt", ""),
        content=article.get("content", ""),
        tags=article.get("tags", []),
        category=article.get("category", ""),
        seo=ArticleSEO(**article.get("seo", {})),
        message=msg,
    )


@admin_router.post("/ai-optimize", response_model=AIOptimizeSEOOut)
async def ai_optimize_seo(
    payload: AIOptimizeSEOIn, _admin: dict = Depends(require_admin)
) -> AIOptimizeSEOOut:
    """AI tối ưu meta SEO 1 bài — KHÔNG tự lưu."""
    seo, suggestions, used_llm = await ai_seo.optimize_seo(payload.model_dump())
    msg = None if used_llm else "Chưa bật AI — đang dùng gợi ý SEO mặc định."
    return AIOptimizeSEOOut(
        used_llm=used_llm,
        seo=ArticleSEO(**seo),
        suggestions=suggestions,
        message=msg,
    )


@admin_router.post("/ai-suggest-keywords", response_model=AISuggestKeywordsOut)
async def ai_suggest_keywords(
    payload: AISuggestKeywordsIn, _admin: dict = Depends(require_admin)
) -> AISuggestKeywordsOut:
    keywords, used_llm = await ai_seo.suggest_keywords(payload.topic)
    msg = None if used_llm else "Chưa bật AI — đang dùng gợi ý từ khoá mặc định."
    return AISuggestKeywordsOut(used_llm=used_llm, keywords=keywords, message=msg)


# ===========================================================================
# CRUD bài (admin)
# ===========================================================================

@admin_router.get("", response_model=NewsListResponse)
def list_news(
    status: str | None = None,
    tag: str | None = None,
    category: str | None = None,
    page: int = 1,
    page_size: int = 20,
    _admin: dict = Depends(require_admin),
) -> NewsListResponse:
    data = news_store.list_articles(
        status=status, tag=tag, category=category,
        page=page, page_size=page_size, summary=True,
    )
    return NewsListResponse(**data)


@admin_router.post("", response_model=NewsArticle, status_code=201)
def create_news(
    payload: NewsCreate,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> NewsArticle:
    created = news_store.create(
        payload.model_dump(), author=payload.author or user.get("full_name")
    )
    _audit("news.create", _admin, target=created.get("slug"))
    return NewsArticle(**created)


@admin_router.get("/{article_id}", response_model=NewsArticle)
def get_news(article_id: str, _admin: dict = Depends(require_admin)) -> NewsArticle:
    article = news_store.get_by_id(article_id)
    if not article:
        raise HTTPException(404, "Không tìm thấy bài viết")
    return NewsArticle(**article)


@admin_router.put("/{article_id}", response_model=NewsArticle)
def update_news(
    article_id: str,
    payload: NewsUpdate,
    _admin: dict = Depends(require_admin),
) -> NewsArticle:
    updated = news_store.update(article_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(404, "Không tìm thấy bài viết")
    _audit("news.update", _admin, target=updated.get("slug"))
    return NewsArticle(**updated)


@admin_router.delete("/{article_id}")
def delete_news(article_id: str, _admin: dict = Depends(require_admin)) -> dict:
    ok = news_store.delete(article_id)
    if not ok:
        raise HTTPException(404, "Không tìm thấy bài viết")
    _audit("news.delete", _admin, target=article_id)
    return {"ok": True}


@admin_router.post("/{article_id}/publish", response_model=NewsArticle)
def publish_news(article_id: str, _admin: dict = Depends(require_admin)) -> NewsArticle:
    updated = news_store.set_status(article_id, "published")
    if not updated:
        raise HTTPException(404, "Không tìm thấy bài viết")
    _audit("news.publish", _admin, target=updated.get("slug"))
    return NewsArticle(**updated)


@admin_router.post("/{article_id}/unpublish", response_model=NewsArticle)
def unpublish_news(article_id: str, _admin: dict = Depends(require_admin)) -> NewsArticle:
    updated = news_store.set_status(article_id, "draft")
    if not updated:
        raise HTTPException(404, "Không tìm thấy bài viết")
    _audit("news.unpublish", _admin, target=updated.get("slug"))
    return NewsArticle(**updated)


# ===========================================================================
# PUBLIC — chỉ bài published
# ===========================================================================

@public_router.get("", response_model=NewsListResponse)
def public_list_news(
    tag: str | None = None,
    category: str | None = None,
    page: int = 1,
    page_size: int = 12,
) -> NewsListResponse:
    """Danh sách bài ĐÃ xuất bản (CÔNG KHAI) — phân trang + lọc tag/category."""
    data = news_store.list_articles(
        status="published", tag=tag, category=category,
        page=page, page_size=page_size, summary=True,
    )
    return NewsListResponse(**data)


@public_router.get("/{slug}", response_model=NewsArticle)
def public_get_news(slug: str) -> NewsArticle:
    """Chi tiết 1 bài ĐÃ xuất bản (CÔNG KHAI). Bài draft/không tồn tại → 404."""
    article = news_store.get_by_slug(slug, only_published=True)
    if not article:
        raise HTTPException(404, "Không tìm thấy bài viết")
    return NewsArticle(**article)
