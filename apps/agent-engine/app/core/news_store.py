"""News store — bài TIN TỨC / BLOG (CMS công khai), 1 file JSON collection.

File: data/_runtime/news.json → {"articles": [ {article dict} ]}

Cùng convention store JSON với marketing_store / project_store:
  - Thread-safe (RLock) + atomic write (.tmp → replace).
  - DATA_DIR aware (Railway Volume) → agent-engine → CWD fallback.
  - File hỏng/schema cũ → coi như rỗng (KHÔNG để 500); lần ghi sau tạo lại.
  - gitignore (data/_runtime/) — nội dung biên tập không commit.

AN TOÀN: chỉ admin tạo/sửa; public chỉ đọc bài `published`. slug DUY NHẤT
(unique) — tự sinh từ title, tự thêm hậu tố -2/-3 nếu trùng.
"""

from __future__ import annotations

import json
import os
import re
import threading
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.RLock()

# Slug an toàn: chữ thường, số, gạch ngang.
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,120}$")


# ---------------------------------------------------------------------------
# Path / IO helpers
# ---------------------------------------------------------------------------

def _resolve(rel: str) -> Path:
    p = Path(rel)
    if p.is_absolute():
        return p
    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / p).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / p).resolve()
    return (Path.cwd() / p).resolve()


def _ensure() -> Path:
    path = _resolve(settings.news_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"articles": []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {"articles": []}
    if not isinstance(data, dict) or not isinstance(data.get("articles"), list):
        return {"articles": []}
    return data


def _save(data: dict) -> None:
    path = _ensure()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# Slug helpers
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Chuẩn hoá tiếng Việt → slug a-z0-9-. Rỗng → 'bai-viet'."""
    s = (text or "").strip().lower()
    # Bỏ dấu tiếng Việt.
    s = s.replace("đ", "d")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = s[:120].strip("-")
    return s or "bai-viet"


def _unique_slug(base: str, articles: list[dict], exclude_id: Optional[str] = None) -> str:
    """Đảm bảo slug duy nhất — thêm hậu tố -2/-3… nếu trùng."""
    base = slugify(base)
    existing = {
        a.get("slug")
        for a in articles
        if a.get("id") != exclude_id and a.get("slug")
    }
    if base not in existing:
        return base
    i = 2
    while f"{base}-{i}" in existing:
        i += 1
    return f"{base}-{i}"


def _clean_tags(tags) -> list[str]:
    if not isinstance(tags, list):
        return []
    out: list[str] = []
    for t in tags:
        s = str(t).strip()
        if s and s not in out:
            out.append(s)
    return out


def _seo_dict(seo, title: str, excerpt: str, cover: str) -> dict:
    """Chuẩn hoá SEO dict; tự điền meta mặc định từ title/excerpt nếu trống."""
    seo = seo if isinstance(seo, dict) else {}
    return {
        "meta_title": (seo.get("meta_title") or title or "").strip()[:200],
        "meta_description": (seo.get("meta_description") or excerpt or "").strip()[:320],
        "keywords": _clean_tags(seo.get("keywords")),
        "og_image": (seo.get("og_image") or cover or "").strip(),
    }


def _to_summary(a: dict) -> dict:
    """Mục tóm tắt (bỏ content nặng) cho danh sách."""
    return {
        "id": a.get("id"),
        "slug": a.get("slug"),
        "title": a.get("title", ""),
        "excerpt": a.get("excerpt", ""),
        "cover_image": a.get("cover_image", ""),
        "tags": a.get("tags") or [],
        "category": a.get("category", ""),
        "status": a.get("status", "draft"),
        "published_at": a.get("published_at"),
        "updated_at": a.get("updated_at"),
        "author": a.get("author"),
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create(payload: dict, author: Optional[str] = None) -> dict:
    """Tạo bài mới. slug tự sinh từ title nếu trống + đảm bảo unique."""
    now = _now()
    title = (payload.get("title") or "").strip()
    excerpt = (payload.get("excerpt") or "").strip()
    cover = (payload.get("cover_image") or "").strip()
    status = payload.get("status") if payload.get("status") in ("draft", "published") else "draft"
    with _LOCK:
        data = _load()
        slug = _unique_slug(payload.get("slug") or title, data["articles"])
        article = {
            "id": str(uuid.uuid4()),
            "slug": slug,
            "title": title,
            "excerpt": excerpt,
            "content": payload.get("content") or "",
            "cover_image": cover,
            "tags": _clean_tags(payload.get("tags")),
            "category": (payload.get("category") or "").strip(),
            "seo": _seo_dict(payload.get("seo"), title, excerpt, cover),
            "status": status,
            "published_at": now if status == "published" else None,
            "created_at": now,
            "updated_at": now,
            "author": author or payload.get("author"),
        }
        data["articles"].append(article)
        _rotate(data)
        _save(data)
    return article


def _rotate(data: dict) -> None:
    keep = max(1, int(settings.news_keep))
    if len(data["articles"]) > keep:
        data["articles"].sort(key=lambda x: x.get("created_at") or "")
        data["articles"] = data["articles"][-keep:]


def list_articles(
    *,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    summary: bool = True,
) -> dict:
    """Danh sách bài (mới nhất trước) + phân trang + lọc tuỳ chọn.

    published-first sort dùng published_at; còn lại dùng created_at.
    """
    with _LOCK:
        data = _load()
        rows = list(data["articles"])
    if status:
        rows = [a for a in rows if a.get("status") == status]
    if tag:
        rows = [a for a in rows if tag in (a.get("tags") or [])]
    if category:
        rows = [a for a in rows if (a.get("category") or "") == category]

    def _sort_key(a: dict) -> str:
        return a.get("published_at") or a.get("created_at") or ""

    rows.sort(key=_sort_key, reverse=True)
    total = len(rows)
    page = max(1, int(page))
    page_size = max(1, min(100, int(page_size)))
    start = (page - 1) * page_size
    chunk = rows[start : start + page_size]
    items = [_to_summary(a) for a in chunk] if summary else chunk
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_by_id(article_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for a in data["articles"]:
            if a.get("id") == article_id:
                return a
    return None


def get_by_slug(slug: str, *, only_published: bool = False) -> Optional[dict]:
    s = (slug or "").strip().lower()
    with _LOCK:
        data = _load()
        for a in data["articles"]:
            if a.get("slug") == s:
                if only_published and a.get("status") != "published":
                    return None
                return a
    return None


def update(article_id: str, fields: dict) -> Optional[dict]:
    """Cập nhật bài. None nếu không tìm thấy. Đổi status → cập nhật published_at."""
    with _LOCK:
        data = _load()
        target = None
        for a in data["articles"]:
            if a.get("id") == article_id:
                target = a
                break
        if target is None:
            return None

        if fields.get("title") is not None:
            target["title"] = str(fields["title"]).strip()
        if fields.get("slug") is not None and str(fields["slug"]).strip():
            target["slug"] = _unique_slug(
                fields["slug"], data["articles"], exclude_id=article_id
            )
        for key in ("excerpt", "content", "cover_image", "category", "author"):
            if fields.get(key) is not None:
                target[key] = str(fields[key]).strip() if key != "content" else fields[key]
        if fields.get("tags") is not None:
            target["tags"] = _clean_tags(fields["tags"])
        if fields.get("seo") is not None:
            target["seo"] = _seo_dict(
                fields["seo"], target.get("title", ""),
                target.get("excerpt", ""), target.get("cover_image", ""),
            )
        if fields.get("status") is not None and fields["status"] in ("draft", "published"):
            new_status = fields["status"]
            if new_status == "published" and target.get("status") != "published":
                target["published_at"] = _now()
            target["status"] = new_status
        target["updated_at"] = _now()
        _save(data)
        return target


def set_status(article_id: str, status: str) -> Optional[dict]:
    """publish/unpublish nhanh."""
    if status not in ("draft", "published"):
        return None
    return update(article_id, {"status": status})


def delete(article_id: str) -> bool:
    with _LOCK:
        data = _load()
        before = len(data["articles"])
        data["articles"] = [a for a in data["articles"] if a.get("id") != article_id]
        if len(data["articles"]) == before:
            return False
        _save(data)
        return True


def clear() -> None:
    """Xoá toàn bộ — chỉ dùng trong test."""
    with _LOCK:
        _save({"articles": []})
