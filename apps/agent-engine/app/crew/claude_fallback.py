"""Fallback CHẤT LƯỢNG bằng Claude THẬT cho Sales Crew — KHÔNG cần crewai.

Khi crew bật (CREW_ENABLED=true) nhưng thư viện crewai CHƯA cài (build nhẹ),
mà CÓ ANTHROPIC_API_KEY và không ở chế độ mock, module này gọi thẳng Anthropic
(client `Anthropic` sync — vì run_for_lead là hàm sync) để sinh:
  - phân tích chân dung + mức độ sẵn sàng (1-5),
  - 1-3 hành động đề xuất (ưu tiên + lý do),
  - 1 tin nhắn chăm sóc NHÁP.

Trả về CÙNG schema với engine="crewai"/"heuristic" để service.run_for_lead gom
thống nhất. NÉM exception khi lỗi → caller bắt và rơi tiếp về heuristic (không LLM)
nên request không bao giờ hỏng.

NGUYÊN TẮC AN TOÀN: chỉ sinh NHÁP, không gửi tin / không ghi CRM.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.core.settings import settings
from app.crew.sales_crew import agent_templates

log = logging.getLogger("crew.claude")


_SYSTEM = (
    "Bạn là 'Đội Sale AI' của một sàn bất động sản (dự án Eurowindow Light City). "
    "Đội gồm 3 vai trò phối hợp: Tư vấn viên (hiểu nhu cầu, khớp sản phẩm), "
    "Chăm sóc (soạn tin nhắn giữ tương tác đúng giai đoạn), và Chốt deal (đề xuất "
    "bước hành động đẩy lead tiến gần quyết định).\n\n"
    "Nhiệm vụ: phân tích MỘT lead dựa trên hồ sơ CRM + tri thức dự án nội bộ, rồi "
    "trả kết quả. TUYỆT ĐỐI chỉ dựa trên dữ liệu được cung cấp, KHÔNG bịa thông tin "
    "về giá/pháp lý/chính sách. Mọi tin nhắn chỉ là BẢN NHÁP để nhân viên sale duyệt "
    "trước khi gửi — không tự gửi.\n\n"
    "CHỈ trả về MỘT khối JSON hợp lệ (không kèm giải thích ngoài JSON), đúng schema:\n"
    "{\n"
    '  "summary": "<tóm tắt chân dung + nhu cầu suy đoán, tối đa 6 dòng>",\n'
    '  "readiness": <số nguyên 1-5, mức độ sẵn sàng xuống tiền>,\n'
    '  "recommended_actions": [\n'
    '    {"priority": "cao|trung bình|thường", "action": "<hành động cụ thể>", "reason": "<lý do ngắn>"}\n'
    "  ],\n"
    '  "draft_message": "<1 tin nhắn chăm sóc NHÁP bằng tiếng Việt, lịch sự, đúng ngữ cảnh>",\n'
    '  "suggested_channel": "zalo|sms|email",\n'
    '  "suggested_time": "<thời điểm gửi gợi ý, ví dụ: trong 24h, tối T5 19-20h>"\n'
    "}\n"
    "Toàn bộ nội dung bằng tiếng Việt."
)


def _build_user_prompt(lead_ctx: Dict[str, Any], knowledge_text: str, channel: str) -> str:
    ctx_json = json.dumps(lead_ctx, ensure_ascii=False, default=str)
    kb = (knowledge_text or "").strip() or "(không có tri thức Dify khả dụng)"
    return (
        f"HỒ SƠ LEAD (CRM nội bộ):\n{ctx_json}\n\n"
        f"TRI THỨC DỰ ÁN THAM KHẢO:\n{kb}\n\n"
        f"Kênh ưu tiên đề xuất nếu phù hợp: {channel}.\n"
        "Hãy phân tích và trả JSON đúng schema đã mô tả."
    )


def _parse_json_block(text: Optional[str]) -> Optional[dict]:
    """Trích khối JSON đầu tiên trong text (kể cả khi bị bọc ```json). None nếu lỗi."""
    if not text:
        return None
    raw = text.strip()
    # Gỡ rào code fence nếu có.
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001 — thử bắt {...} lồng trong text
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:  # noqa: BLE001
            return None


def _coerce_actions(obj: Any) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    if isinstance(obj, list):
        for it in obj[:5]:
            if isinstance(it, dict):
                out.append({
                    "priority": str(it.get("priority") or "thường"),
                    "action": str(it.get("action") or "").strip(),
                    "reason": str(it.get("reason") or "").strip(),
                })
            elif isinstance(it, str):
                out.append({"priority": "thường", "action": it.strip(), "reason": ""})
    return [a for a in out if a["action"]]


def run_claude_analysis(
    lead_ctx: Dict[str, Any], knowledge_text: str, channel: str = "zalo"
) -> Dict[str, Any]:
    """Gọi Claude THẬT (sync) sinh phân tích + nháp. NÉM exception nếu lỗi.

    Trả schema thống nhất với engine='claude-direct'."""
    from anthropic import Anthropic  # lazy import — anthropic đã có trong requirements.txt

    model = settings.crew_model_resolved()
    client = Anthropic(api_key=settings.anthropic_api_key)
    resp = client.messages.create(
        model=model,
        max_tokens=settings.crew_max_tokens,
        system=_SYSTEM,
        messages=[{"role": "user", "content": _build_user_prompt(lead_ctx, knowledge_text, channel)}],
    )
    text = resp.content[0].text if resp.content else ""
    data = _parse_json_block(text)
    if not data or not isinstance(data, dict):
        raise ValueError("Claude trả nội dung không phải JSON hợp lệ cho crew fallback")

    # Chuẩn hoá readiness về int 1-5.
    try:
        readiness = int(data.get("readiness"))
    except Exception:  # noqa: BLE001
        readiness = 3
    readiness = max(1, min(5, readiness))

    actions = _coerce_actions(data.get("recommended_actions"))
    if not actions:
        actions = [{
            "priority": "thường",
            "action": "Liên hệ lại làm rõ nhu cầu (khu vực, ngân sách, loại căn).",
            "reason": "Chưa đủ tín hiệu để đề xuất bước cụ thể hơn.",
        }]

    draft_text = str(data.get("draft_message") or "").strip()
    sugg_channel = str(data.get("suggested_channel") or channel).strip() or channel
    sugg_time = str(data.get("suggested_time") or "").strip()
    draft_message = {
        "channel": sugg_channel,
        "draft": draft_text,
        "suggested_time": sugg_time,
        "requires_confirmation": True,
        "auto_sent": False,
    }

    return {
        "engine": "claude-direct",
        "model": model,
        "summary": str(data.get("summary") or "").strip(),
        "readiness": readiness,
        "recommended_actions": actions,
        "draft_messages": [draft_message],
        "agents": [t["name"] for t in agent_templates()],
    }
