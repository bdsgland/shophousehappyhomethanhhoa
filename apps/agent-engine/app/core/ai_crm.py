"""AI CRM (Phần B) — chấm điểm & insight lead bằng Claude THẬT.

Tái dùng:
  • Claude client: anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    — đúng pattern app/agents/sales_agent.py.
  • Model rẻ (haiku) qua settings.ai_crm_model để bảo vệ chi phí; fallback
    settings.llm_model nếu trống.
  • lead_store: đọc lead/history + lưu kết quả qua lead_store.apply_ai_insight.

Nguyên tắc AN TOÀN:
  • Thiếu ANTHROPIC_API_KEY (hoặc USE_MOCK_LLM=true) hoặc gọi Claude lỗi → FALLBACK
    công thức engagement cũ (lead_store.compute_ai_score) + heuristic, KHÔNG raise.
  • rescore_leads: giới hạn batch (settings.ai_crm_batch_limit), cache theo
    ai_scored_at vs updated_at để khỏi gọi thừa.

Hàm public:
  score_lead, best_contact_time, next_best_action, classify_intent,
  rescore_leads (hook import Phần A gọi), auto_pipeline.
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from datetime import datetime
from typing import Optional, Union

from app.core import lead_store
from app.core.settings import settings

log = logging.getLogger(__name__)

_VALID_TIERS = {"cold", "warm", "hot"}
_RANK = {"cold": 0, "warm": 1, "hot": 2}

# Tín hiệu intent thô — dùng cho fallback classify_intent (không cần LLM).
_INTENT_SIGNALS: dict[str, int] = {
    "đặt cọc": 25, "ký hợp đồng": 22, "xem nhà": 18, "nhà mẫu": 18,
    "hợp đồng": 15, "ký": 12, "bảng giá": 12, "thanh toán": 10,
    "khi nào bàn giao": 10, "sổ hồng": 10, "pháp lý": 8, "vay": 8,
    "giá": 8, "ngân hàng": 6, "tham khảo": 3, "hỏi thêm": 3,
}


# ---------------------------------------------------------------------------
# Cấu hình / điều kiện bật LLM
# ---------------------------------------------------------------------------

def _model() -> str:
    return settings.ai_crm_model or settings.llm_model


def _llm_enabled() -> bool:
    """Bật gọi Claude thật khi có API key và KHÔNG ở chế độ mock."""
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


# ---------------------------------------------------------------------------
# Parse JSON output từ Claude (chịu được code-fence / text thừa)
# ---------------------------------------------------------------------------

def _parse_json_block(text: Optional[str]) -> Optional[dict]:
    """Trích object JSON đầu tiên trong text. None nếu không parse được."""
    if not text:
        return None
    candidate = text.strip()
    # bỏ code fence ```json ... ```
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
    """Gọi Claude (model rẻ) yêu cầu JSON, trả dict đã parse hoặc None nếu lỗi.

    KHÔNG raise — mọi lỗi (thiếu lib, network, parse) → None để caller fallback.
    """
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=_model(),
            max_tokens=max_tokens or settings.ai_crm_max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        return _parse_json_block(text)
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("AI CRM gọi Claude lỗi (%s): %s", _model(), e)
        return None


# ---------------------------------------------------------------------------
# Tóm tắt lead + lịch sử cho prompt
# ---------------------------------------------------------------------------

def _lead_brief(lead: dict) -> str:
    return (
        f"Tên: {lead.get('name') or '(trống)'}; "
        f"nguồn: {lead.get('source')}; "
        f"trạng thái: {lead.get('status')}; "
        f"đã đăng ký web: {bool(lead.get('registered'))}; "
        f"số booking: {lead.get('booking_count', 0)}; "
        f"liên hệ hiệu quả: {lead.get('effective_contact_count', 0)}; "
        f"tổng liên hệ: {lead.get('contact_count', 0)}; "
        f"lần cuối liên hệ: {lead.get('last_contact_at') or 'chưa từng'}; "
        f"ghi chú: {(lead.get('note') or '(không)')[:300]}"
    )


def _summarize_history(history: Optional[list]) -> str:
    history = history or []
    if not history:
        return "Chưa có lịch sử liên hệ."
    outcomes = Counter(h.get("outcome") for h in history if h.get("outcome"))
    channels = sorted({h.get("channel") for h in history if h.get("channel")})
    last = history[0]  # list_contact_logs đã sort created_at desc
    out_str = ", ".join(f"{k}×{v}" for k, v in outcomes.items()) or "—"
    return (
        f"Tổng {len(history)} lần liên hệ. Kết quả: {out_str}. "
        f"Kênh: {', '.join(channels) or '—'}. "
        f"Gần nhất: {last.get('channel')} → {last.get('outcome')} "
        f"({last.get('created_at')}); ghi chú: {(last.get('note') or '')[:140]}"
    )


def _effective_hours(history: Optional[list]) -> list[int]:
    """Giờ (UTC) của các lần liên hệ hiệu quả (outcome != no_answer)."""
    hours: list[int] = []
    for h in history or []:
        if h.get("outcome") in (None, "no_answer"):
            continue
        ts = h.get("created_at")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", ""))
            hours.append(dt.hour)
        except ValueError:
            continue
    return hours


# ---------------------------------------------------------------------------
# Fallback heuristic (không cần LLM)
# ---------------------------------------------------------------------------

def _tier_for(score: int) -> str:
    if score >= settings.ai_crm_hot_threshold:
        return "hot"
    if score >= settings.ai_crm_warm_threshold:
        return "warm"
    return "cold"


def _fallback_score(lead: dict) -> dict:
    """Chấm điểm bằng công thức engagement cũ (lead_store.compute_ai_score)."""
    score = lead_store.compute_ai_score(lead)
    return {
        "score": score,
        "tier": _tier_for(score),
        "reason": "Chấm theo công thức engagement (chưa bật LLM).",
    }


def _fallback_best_time(history: Optional[list]) -> str:
    hours = _effective_hours(history)
    if hours:
        top = Counter(hours).most_common(1)[0][0]
        lo, hi = top, (top + 1) % 24
        return f"Khoảng {lo:02d}:00–{hi:02d}:00 (theo lịch sử liên hệ hiệu quả)."
    return "Khung 19:00–21:00 các ngày trong tuần (mặc định khách bận giờ hành chính)."


def _fallback_next_action(lead: dict, history: Optional[list]) -> dict:
    status = lead.get("status")
    days = lead.get("days_since_contact")
    if status == "hot":
        action = "Gọi ngay trong hôm nay, chuẩn bị bảng giá + lịch xem nhà mẫu."
    elif status == "warm":
        action = "Gọi lại trong 1–2 ngày, gửi thông tin căn phù hợp nhu cầu."
    elif lead.get("booking_count", 0) >= 1:
        action = "Xác nhận lịch xem nhà đã đặt, nhắc khách trước 1 ngày."
    elif days is not None and days >= 7:
        action = "Lead nguội lâu — nhắn Zalo nhẹ nhàng hâm nóng lại."
    else:
        action = "Liên hệ lần đầu để xác định nhu cầu & ngân sách."
    return {
        "summary": _summarize_history(history),
        "suggested_action": action,
    }


def _fallback_intent(text: str) -> dict:
    t = (text or "").lower()
    heat = min(sum(w for kw, w in _INTENT_SIGNALS.items() if kw in t), 100)
    if "đặt cọc" in t or "ký hợp đồng" in t or "ký hđ" in t:
        intent = "ready_to_close"
    elif "xem nhà" in t or "nhà mẫu" in t or "đặt lịch" in t:
        intent = "schedule_visit"
    elif "giá" in t or "thanh toán" in t or "vay" in t:
        intent = "pricing_inquiry"
    elif heat > 0:
        intent = "interested"
    else:
        intent = "general"
    return {"intent": intent, "heat": heat}


# ---------------------------------------------------------------------------
# Chuẩn hoá output LLM
# ---------------------------------------------------------------------------

def _coerce_score(obj: Optional[dict]) -> Optional[dict]:
    if not isinstance(obj, dict):
        return None
    raw = obj.get("score")
    try:
        score = int(round(float(raw)))
    except (TypeError, ValueError):
        return None
    score = max(0, min(100, score))
    tier = str(obj.get("tier") or "").lower().strip()
    if tier not in _VALID_TIERS:
        tier = _tier_for(score)
    reason = str(obj.get("reason") or "").strip()[:200] or "Không có lý do."
    return {"score": score, "tier": tier, "reason": reason}


# ---------------------------------------------------------------------------
# Public API — score / time / action / intent
# ---------------------------------------------------------------------------

async def score_lead(lead: dict, history: Optional[list] = None) -> dict:
    """{score 0-100, tier cold/warm/hot, reason ngắn}. Fallback nếu thiếu LLM/lỗi."""
    if not _llm_enabled():
        return _fallback_score(lead)
    system = (
        "Bạn là trợ lý CRM bất động sản cao cấp. Chấm độ sẵn sàng mua của khách "
        "trên thang 0-100 dựa vào engagement & nhu cầu. CHỈ trả JSON, không giải "
        'thích thêm. Định dạng: {"score": <int 0-100>, "tier": "cold|warm|hot", '
        '"reason": "<lý do ≤20 từ, tiếng Việt>"}.'
    )
    user = f"Khách:\n{_lead_brief(lead)}\n\nLịch sử:\n{_summarize_history(history)}"
    parsed = _coerce_score(await _call_claude_json(system, user))
    return parsed or _fallback_score(lead)


async def best_contact_time(lead: dict, history: Optional[list] = None) -> str:
    """Khung giờ/ngày gợi ý để liên hệ. Heuristic từ lịch sử + LLM tinh chỉnh."""
    base = _fallback_best_time(history)
    if not _llm_enabled():
        return base
    system = (
        "Bạn là trợ lý CRM BĐS. Gợi ý KHUNG GIỜ + NGÀY tốt nhất để gọi khách, "
        'tiếng Việt, ngắn gọn. CHỈ trả JSON: {"best_time": "<chuỗi ngắn>"}.'
    )
    user = (
        f"Khách:\n{_lead_brief(lead)}\n\nLịch sử:\n{_summarize_history(history)}\n\n"
        f"Gợi ý heuristic tham khảo: {base}"
    )
    obj = await _call_claude_json(system, user)
    if isinstance(obj, dict) and str(obj.get("best_time") or "").strip():
        return str(obj["best_time"]).strip()[:160]
    return base


async def next_best_action(lead: dict, history: Optional[list] = None) -> dict:
    """{summary, suggested_action} — bước tiếp theo nên làm với lead."""
    fallback = _fallback_next_action(lead, history)
    if not _llm_enabled():
        return fallback
    system = (
        "Bạn là trưởng nhóm sale BĐS. Tóm tắt tình trạng khách (1 câu) và đề xuất "
        'HÀNH ĐỘNG TIẾP THEO cụ thể (1 câu) cho sale. CHỈ trả JSON: '
        '{"summary": "<1 câu>", "suggested_action": "<1 câu>"}.'
    )
    user = f"Khách:\n{_lead_brief(lead)}\n\nLịch sử:\n{_summarize_history(history)}"
    obj = await _call_claude_json(system, user)
    if isinstance(obj, dict):
        summary = str(obj.get("summary") or "").strip()
        action = str(obj.get("suggested_action") or "").strip()
        if summary or action:
            return {
                "summary": (summary or fallback["summary"])[:300],
                "suggested_action": (action or fallback["suggested_action"])[:300],
            }
    return fallback


async def classify_intent(text: str) -> dict:
    """{intent, heat 0-100} từ 1 đoạn text của khách (thay keyword bằng LLM)."""
    if not _llm_enabled():
        return _fallback_intent(text)
    system = (
        "Phân loại ý định của khách BĐS từ tin nhắn. CHỈ trả JSON: "
        '{"intent": "<general|interested|pricing_inquiry|schedule_visit|'
        'ready_to_close>", "heat": <int 0-100 độ nóng>}.'
    )
    obj = await _call_claude_json(system, f"Tin nhắn khách: {text}")
    if isinstance(obj, dict) and obj.get("intent"):
        try:
            heat = max(0, min(100, int(round(float(obj.get("heat", 0))))))
        except (TypeError, ValueError):
            heat = _fallback_intent(text)["heat"]
        return {"intent": str(obj["intent"]).strip()[:40], "heat": heat}
    return _fallback_intent(text)


# ---------------------------------------------------------------------------
# Auto-pipeline — đổi status theo score + hành vi (chỉ NÂNG, không hạ)
# ---------------------------------------------------------------------------

def auto_pipeline(lead: dict) -> Optional[str]:
    """Trạng thái mới gợi ý theo ai_score + hành vi. None = giữ nguyên.

    Ngưỡng cấu hình: hot>=ai_crm_hot_threshold, warm>=ai_crm_warm_threshold.
    KHÔNG đụng status cuối (customer/lost) và chỉ NÂNG cấp (không tự hạ bậc).
    """
    status = lead.get("status")
    if status in ("customer", "lost"):
        return None
    score = lead.get("ai_score", 0) or 0
    hot_behavior = lead.get("registered") and lead.get("booking_count", 0) >= 1
    if score >= settings.ai_crm_hot_threshold or hot_behavior:
        target = "hot"
    elif score >= settings.ai_crm_warm_threshold:
        target = "warm"
    else:
        target = "cold"
    if _RANK.get(target, 0) > _RANK.get(status, 0):
        return target
    return None


# ---------------------------------------------------------------------------
# Batch rescore (hook import Phần A gọi qua tên rescore_leads)
# ---------------------------------------------------------------------------

def _already_scored(lead: dict) -> bool:
    """Đã chấm AI sau lần cập nhật gần nhất chưa? (cache theo timestamp ISO)."""
    scored = lead.get("ai_scored_at")
    if not scored:
        return False
    updated = lead.get("updated_at") or ""
    return str(scored) >= str(updated)


def _resolve_ids(lead_ids: Union[None, str, list]) -> list[str]:
    """None hoặc 'all' → toàn bộ lead chưa mất (lost). list → đúng list đó."""
    if lead_ids is None or lead_ids == "all":
        page = lead_store.list_all_leads(page=1, page_size=10000)
        return [
            l["id"] for l in page["items"] if l.get("status") != "lost"
        ]
    if isinstance(lead_ids, str):
        return [lead_ids]
    return [str(x) for x in lead_ids]


async def rescore_leads(
    lead_ids: Union[None, str, list] = None, *, force: bool = False
) -> int:
    """Chấm điểm AI hàng loạt. Trả SỐ lead đã chấm trong lần này.

    - lead_ids: None / "all" → toàn bộ; list[str] → các lead chỉ định
      (hook import Phần A truyền created_ids).
    - Giới hạn settings.ai_crm_batch_limit lead/lần (bảo vệ chi phí).
    - Bỏ qua lead đã chấm sau lần update gần nhất (trừ khi force=True).
    - An toàn: mỗi lead lỗi không làm hỏng cả batch; thiếu LLM → fallback.
    """
    ids = _resolve_ids(lead_ids)[: settings.ai_crm_batch_limit]
    scored = 0
    for lid in ids:
        try:
            lead = lead_store.get_lead(lid)
            if not lead:
                continue
            if not force and _already_scored(lead):
                continue
            history = lead_store.list_contact_logs(lid)
            sc = await score_lead(lead, history)
            bt = await best_contact_time(lead, history)
            nba = await next_best_action(lead, history)
            new_status = auto_pipeline({**lead, "ai_score": sc["score"]})
            lead_store.apply_ai_insight(
                lid,
                ai_score=sc["score"],
                ai_reason=sc["reason"],
                ai_tier=sc["tier"],
                ai_best_time=bt,
                ai_next_action=nba,
                new_status=new_status,
            )
            scored += 1
        except Exception as e:  # noqa: BLE001 — 1 lead lỗi không chặn batch
            log.warning("rescore_leads bỏ qua lead %s do lỗi: %s", lid, e)
            continue
    return scored
