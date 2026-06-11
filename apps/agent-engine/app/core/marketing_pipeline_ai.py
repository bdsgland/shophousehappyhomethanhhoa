"""AI cho MARKETING PIPELINE — sinh nội dung từng giai đoạn bằng Claude THẬT.

Mỗi giai đoạn AI nhận pipeline (chủ đề/dự án/định dạng/tone/ngôn ngữ) + output các
giai đoạn trước làm ngữ cảnh, rồi gọi Claude sinh output cho giai đoạn hiện tại:
  • research      → ý tưởng/insight/góc nhìn cho chủ đề.
  • script        → dàn ý / kịch bản bài viết (bullet structure).
  • content       → bài viết hoàn chỉnh (đa định dạng, song ngữ tuỳ chọn).
  • video_script  → kịch bản/storyboard video ngắn Reels/TikTok (KHÔNG render video).

KHÁC ai_marketing.py (async): module này dùng anthropic.Anthropic SYNC để được gọi
TRỰC TIẾP từ cả endpoint (qua run_in_threadpool) lẫn bridge OpenClaw (sync). Cùng
nguyên tắc AN TOÀN: thiếu API key / lỗi gọi Claude → FALLBACK template tiếng Việt,
KHÔNG raise (không để 500). Giới hạn max_tokens (settings.marketing_pipeline_max_tokens)
để bảo vệ chi phí.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.core.settings import settings

log = logging.getLogger(__name__)

_FORMAT_LABEL = {
    "toplist": "Toplist (bài tổng hợp/xếp hạng có đánh số)",
    "pov": "POV (góc nhìn ngôi thứ nhất, kể chuyện trải nghiệm)",
    "case_study": "Case Study (phân tích tình huống thực tế, số liệu)",
    "howto": "How-to (hướng dẫn từng bước)",
    "generic": "bài viết marketing tiêu chuẩn",
}
_LANG_LABEL = {
    "vi": "tiếng Việt",
    "en": "tiếng Anh",
    "bilingual": "song ngữ Việt-Anh (mỗi đoạn tiếng Việt kèm bản dịch tiếng Anh)",
}
_CHANNEL_LABEL = {
    "facebook": "Facebook", "zalo": "Zalo", "google": "Google Ads",
    "email": "Email", "tiktok": "TikTok", "other": "đa kênh",
}


def _model() -> str:
    return settings.marketing_model or settings.llm_model


def _llm_enabled() -> bool:
    """Bật gọi Claude thật khi có API key và KHÔNG ở chế độ mock."""
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


def _call_claude_text(system: str, user: str, max_tokens: Optional[int] = None) -> Optional[str]:
    """Gọi Claude (SYNC) yêu cầu text thuần. KHÔNG raise — lỗi → None để fallback."""
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=settings.anthropic_api_key)
        resp = client.messages.create(
            model=_model(),
            max_tokens=max_tokens or settings.marketing_pipeline_max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        return (text or "").strip() or None
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("Marketing Pipeline gọi Claude lỗi (%s): %s", _model(), e)
        return None


# ---------------------------------------------------------------------------
# Ngữ cảnh chung từ pipeline
# ---------------------------------------------------------------------------

def _ctx(p: dict) -> dict:
    return {
        "topic": (p.get("topic") or "").strip(),
        "project": (p.get("project") or "").strip(),
        "audience": (p.get("audience") or "khách hàng tiềm năng").strip(),
        "fmt": _FORMAT_LABEL.get(p.get("content_format"), _FORMAT_LABEL["generic"]),
        "lang": _LANG_LABEL.get(p.get("language"), _LANG_LABEL["vi"]),
        "tone": (p.get("tone") or "chuyên nghiệp, gần gũi").strip(),
        "channel": _CHANNEL_LABEL.get(p.get("channel"), "đa kênh"),
    }


def _stage_output(p: dict, stage: str) -> str:
    return ((p.get("stages") or {}).get(stage) or {}).get("output") or ""


# ---------------------------------------------------------------------------
# Fallback templates (không cần LLM)
# ---------------------------------------------------------------------------

def _fb_research(c: dict) -> str:
    proj = f" (dự án {c['project']})" if c["project"] else ""
    return (
        f"GỢI Ý NGHIÊN CỨU CHỦ ĐỀ: {c['topic']}{proj}\n"
        f"- Đối tượng: {c['audience']}.\n"
        f"- Góc nhìn 1: Lợi ích/giá trị nổi bật của {c['topic']} với {c['audience']}.\n"
        f"- Góc nhìn 2: Nỗi lo/thắc mắc thường gặp và cách giải toả.\n"
        f"- Góc nhìn 3: So sánh/điểm khác biệt so với lựa chọn khác trên thị trường.\n"
        f"- Insight: nhu cầu thực + yếu tố ra quyết định (vị trí, pháp lý, giá, tiềm năng).\n"
        f"- Từ khoá nên nhắm: {c['topic']}, đầu tư, an cư, ưu đãi."
    )


def _fb_script(c: dict) -> str:
    return (
        f"DÀN Ý ({c['fmt']}) — chủ đề: {c['topic']}\n"
        f"1. Hook mở đầu: chạm nỗi đau/khát khao của {c['audience']}.\n"
        f"2. Bối cảnh: vì sao {c['topic']} đáng quan tâm lúc này.\n"
        f"3. Thân bài: 3 ý chính (lợi ích, dẫn chứng, điểm khác biệt).\n"
        f"4. Bằng chứng/uy tín: số liệu, pháp lý, tiến độ.\n"
        f"5. CTA: kêu gọi để lại thông tin / inbox tư vấn."
    )


def _fb_content(c: dict) -> str:
    proj = f" {c['project']}" if c["project"] else ""
    return (
        f"✨ {c['topic']}{proj}\n\n"
        f"Dành cho {c['audience']} — đây là cơ hội đáng cân nhắc. "
        f"Vị trí thuận tiện, pháp lý rõ ràng, chính sách ưu đãi hấp dẫn.\n\n"
        f"👉 Inbox ngay để nhận tư vấn chi tiết và bảng giá mới nhất trên {c['channel']}!\n\n"
        f"(Tông giọng: {c['tone']} · Định dạng: {c['fmt']})"
    )


def _fb_video(c: dict) -> str:
    return (
        f"KỊCH BẢN VIDEO NGẮN (Reels/TikTok) — {c['topic']}\n"
        f"[0-3s] HOOK: cảnh ấn tượng + câu hỏi chạm {c['audience']}.\n"
        f"[3-10s] Vấn đề: nêu nỗi lo thường gặp.\n"
        f"[10-25s] Giải pháp: 3 điểm nổi bật của {c['topic']} (text overlay).\n"
        f"[25-35s] Bằng chứng: vị trí/pháp lý/ưu đãi.\n"
        f"[35-40s] CTA: 'Inbox ngay để nhận tư vấn!'.\n"
        f"Gợi ý: nhạc trend, caption ngắn, hashtag #BĐS #{c['topic'].replace(' ', '')}."
    )


# ---------------------------------------------------------------------------
# Public — mỗi giai đoạn trả (output_text, used_llm)
# ---------------------------------------------------------------------------

def generate_research(p: dict) -> tuple[str, bool]:
    c = _ctx(p)
    if not _llm_enabled():
        return _fb_research(c), False
    system = (
        "Bạn là chuyên gia nghiên cứu nội dung marketing bất động sản người Việt. "
        "Trả về phần nghiên cứu súc tích, có cấu trúc, KHÔNG lan man."
    )
    proj = f" thuộc dự án {c['project']}" if c["project"] else ""
    user = (
        f"Nghiên cứu chủ đề: '{c['topic']}'{proj} cho kênh {c['channel']}.\n"
        f"Đối tượng: {c['audience']}.\n"
        f"Hãy đưa ra: 3-4 góc nhìn/insight khai thác được, nỗi đau & động lực mua "
        f"của khách, các yếu tố ra quyết định, và vài từ khoá nên nhắm. Viết bằng {c['lang']}."
    )
    out = _call_claude_text(system, user)
    return (out, True) if out else (_fb_research(c), False)


def generate_script(p: dict) -> tuple[str, bool]:
    c = _ctx(p)
    if not _llm_enabled():
        return _fb_script(c), False
    research = _stage_output(p, "research")
    system = (
        "Bạn là copywriter bất động sản người Việt. Lập DÀN Ý/kịch bản rõ ràng "
        "(đánh số) cho 1 bài viết, sẵn sàng để viết thành nội dung hoàn chỉnh."
    )
    user = (
        f"Chủ đề: '{c['topic']}'. Định dạng mục tiêu: {c['fmt']}. Kênh: {c['channel']}.\n"
        f"Đối tượng: {c['audience']}. Tông giọng: {c['tone']}.\n"
        + (f"Tư liệu nghiên cứu:\n{research[:2000]}\n" if research else "")
        + f"Hãy lập dàn ý mạch lạc (hook → thân → CTA). Viết bằng {c['lang']}."
    )
    out = _call_claude_text(system, user)
    return (out, True) if out else (_fb_script(c), False)


def generate_content(p: dict) -> tuple[str, bool]:
    c = _ctx(p)
    if not _llm_enabled():
        return _fb_content(c), False
    script = _stage_output(p, "script")
    research = _stage_output(p, "research")
    system = (
        "Bạn là copywriter digital marketing bất động sản người Việt, viết nội dung "
        "hấp dẫn, đúng văn phong người Việt, có CTA rõ ràng. Bám đúng định dạng yêu cầu."
    )
    user = (
        f"Viết BÀI HOÀN CHỈNH cho kênh {c['channel']} theo định dạng: {c['fmt']}.\n"
        f"Chủ đề: '{c['topic']}'"
        + (f" — dự án {c['project']}" if c["project"] else "") + ".\n"
        f"Đối tượng: {c['audience']}. Tông giọng: {c['tone']}.\n"
        + (f"Dàn ý cần bám:\n{script[:2000]}\n" if script
           else (f"Tư liệu:\n{research[:1500]}\n" if research else ""))
        + f"Yêu cầu: viết bằng {c['lang']}, tự nhiên, có CTA. "
        "Nếu là song ngữ, mỗi đoạn tiếng Việt kèm bản tiếng Anh ngay dưới."
    )
    out = _call_claude_text(system, user)
    return (out, True) if out else (_fb_content(c), False)


def generate_video_script(p: dict) -> tuple[str, bool]:
    c = _ctx(p)
    if not _llm_enabled():
        return _fb_video(c), False
    content = _stage_output(p, "content")
    system = (
        "Bạn là biên kịch video ngắn (Reels/TikTok) cho bất động sản. Viết KỊCH BẢN/"
        "STORYBOARD theo mốc thời gian — KHÔNG dựng video thật, chỉ mô tả cảnh + lời thoại."
    )
    user = (
        f"Tạo kịch bản video ngắn 30-45 giây cho chủ đề: '{c['topic']}' (kênh {c['channel']}).\n"
        f"Đối tượng: {c['audience']}. Tông giọng: {c['tone']}.\n"
        + (f"Dựa trên bài viết:\n{content[:2000]}\n" if content else "")
        + f"Bố cục theo mốc thời gian (hook → vấn đề → giải pháp → bằng chứng → CTA), "
        f"kèm gợi ý hình ảnh, text overlay, nhạc/hashtag. Viết bằng {c['lang']}."
    )
    out = _call_claude_text(system, user)
    return (out, True) if out else (_fb_video(c), False)


# Bảng điều phối: stage → hàm sinh AI.
STAGE_GENERATORS = {
    "research": generate_research,
    "script": generate_script,
    "content": generate_content,
    "video_script": generate_video_script,
}


# ---------------------------------------------------------------------------
# Tiện ích độc lập cho OpenClaw (không cần tạo pipeline trước)
# ---------------------------------------------------------------------------

def research_topic(topic: str, *, project: Optional[str] = None,
                   audience: Optional[str] = None, language: str = "vi") -> tuple[str, bool]:
    """Nghiên cứu nhanh 1 chủ đề (dùng cho tool marketing_research của OpenClaw)."""
    return generate_research({
        "topic": topic, "project": project, "audience": audience,
        "language": language, "content_format": "generic", "channel": "other",
    })


def content_from_brief(brief: str, *, channel: str = "facebook",
                       content_format: str = "generic", tone: Optional[str] = None,
                       language: str = "vi", audience: Optional[str] = None) -> tuple[str, bool]:
    """Sinh nhanh 1 bài viết từ brief tự do (tool marketing_generate_content)."""
    return generate_content({
        "topic": brief, "channel": channel, "content_format": content_format,
        "tone": tone, "language": language, "audience": audience,
    })
