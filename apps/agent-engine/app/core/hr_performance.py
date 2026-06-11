"""HR — báo cáo hiệu suất nhân sự bằng Claude THẬT.

Tái dùng đúng pattern app/core/ai_crm.py:
  • Claude client: anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
  • Model rẻ (haiku) qua settings.ai_crm_model, fallback settings.llm_model.
  • Thiếu ANTHROPIC_API_KEY (hoặc USE_MOCK_LLM=true) hoặc gọi Claude lỗi →
    FALLBACK heuristic tiếng Việt, KHÔNG raise.

Đầu vào: tổng hợp số liệu 1 nhân sự (mục tiêu vs thực tế, deal, lead, cuộc gọi,
hoa hồng). Đầu ra: nhận xét hiệu suất + điểm mạnh/yếu + đề xuất (tiếng Việt).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Optional

from app.core.settings import settings

log = logging.getLogger(__name__)

# Nhãn tiếng Việt + đơn vị cho từng chỉ số (dùng dựng prompt + fallback).
_METRIC_LABELS: dict[str, str] = {
    "revenue": "Doanh số (VND)",
    "commission": "Hoa hồng nhận (VND)",
    "deals": "Số deal đóng",
    "leads": "Số lead thêm mới",
    "contacts": "Số cuộc gọi/liên hệ",
    "meetings": "Số cuộc hẹn",
}


def _model() -> str:
    return settings.ai_crm_model or settings.llm_model


def _llm_enabled() -> bool:
    return bool(settings.anthropic_api_key) and not settings.use_mock_llm


def _parse_json_block(text: Optional[str]) -> Optional[dict]:
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


async def _call_claude_json(system: str, user: str) -> Optional[dict]:
    """Gọi Claude yêu cầu JSON. KHÔNG raise — lỗi → None để caller fallback."""
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=_model(),
            max_tokens=900,  # báo cáo dài hơn scoring → cấp thêm token
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        return _parse_json_block(text)
    except Exception as e:  # noqa: BLE001 — fallback an toàn
        log.warning("HR performance gọi Claude lỗi (%s): %s", _model(), e)
        return None


# ---------------------------------------------------------------------------
# Tổng hợp số liệu cho prompt
# ---------------------------------------------------------------------------

def _fmt(metric: str, value: float) -> str:
    if metric in ("revenue", "commission"):
        return f"{value:,.0f} đ"
    return f"{value:,.0f}"


def _build_metrics_block(actuals: dict, objectives: list[dict]) -> str:
    lines = ["Số liệu thực tế (tổng hợp tự động):"]
    for k, label in _METRIC_LABELS.items():
        lines.append(f"  - {label}: {_fmt(k, float(actuals.get(k, 0) or 0))}")
    if objectives:
        lines.append("\nMục tiêu KPI (kỳ / chỉ tiêu → thực tế / % hoàn thành):")
        for o in objectives:
            label = _METRIC_LABELS.get(o["metric"], o["metric"])
            lines.append(
                f"  - [{o['period']}] {label}: mục tiêu {_fmt(o['metric'], o['target'])}, "
                f"thực tế {_fmt(o['metric'], o['actual'])} "
                f"({o['completion_pct']:.0f}%)"
            )
    else:
        lines.append("\nMục tiêu KPI: chưa thiết lập.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Fallback heuristic (không cần LLM)
# ---------------------------------------------------------------------------

def _fallback(staff: dict, actuals: dict, objectives: list[dict]) -> dict:
    name = staff.get("full_name") or "Nhân sự"
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendations: list[str] = []

    # Đánh giá theo % hoàn thành mục tiêu.
    if objectives:
        avg = sum(o["completion_pct"] for o in objectives) / len(objectives)
        for o in objectives:
            label = _METRIC_LABELS.get(o["metric"], o["metric"])
            if o["completion_pct"] >= 100:
                strengths.append(f"Đạt/vượt mục tiêu {label} kỳ {o['period']} "
                                 f"({o['completion_pct']:.0f}%).")
            elif o["completion_pct"] < 60:
                weaknesses.append(f"Mục tiêu {label} kỳ {o['period']} mới đạt "
                                  f"{o['completion_pct']:.0f}%.")
                recommendations.append(f"Tập trung cải thiện {label} để bám sát mục tiêu kỳ.")
        if avg >= 100:
            summary = f"{name} hoàn thành tốt các mục tiêu kỳ (trung bình {avg:.0f}%)."
        elif avg >= 70:
            summary = f"{name} đạt phần lớn mục tiêu (trung bình {avg:.0f}%), còn dư địa cải thiện."
        else:
            summary = f"{name} chưa đạt mục tiêu kỳ (trung bình {avg:.0f}%), cần hỗ trợ thêm."
    else:
        summary = (f"{name} chưa có mục tiêu KPI thiết lập — đánh giá dựa trên hoạt động "
                   f"thực tế hiện có.")
        recommendations.append("Thiết lập mục tiêu KPI theo kỳ để theo dõi hiệu suất.")

    # Tín hiệu từ hoạt động thực tế.
    if float(actuals.get("deals", 0) or 0) > 0:
        strengths.append(f"Đã chốt {actuals['deals']:.0f} deal.")
    if float(actuals.get("contacts", 0) or 0) == 0:
        weaknesses.append("Chưa ghi nhận hoạt động liên hệ/cuộc gọi.")
        recommendations.append("Tăng số cuộc gọi/liên hệ khách hàng hằng ngày.")
    if float(actuals.get("leads", 0) or 0) == 0:
        recommendations.append("Bổ sung lead mới đều đặn vào pipeline.")

    if not strengths:
        strengths.append("Đang trong giai đoạn tích lũy dữ liệu hoạt động.")
    if not weaknesses:
        weaknesses.append("Chưa phát hiện điểm yếu rõ rệt từ dữ liệu hiện có.")
    if not recommendations:
        recommendations.append("Duy trì nhịp độ làm việc và cập nhật hoạt động đều đặn.")

    return {
        "summary": summary,
        "strengths": strengths[:5],
        "weaknesses": weaknesses[:5],
        "recommendations": recommendations[:5],
    }


def _coerce_report(obj: Optional[dict]) -> Optional[dict]:
    if not isinstance(obj, dict):
        return None
    summary = str(obj.get("summary") or "").strip()
    if not summary:
        return None

    def _list(key: str) -> list[str]:
        val = obj.get(key)
        if isinstance(val, list):
            return [str(x).strip() for x in val if str(x).strip()][:6]
        if isinstance(val, str) and val.strip():
            return [val.strip()]
        return []

    return {
        "summary": summary[:1000],
        "strengths": _list("strengths") or ["—"],
        "weaknesses": _list("weaknesses") or ["—"],
        "recommendations": _list("recommendations") or ["—"],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_report(staff: dict, objectives: list[dict]) -> dict:
    """Sinh báo cáo hiệu suất 1 nhân sự.

    staff: user dict (full_name, role, ...). objectives: list view objective
    (đã kèm target/actual/completion_pct) của nhân sự đó.
    Trả dict: {staff_id, staff_name, role, generated_at, ai_used, summary,
    strengths, weaknesses, recommendations, metrics}.
    """
    from app.core import hr_objectives_store

    staff_id = staff.get("id")
    actuals = hr_objectives_store.all_actuals(staff_id, None)

    base = {
        "staff_id": staff_id,
        "staff_name": staff.get("full_name") or "",
        "role": staff.get("role") or "",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "metrics": {**actuals},
    }

    fb = _fallback(staff, actuals, objectives)
    if not _llm_enabled():
        return {**base, "ai_used": False, **fb}

    system = (
        "Bạn là Giám đốc nhân sự kiêm trưởng phòng kinh doanh bất động sản cao cấp. "
        "Dựa trên số liệu hiệu suất của 1 nhân sự, hãy viết đánh giá NGẮN GỌN, "
        "CHUYÊN NGHIỆP, mang tính xây dựng bằng TIẾNG VIỆT. CHỈ trả JSON đúng định "
        'dạng: {"summary": "<nhận xét tổng quan 2-4 câu>", "strengths": ["<điểm '
        'mạnh>"...], "weaknesses": ["<điểm cần cải thiện>"...], "recommendations": '
        '["<đề xuất hành động cụ thể>"...]}. Mỗi mảng 2-4 mục, mỗi mục 1 câu.'
    )
    user = (
        f"Nhân sự: {staff.get('full_name')}\n"
        f"Vai trò: {staff.get('role')}\n\n"
        f"{_build_metrics_block(actuals, objectives)}"
    )
    parsed = _coerce_report(await _call_claude_json(system, user))
    if parsed:
        return {**base, "ai_used": True, **parsed}
    return {**base, "ai_used": False, **fb}
