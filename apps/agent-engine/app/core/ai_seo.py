"""AI SEO — viết bài tin tức + tối ưu meta SEO tiếng Việt bằng Claude THẬT.

Tái dùng đúng pattern app/core/ai_marketing.py / ai_project.py:
  • Claude client: anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key).
  • Model qua settings.ai_seo_model (trống → fallback llm_model).
  • Bật LLM khi có API key & KHÔNG ở chế độ mock; thiếu/lỗi → FALLBACK template
    tiếng Việt, KHÔNG raise (không để 500).
  • Giới hạn max_tokens (settings.ai_seo_max_tokens) để chặn chi phí.

AN TOÀN: AI chỉ TẠO/ĐỀ XUẤT nội dung (status mặc định draft) — admin tự bấm
publish. Hàm public:
  generate_article(req) → (article_dict, used_llm)
  optimize_seo(article) → (seo_dict, suggestions, used_llm)
  suggest_keywords(topic) → (keywords, used_llm)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from app.core.settings import settings

log = logging.getLogger(__name__)

_LENGTH_LABEL = {
    "short": "ngắn gọn (~300-400 từ)",
    "medium": "vừa phải (~600-800 từ)",
    "long": "chi tiết (~1000-1400 từ)",
}


def _model() -> str:
    return settings.ai_seo_model or settings.llm_model


def _llm_enabled() -> bool:
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


# ---------------------------------------------------------------------------
# Parse JSON (chịu được code-fence / text thừa)
# ---------------------------------------------------------------------------

def _parse_json(text: Optional[str]) -> Optional[dict]:
    if not text:
        return None
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*", "", candidate).strip().rstrip("`").strip()
    try:
        obj = json.loads(candidate)
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, ValueError):
        pass
    m = re.search(r"\{.*\}", candidate, re.DOTALL)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


async def _call_claude_json(
    system: str, user: str, max_tokens: Optional[int] = None
) -> Optional[dict]:
    """Gọi Claude yêu cầu JSON. KHÔNG raise — mọi lỗi → None để caller fallback."""
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=_model(),
            max_tokens=max_tokens or settings.ai_seo_max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        return _parse_json(text)
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("AI SEO gọi Claude lỗi (%s): %s", _model(), e)
        return None


# ---------------------------------------------------------------------------
# Helpers chuẩn hoá output
# ---------------------------------------------------------------------------

def _clean_list(value, limit: int = 20) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for v in value:
        s = str(v).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def _seo_from(obj: dict, title: str, excerpt: str) -> dict:
    seo = obj.get("seo") if isinstance(obj.get("seo"), dict) else {}
    return {
        "meta_title": (seo.get("meta_title") or obj.get("meta_title") or title or "").strip()[:200],
        "meta_description": (
            seo.get("meta_description") or obj.get("meta_description") or excerpt or ""
        ).strip()[:320],
        "keywords": _clean_list(seo.get("keywords") or obj.get("keywords")),
        "og_image": (seo.get("og_image") or obj.get("og_image") or "").strip(),
    }


# ---------------------------------------------------------------------------
# Fallback templates (không cần LLM)
# ---------------------------------------------------------------------------

def _fallback_article(req: dict) -> dict:
    topic = (req.get("topic") or "Tin tức dự án").strip()
    category = (req.get("category") or "Tin tức").strip()
    keywords = _clean_list(req.get("keywords")) or [topic]
    excerpt = f"Cập nhật mới nhất về {topic}. Bài viết tổng hợp thông tin hữu ích dành cho khách hàng và nhà đầu tư quan tâm."
    content = (
        f"## {topic}\n\n"
        f"{excerpt}\n\n"
        f"### Tổng quan\n\n"
        f"Đây là nội dung nháp cho chủ đề **{topic}**. "
        f"Vui lòng bổ sung thông tin chi tiết, số liệu và hình ảnh trước khi xuất bản.\n\n"
        f"### Điểm nổi bật\n\n"
        f"- Thông tin cập nhật về {topic}\n"
        f"- Phân tích dành cho nhà đầu tư\n"
        f"- Hướng dẫn liên hệ tư vấn\n\n"
        f"### Liên hệ\n\n"
        f"Liên hệ đội ngũ tư vấn để được hỗ trợ chi tiết."
    )
    return {
        "title": topic,
        "excerpt": excerpt,
        "content": content,
        "tags": keywords[:6],
        "category": category,
        "seo": {
            "meta_title": topic[:200],
            "meta_description": excerpt[:320],
            "keywords": keywords,
            "og_image": "",
        },
    }


def _fallback_keywords(topic: str) -> list[str]:
    topic = (topic or "bất động sản").strip()
    base = [
        topic,
        f"{topic} giá",
        f"{topic} vị trí",
        f"mua {topic}",
        f"{topic} chính sách",
        "bất động sản Thanh Hoá",
        "Happy Home Thanh Hóa",
    ]
    out: list[str] = []
    for k in base:
        k = k.strip()
        if k and k not in out:
            out.append(k)
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_article(req: dict) -> tuple[dict, bool]:
    """Sinh 1 bài tin tức từ chủ đề/từ khoá. Trả (article_dict, used_llm).

    article_dict: {title, excerpt, content(markdown), tags[], category, seo{}}.
    used_llm=False → dùng template fallback (thiếu key/lỗi).
    """
    if not _llm_enabled():
        return _fallback_article(req), False

    topic = (req.get("topic") or "").strip()
    tone = (req.get("tone") or "chuyên nghiệp, gần gũi").strip()
    length_label = _LENGTH_LABEL.get(req.get("length"), "vừa phải (~600-800 từ)")
    category = (req.get("category") or "").strip()
    keywords = _clean_list(req.get("keywords"))
    kw_txt = ", ".join(keywords) if keywords else "(tự đề xuất theo chủ đề)"

    system = (
        "Bạn là chuyên gia content SEO bất động sản người Việt. Viết bài tin tức/blog "
        "tiếng Việt tự nhiên, chuẩn SEO (có từ khoá hợp lý, tiêu đề hấp dẫn, đoạn mở "
        "đầu lôi cuốn), nội dung định dạng Markdown (dùng ## ### cho tiêu đề). "
        "TUYỆT ĐỐI KHÔNG bịa số liệu pháp lý/giá cụ thể. "
        "CHỈ trả JSON đúng định dạng, KHÔNG giải thích thêm. Định dạng: "
        '{"title": "", "excerpt": "", "content": "<markdown>", "tags": [], '
        '"category": "", "seo": {"meta_title": "", "meta_description": "", '
        '"keywords": [], "og_image": ""}}.'
    )
    user = (
        f"Viết một bài tin tức/blog về chủ đề: {topic}\n"
        f"- Danh mục: {category or '(tự đề xuất)'}\n"
        f"- Từ khoá SEO mục tiêu: {kw_txt}\n"
        f"- Tông giọng: {tone}\n"
        f"- Độ dài: {length_label}\n"
        "Yêu cầu: excerpt ngắn 1-2 câu; content Markdown có tiêu đề phụ; "
        "meta_title <= 60 ký tự; meta_description <= 160 ký tự; "
        "keywords 5-10 từ khoá; tags 3-6 thẻ."
    )

    obj = await _call_claude_json(system, user)
    if not isinstance(obj, dict):
        return _fallback_article(req), False

    title = str(obj.get("title") or topic).strip()
    excerpt = str(obj.get("excerpt") or "").strip()
    content = str(obj.get("content") or "").strip()
    if not content:
        return _fallback_article(req), False
    return (
        {
            "title": title,
            "excerpt": excerpt,
            "content": content,
            "tags": _clean_list(obj.get("tags"), limit=8),
            "category": str(obj.get("category") or category).strip(),
            "seo": _seo_from(obj, title, excerpt),
        },
        True,
    )


async def optimize_seo(article: dict) -> tuple[dict, list[str], bool]:
    """Cải thiện meta_title/description/keywords + gợi ý. Trả (seo_dict, suggestions, used_llm)."""
    title = (article.get("title") or "").strip()
    excerpt = (article.get("excerpt") or "").strip()
    content = (article.get("content") or "").strip()
    keywords = _clean_list(article.get("keywords"))

    if not _llm_enabled():
        seo = {
            "meta_title": title[:60],
            "meta_description": (excerpt or content[:160]).strip()[:160],
            "keywords": keywords or _fallback_keywords(title),
            "og_image": "",
        }
        suggestions = [
            "Đảm bảo meta_title <= 60 ký tự, chứa từ khoá chính.",
            "Meta description 120-160 ký tự, có lời kêu gọi hành động.",
            "Dùng từ khoá chính trong tiêu đề và đoạn mở đầu.",
        ]
        return seo, suggestions, False

    system = (
        "Bạn là chuyên gia SEO tiếng Việt. Dựa trên bài viết, tối ưu thẻ meta SEO. "
        "CHỈ trả JSON: {\"seo\": {\"meta_title\": \"\", \"meta_description\": \"\", "
        "\"keywords\": []}, \"suggestions\": [\"<gợi ý ngắn>\"]}. "
        "meta_title <= 60 ký tự, meta_description <= 160 ký tự, keywords 5-10 từ."
    )
    user = (
        f"Tiêu đề: {title}\n"
        f"Tóm tắt: {excerpt}\n"
        f"Từ khoá hiện có: {', '.join(keywords) if keywords else '(chưa có)'}\n\n"
        f"Nội dung (rút gọn):\n{content[:3000]}"
    )
    obj = await _call_claude_json(system, user, max_tokens=800)
    if not isinstance(obj, dict):
        seo = {
            "meta_title": title[:60],
            "meta_description": (excerpt or content[:160]).strip()[:160],
            "keywords": keywords or _fallback_keywords(title),
            "og_image": (article.get("og_image") or "").strip(),
        }
        return seo, [], False

    seo = _seo_from(obj, title, excerpt)
    if not seo.get("og_image"):
        seo["og_image"] = (article.get("og_image") or "").strip()
    suggestions = _clean_list(obj.get("suggestions"), limit=8)
    return seo, suggestions, True


async def suggest_keywords(topic: str) -> tuple[list[str], bool]:
    """Gợi ý từ khoá SEO cho 1 chủ đề. Trả (keywords, used_llm)."""
    topic = (topic or "").strip()
    if not _llm_enabled():
        return _fallback_keywords(topic), False

    system = (
        "Bạn là chuyên gia SEO bất động sản tiếng Việt. Đề xuất từ khoá SEO theo "
        "ý định tìm kiếm thực tế của người Việt. CHỈ trả JSON: {\"keywords\": []} "
        "(8-12 từ khoá, gồm cả từ khoá đuôi dài)."
    )
    user = f"Chủ đề: {topic}"
    obj = await _call_claude_json(system, user, max_tokens=400)
    if isinstance(obj, dict):
        kws = _clean_list(obj.get("keywords"), limit=12)
        if kws:
            return kws, True
    return _fallback_keywords(topic), False
