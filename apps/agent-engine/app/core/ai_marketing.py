"""AI Marketing — sinh nội dung digital marketing tiếng Việt bằng Claude THẬT.

Tái dùng đúng pattern app/core/ai_crm.py:
  • Claude client: anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key).
  • Model qua settings.marketing_model (trống → fallback llm_model).
  • Bật LLM khi có API key & KHÔNG ở chế độ mock; thiếu/lỗi → FALLBACK template
    tiếng Việt, KHÔNG raise (không để 500).
  • Giới hạn max_tokens (settings.marketing_max_tokens) + số biến thể để chặn chi phí.

Hàm public:
  generate_content(req)  → (variants: list[str], used_llm: bool)
  suggest_campaigns(...) → (suggestions: list[dict], used_llm: bool)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from app.core.settings import settings

log = logging.getLogger(__name__)

# Nhãn tiếng Việt cho prompt + fallback.
_TYPE_LABEL = {
    "post": "bài đăng mạng xã hội",
    "ad": "mẩu quảng cáo (ad copy)",
    "email": "email marketing",
    "script": "kịch bản video ngắn",
}
_CHANNEL_LABEL = {
    "facebook": "Facebook",
    "zalo": "Zalo",
    "google": "Google Ads",
    "email": "Email",
    "tiktok": "TikTok",
    "other": "đa kênh",
}
_LENGTH_LABEL = {
    "short": "ngắn gọn (2-3 câu)",
    "medium": "vừa phải (1 đoạn ~80-120 từ)",
    "long": "chi tiết (2-3 đoạn)",
}


def _model() -> str:
    return settings.marketing_model or settings.llm_model


def _llm_enabled() -> bool:
    """Bật gọi Claude thật khi có API key và KHÔNG ở chế độ mock."""
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


# ---------------------------------------------------------------------------
# Parse JSON output từ Claude (chịu được code-fence / text thừa)
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
            max_tokens=max_tokens or settings.marketing_max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        return _parse_json(text)
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("AI Marketing gọi Claude lỗi (%s): %s", _model(), e)
        return None


# ---------------------------------------------------------------------------
# Fallback template (không cần LLM)
# ---------------------------------------------------------------------------

def _fallback_variants(req: dict) -> list[str]:
    """Sinh vài biến thể template tiếng Việt khi chưa bật LLM / lỗi."""
    product = (req.get("product") or "sản phẩm").strip()
    audience = (req.get("audience") or "khách hàng tiềm năng").strip()
    channel = _CHANNEL_LABEL.get(req.get("channel"), "đa kênh")
    ctype = req.get("content_type") or "post"
    tone = (req.get("tone") or "chuyên nghiệp, gần gũi").strip()
    n = int(req.get("variants") or 3)

    base: list[str]
    if ctype == "email":
        base = [
            (f"Tiêu đề: Cơ hội sở hữu {product} dành cho {audience}\n\n"
             f"Kính gửi Quý khách,\n\n{product} mang đến giải pháp phù hợp cho {audience}. "
             f"Liên hệ ngay để nhận tư vấn và ưu đãi mới nhất.\n\nTrân trọng."),
            (f"Tiêu đề: {product} — đừng bỏ lỡ!\n\nXin chào,\n\nChúng tôi trân trọng giới "
             f"thiệu {product}. Đăng ký ngay hôm nay để nhận thông tin chi tiết và chính sách "
             f"ưu đãi dành riêng cho {audience}.\n\nTrân trọng."),
        ]
    elif ctype == "script":
        base = [
            (f"[Cảnh mở] Cận cảnh {product}.\n[Lời thoại] '{product} — lựa chọn lý tưởng cho "
             f"{audience}.'\n[Kết] Kêu gọi: Liên hệ ngay để được tư vấn!"),
            (f"[Hook 3 giây] Bạn đang tìm {product}?\n[Thân] Điểm nổi bật dành cho {audience}.\n"
             f"[CTA] Để lại thông tin để nhận ưu đãi."),
        ]
    elif ctype == "ad":
        base = [
            f"🔥 {product} — giải pháp cho {audience}. Ưu đãi có hạn, liên hệ ngay! #BĐS #{channel}",
            f"Sở hữu {product} hôm nay! Tư vấn miễn phí cho {audience}. Đăng ký ngay 👉",
        ]
    else:  # post
        base = [
            (f"✨ {product}\n\nDành riêng cho {audience}, đây là cơ hội bạn không nên bỏ lỡ. "
             f"Inbox ngay để được tư vấn chi tiết và nhận ưu đãi mới nhất trên {channel}!"),
            (f"📍 {product}\n\nGiải pháp hoàn hảo cho {audience}. Liên hệ ngay hôm nay để "
             f"không bỏ lỡ chính sách ưu đãi giới hạn."),
        ]

    out: list[str] = []
    for i in range(n):
        out.append(base[i % len(base)] + (f"\n\n(Tông giọng: {tone})" if i >= len(base) else ""))
    return out[:n]


def _fallback_suggestions() -> list[dict]:
    return [
        {"channel": "facebook", "idea": "Chạy lead-form quảng bá dự án tới nhóm khách 30-45 tuổi",
         "rationale": "Facebook phủ rộng, chi phí/lead tối ưu cho BĐS."},
        {"channel": "zalo", "idea": "Gửi broadcast chăm sóc khách cũ + ưu đãi giới thiệu",
         "rationale": "Zalo tỉ lệ mở cao, hợp re-engage khách Việt."},
        {"channel": "google", "idea": "Search Ads từ khoá 'mua căn hộ + khu vực'",
         "rationale": "Bắt nhu cầu khách đang chủ động tìm kiếm."},
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_content(req: dict) -> tuple[list[str], bool]:
    """Sinh `variants` nội dung tiếng Việt. Trả (variants, used_llm).

    used_llm=False nghĩa là dùng template fallback (thiếu API key / lỗi gọi Claude).
    """
    n = max(1, min(5, int(req.get("variants") or 3)))
    if not _llm_enabled():
        return _fallback_variants(req), False

    type_label = _TYPE_LABEL.get(req.get("content_type"), "nội dung marketing")
    channel_label = _CHANNEL_LABEL.get(req.get("channel"), "đa kênh")
    length_label = _LENGTH_LABEL.get(req.get("length"), "vừa phải")
    product = (req.get("product") or "").strip()
    audience = (req.get("audience") or "khách hàng tiềm năng").strip()
    tone = (req.get("tone") or "chuyên nghiệp, gần gũi").strip()

    system = (
        "Bạn là copywriter digital marketing bất động sản người Việt, viết nội dung "
        "hấp dẫn, đúng văn phong người Việt, có lời kêu gọi hành động (CTA) rõ ràng. "
        "CHỈ trả JSON đúng định dạng, KHÔNG giải thích thêm. "
        'Định dạng: {"variants": ["<biến thể 1>", "<biến thể 2>", ...]}.'
    )
    user = (
        f"Hãy viết {n} biến thể {type_label} cho kênh {channel_label}.\n"
        f"- Sản phẩm/dự án: {product}\n"
        f"- Đối tượng khách hàng: {audience}\n"
        f"- Tông giọng: {tone}\n"
        f"- Độ dài mỗi biến thể: {length_label}\n"
        f"Yêu cầu: tiếng Việt tự nhiên, không trùng lặp ý giữa các biến thể, có CTA."
    )

    obj = await _call_claude_json(system, user)
    variants: list[str] = []
    if isinstance(obj, dict):
        raw = obj.get("variants")
        if isinstance(raw, list):
            variants = [str(v).strip() for v in raw if str(v).strip()]
    if variants:
        return variants[:n], True
    return _fallback_variants(req), False


async def suggest_campaigns(
    channel_performance: Optional[list[dict]] = None,
) -> tuple[list[dict], bool]:
    """Gợi ý ý tưởng chiến dịch dựa trên hiệu suất lead theo kênh. Trả (list, used_llm).

    channel_performance: [{channel, leads, customers, cpl, roi}] (tuỳ chọn) để AI
    ưu tiên kênh hiệu quả. Thiếu LLM/lỗi → gợi ý template mặc định.
    """
    if not _llm_enabled():
        return _fallback_suggestions(), False

    perf_txt = "Chưa có dữ liệu hiệu suất."
    if channel_performance:
        parts = [
            f"{p.get('channel')}: {p.get('leads', 0)} lead, "
            f"{p.get('customers', 0)} khách, CPL {p.get('cpl', 0):.0f}, ROI {p.get('roi', 0):.2f}"
            for p in channel_performance
        ]
        perf_txt = "; ".join(parts)

    system = (
        "Bạn là chuyên gia digital marketing bất động sản. Dựa trên hiệu suất lead "
        "theo kênh, đề xuất 3-4 ý tưởng chiến dịch cụ thể, ưu tiên kênh hiệu quả. "
        "CHỈ trả JSON: {\"suggestions\": [{\"channel\": \"facebook|zalo|google|email|tiktok|other\", "
        "\"idea\": \"<ý tưởng ngắn tiếng Việt>\", \"rationale\": \"<lý do ngắn>\"}]}."
    )
    user = f"Hiệu suất lead theo kênh hiện tại: {perf_txt}"

    obj = await _call_claude_json(system, user)
    out: list[dict] = []
    if isinstance(obj, dict) and isinstance(obj.get("suggestions"), list):
        valid_channels = {"facebook", "zalo", "google", "email", "tiktok", "other"}
        for s in obj["suggestions"]:
            if not isinstance(s, dict):
                continue
            ch = str(s.get("channel") or "other").lower().strip()
            if ch not in valid_channels:
                ch = "other"
            idea = str(s.get("idea") or "").strip()
            if not idea:
                continue
            out.append({
                "channel": ch,
                "idea": idea[:300],
                "rationale": (str(s.get("rationale") or "").strip()[:300] or None),
            })
    if out:
        return out, True
    return _fallback_suggestions(), False
