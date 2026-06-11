"""Phân tích TÀI CHÍNH bằng Claude — tóm tắt tình hình + điểm đáng chú ý + dự báo.

Tái dùng đúng pattern app/core/ai_crm.py:
  • Claude client: anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key).
  • Model rẻ (haiku) qua settings.finance_ai_model; fallback settings.llm_model.

AN TOÀN: thiếu ANTHROPIC_API_KEY (hoặc USE_MOCK_LLM=true) hoặc gọi Claude lỗi →
FALLBACK bản tóm tắt heuristic (không raise). Con số DỰ BÁO luôn do
finance_service.forecast() tính bằng Python (xác định, không phụ thuộc LLM); LLM
chỉ viết phần diễn giải. Nhờ vậy chart/số liệu luôn ổn định.
"""

from __future__ import annotations

import logging
from datetime import datetime

from app.core import finance_service
from app.core.settings import settings

log = logging.getLogger(__name__)


def _model() -> str:
    return settings.finance_ai_model or settings.llm_model


def _llm_enabled() -> bool:
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


def _fmt_vnd(n: float) -> str:
    return f"{round(n):,}".replace(",", ".") + " ₫"


def _facts_block(overview: dict, fc: dict) -> str:
    s = overview["summary"]
    monthly = overview["monthly"]
    breakdown = overview["cost_breakdown"]
    rb = overview["revenue_breakdown"]

    lines = [
        f"Kỳ: {s['period_label']} ({s['start']} → {s['end']}).",
        f"Doanh thu: {_fmt_vnd(s['revenue'])} "
        f"(hoa hồng {_fmt_vnd(rb.get('commission', 0))}, "
        f"thủ công {_fmt_vnd(rb.get('manual', 0))}).",
        f"Chi phí: {_fmt_vnd(s['cost'])}. "
        f"Lợi nhuận: {_fmt_vnd(s['profit'])} (biên {s['margin']}%).",
        f"Số deal có hoa hồng trong kỳ: {s['deal_count']}; "
        f"tổng khách đã chốt: {s['customer_count']}.",
    ]
    if breakdown:
        cats = "; ".join(
            f"{b['category']} {_fmt_vnd(b['amount'])} ({b['percentage']}%)"
            for b in breakdown
        )
        lines.append(f"Cơ cấu chi phí: {cats}.")
    if monthly:
        tail = monthly[-6:]
        trend = ", ".join(
            f"{m['month']}: DT {_fmt_vnd(m['revenue'])}/CP {_fmt_vnd(m['cost'])}/LN {_fmt_vnd(m['profit'])}"
            for m in tail
        )
        lines.append(f"Xu hướng tháng gần đây — {trend}.")
    lines.append(
        f"Dự báo {fc['next_period_label']} (đã tính sẵn): "
        f"DT {_fmt_vnd(fc['revenue'])}, CP {_fmt_vnd(fc['cost'])}, "
        f"LN {_fmt_vnd(fc['profit'])}."
    )
    return "\n".join(lines)


def _fallback_summary(overview: dict, fc: dict) -> str:
    s = overview["summary"]
    breakdown = overview["cost_breakdown"]
    top_cost = breakdown[0] if breakdown else None
    parts = [
        f"**Tổng quan {s['period_label']}**",
        f"- Doanh thu {_fmt_vnd(s['revenue'])}, chi phí {_fmt_vnd(s['cost'])}, "
        f"lợi nhuận {_fmt_vnd(s['profit'])} (biên {s['margin']}%).",
    ]
    if s["profit"] < 0:
        parts.append(
            "- ⚠️ Đang **lỗ** trong kỳ — cần tăng deal chốt hoặc cắt giảm chi phí."
        )
    elif s["margin"] < 20:
        parts.append("- Biên lợi nhuận mỏng (<20%) — nên tối ưu chi phí cố định.")
    else:
        parts.append("- Biên lợi nhuận ở mức lành mạnh.")
    if top_cost:
        parts.append(
            f"- Hạng mục chi phí lớn nhất: **{top_cost['category']}** "
            f"({_fmt_vnd(top_cost['amount'])}, {top_cost['percentage']}%)."
        )
    if s["deal_count"] == 0:
        parts.append(
            "- Chưa ghi nhận hoa hồng deal nào trong kỳ — doanh thu phụ thuộc "
            "khoản nhập tay. Kiểm tra luồng commission từ n8n."
        )
    parts.append(
        f"- **Dự báo {fc['next_period_label']}**: doanh thu ~{_fmt_vnd(fc['revenue'])}, "
        f"chi phí ~{_fmt_vnd(fc['cost'])}, lợi nhuận ~{_fmt_vnd(fc['profit'])} "
        f"({fc['method']})."
    )
    parts.append(
        "\n_(Bản tóm tắt tự động — chưa bật AI. Cấu hình ANTHROPIC_API_KEY để có "
        "phân tích chi tiết hơn.)_"
    )
    return "\n".join(parts)


async def _call_claude_text(system: str, user: str) -> str:
    """Gọi Claude trả về text. KHÔNG raise — lỗi trả chuỗi rỗng để caller fallback."""
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=_model(),
            max_tokens=settings.finance_ai_max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return (resp.content[0].text if resp.content else "").strip()
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("Finance AI gọi Claude lỗi (%s): %s", _model(), e)
        return ""


async def analyze(period: str = "month") -> dict:
    """Phân tích tài chính + dự báo. Trả dict khớp schema FinanceAIAnalysis."""
    ov = finance_service.overview(period)
    fc = finance_service.forecast(period)
    generated_at = datetime.utcnow().isoformat() + "Z"
    base = {
        "forecast": fc,
        "period_label": ov["summary"]["period_label"],
        "generated_at": generated_at,
    }

    if not _llm_enabled():
        return {**base, "source": "fallback", "summary": _fallback_summary(ov, fc)}

    system = (
        "Bạn là giám đốc tài chính (CFO) của một công ty môi giới bất động sản "
        "cao cấp tại Việt Nam. Dựa trên số liệu được cung cấp, hãy viết một bản "
        "phân tích NGẮN GỌN bằng tiếng Việt, dùng markdown. Cấu trúc gồm: (1) "
        "Tổng quan tình hình; (2) Điểm đáng chú ý / rủi ro; (3) Dự báo kỳ tới và "
        "khuyến nghị hành động. Bám sát con số đã cho, KHÔNG bịa thêm số liệu. "
        "Phần dự báo dùng đúng con số đã được tính sẵn. Tối đa ~250 từ."
    )
    user = "Số liệu tài chính:\n" + _facts_block(ov, fc)
    text = await _call_claude_text(system, user)
    if not text:
        return {**base, "source": "fallback", "summary": _fallback_summary(ov, fc)}
    return {**base, "source": "ai", "summary": text}
