"""Bộ não "Đội Sale AI" bằng Claude THẬT — KHÔNG cần crewai (engine=claude-direct).

Khi crew bật (CREW_ENABLED=true) nhưng thư viện crewai CHƯA cài (build nhẹ), mà CÓ
ANTHROPIC_API_KEY và không ở chế độ mock, module này gọi thẳng Anthropic (client
`Anthropic` sync — vì run_for_lead là hàm sync) để sinh PHÂN TÍCH CHUYÊN GIA cho 1
khách dựa trên NGỮ CẢNH ĐẦY ĐỦ:
  - Hồ sơ 360 + NHU CẦU (product_type / region / budget / purpose),
  - Lịch sử hội thoại đa kênh (contact logs),
  - Tri thức dự án từ Dify (nếu cấu hình),
  - DANH SÁCH CĂN phù hợp từ inventory (đã khớp % ở Python — đưa vào prompt).

Xuất JSON CÓ CẤU TRÚC, ổn định (siêu tập tương thích ngược với heuristic):
  summary · potential_score(+reason) · readiness · next_best_action(+timing) ·
  recommended_actions[] · draft_messages[] (kịch bản theo từng kênh).

NÉM exception khi lỗi → caller (service) bắt và rơi tiếp về heuristic (không LLM)
nên request không bao giờ hỏng.

NGUYÊN TẮC AN TOÀN: CHỈ sinh NHÁP, KHÔNG gửi tin / KHÔNG ghi CRM.
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
    "Bạn là TRƯỞNG NHÓM 'Đội Sale AI' của một sàn môi giới bất động sản cao cấp "
    "(dự án Happy Home Thanh Hóa) — một chuyên gia môi giới dày dạn, tinh tế, lấy "
    "khách làm trung tâm và giỏi chốt sale có đạo đức. Bạn điều phối 3 vai trò: "
    "Tư vấn viên (hiểu nhu cầu, khớp sản phẩm), Chăm sóc (nuôi dưỡng quan hệ đúng "
    "thời điểm) và Chốt deal (đề xuất bước đẩy khách tiến gần quyết định).\n\n"
    "NHIỆM VỤ: phân tích MỘT khách hàng dựa trên hồ sơ 360 + lịch sử hội thoại + "
    "tri thức dự án nội bộ + danh sách CĂN PHÙ HỢP đã khớp sẵn, rồi đưa ra chiến "
    "lược chăm sóc tiếp theo TỐT NHẤT (next-best-action) cùng KỊCH BẢN TIN NHẮN "
    "NHÁP theo từng kênh phù hợp.\n\n"
    "NGUYÊN TẮC:\n"
    "- CHỈ dựa trên dữ liệu được cung cấp. TUYỆT ĐỐI không bịa giá/pháp lý/chính "
    "sách/tiến độ. Khi không chắc → đề xuất hỏi lại khách hoặc kiểm tra nội bộ.\n"
    "- Cá nhân hoá theo nhu cầu (loại sản phẩm, ngân sách, mục đích, khu vực) và "
    "giai đoạn quan tâm. Tránh spam, tôn trọng khách.\n"
    "- Khi đề xuất căn, ưu tiên đúng các căn trong DANH SÁCH PHÙ HỢP (theo unit_id) "
    "và nêu lý do khớp nhu cầu.\n"
    "- Mọi tin nhắn chỉ là BẢN NHÁP để nhân viên sale duyệt trước khi gửi — KHÔNG "
    "tự gửi.\n\n"
    "CHỈ trả về MỘT khối JSON hợp lệ (không kèm chữ ngoài JSON), đúng schema:\n"
    "{\n"
    '  "summary": "<tóm tắt tình hình + chân dung + nhu cầu suy đoán, tối đa 6 dòng>",\n'
    '  "potential_score": <số nguyên 0-100, điểm tiềm năng chốt>,\n'
    '  "potential_reason": "<lý do ngắn cho điểm tiềm năng>",\n'
    '  "readiness": <số nguyên 1-5, mức độ sẵn sàng xuống tiền>,\n'
    '  "next_best_action": {"action": "<hành động kế tiếp tốt nhất>", "reason": "<vì sao>", "timing": "<thời điểm liên hệ gợi ý>"},\n'
    '  "recommended_actions": [\n'
    '    {"priority": "cao|trung bình|thường", "action": "<hành động cụ thể>", "reason": "<lý do ngắn>"}\n'
    "  ],\n"
    '  "draft_messages": [\n'
    '    {"channel": "zalo|sms|email", "draft": "<tin nhắn NHÁP tiếng Việt, lịch sự, đúng ngữ cảnh + nhu cầu>", "suggested_time": "<thời điểm gửi gợi ý>"}\n'
    "  ]\n"
    "}\n"
    "Soạn 1-2 kịch bản tin nháp ở các kênh PHÙ HỢP nhất với khách (vd Zalo cho thân "
    "mật, Email khi cần gửi bảng giá/tài liệu). Toàn bộ nội dung bằng tiếng Việt."
)


def _conversation_digest(lead_ctx: Dict[str, Any]) -> str:
    """Tóm tắt lịch sử hội thoại đa kênh (từ contact logs) cho prompt — gọn, có kênh."""
    logs = lead_ctx.get("contact_logs") or []
    if not logs:
        return "(chưa có lịch sử liên hệ)"
    lines: List[str] = []
    for x in logs[:10]:
        when = x.get("created_at") or "?"
        ch = x.get("channel") or "?"
        outcome = x.get("outcome") or ""
        note = (x.get("note") or "").strip()
        seg = f"- [{when}] {ch}"
        if outcome:
            seg += f" · {outcome}"
        if note:
            seg += f": {note}"
        lines.append(seg)
    return "\n".join(lines)


def _units_digest(matched_units: Optional[List[Dict[str, Any]]]) -> str:
    """Liệt kê căn phù hợp (đã khớp % ở Python) để Claude tham chiếu khi đề xuất."""
    if not matched_units:
        return "(chưa có căn khớp / inventory trống)"
    lines: List[str] = []
    for u in matched_units[:5]:
        reasons = ", ".join(u.get("reasons") or [])
        lines.append(
            f"- unit_id={u.get('id')} | {u.get('loai')} {u.get('phan_khu')} | "
            f"DT {u.get('dien_tich')}m2 | giá {u.get('gia')} | "
            f"{u.get('trang_thai')} | khớp {u.get('match_percent')}% "
            f"({reasons})"
        )
    return "\n".join(lines)


def _build_user_prompt(
    lead_ctx: Dict[str, Any],
    knowledge_text: str,
    channel: str,
    matched_units: Optional[List[Dict[str, Any]]],
) -> str:
    # Tách phần nhu cầu để Claude bám sát.
    needs = {
        "product_type": lead_ctx.get("product_type"),
        "region": lead_ctx.get("region"),
        "budget": lead_ctx.get("budget"),
        "purpose": lead_ctx.get("purpose"),
        "project": lead_ctx.get("project"),
        "customer_group": lead_ctx.get("customer_group"),
    }
    ctx_json = json.dumps(lead_ctx, ensure_ascii=False, default=str)
    needs_json = json.dumps(needs, ensure_ascii=False, default=str)
    kb = (knowledge_text or "").strip() or "(không có tri thức Dify khả dụng)"
    return (
        f"HỒ SƠ KHÁCH (CRM 360 nội bộ):\n{ctx_json}\n\n"
        f"NHU CẦU KHÁCH (ưu tiên bám sát):\n{needs_json}\n\n"
        f"LỊCH SỬ HỘI THOẠI ĐA KÊNH (mới→cũ):\n{_conversation_digest(lead_ctx)}\n\n"
        f"TRI THỨC DỰ ÁN THAM KHẢO (Dify):\n{kb}\n\n"
        f"DANH SÁCH CĂN PHÙ HỢP (đã khớp nhu cầu):\n{_units_digest(matched_units)}\n\n"
        f"Kênh ưu tiên nếu phù hợp: {channel}.\n"
        "Hãy phân tích và trả JSON đúng schema đã mô tả. Đề xuất căn theo unit_id "
        "trong danh sách phù hợp khi hợp lý."
    )


def _parse_json_block(text: Optional[str]) -> Optional[dict]:
    """Trích khối JSON đầu tiên trong text (kể cả khi bị bọc ```json). None nếu lỗi."""
    if not text:
        return None
    raw = text.strip()
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


def _coerce_drafts(obj: Any, default_channel: str) -> List[Dict[str, Any]]:
    """Chuẩn hoá draft_messages → list {channel, draft, suggested_time, requires_confirmation, auto_sent}."""
    out: List[Dict[str, Any]] = []
    items = obj if isinstance(obj, list) else ([obj] if obj else [])
    for it in items[:4]:
        if isinstance(it, dict):
            draft = str(it.get("draft") or it.get("message") or "").strip()
            if not draft:
                continue
            out.append({
                "channel": str(it.get("channel") or default_channel).strip() or default_channel,
                "draft": draft,
                "suggested_time": str(it.get("suggested_time") or "").strip(),
                "requires_confirmation": True,
                "auto_sent": False,
            })
        elif isinstance(it, str) and it.strip():
            out.append({
                "channel": default_channel,
                "draft": it.strip(),
                "suggested_time": "",
                "requires_confirmation": True,
                "auto_sent": False,
            })
    return out


def _coerce_nba(obj: Any) -> Optional[Dict[str, str]]:
    if isinstance(obj, dict):
        action = str(obj.get("action") or "").strip()
        if action:
            return {
                "action": action,
                "reason": str(obj.get("reason") or "").strip(),
                "timing": str(obj.get("timing") or "").strip(),
            }
    elif isinstance(obj, str) and obj.strip():
        return {"action": obj.strip(), "reason": "", "timing": ""}
    return None


def run_claude_analysis(
    lead_ctx: Dict[str, Any],
    knowledge_text: str,
    channel: str = "zalo",
    *,
    matched_units: Optional[List[Dict[str, Any]]] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Gọi Claude THẬT (sync) sinh phân tích chuyên gia + nháp. NÉM exception nếu lỗi.

    `matched_units`: căn đã khớp ở Python (đưa vào prompt + trả kèm kết quả).
    `model`: ghi đè model (vd haiku cho quét hàng loạt). None → crew_model_resolved().

    Trả schema thống nhất (siêu tập tương thích ngược) với engine='claude-direct'.
    """
    from anthropic import Anthropic  # lazy import — anthropic đã có trong requirements.txt

    use_model = (model or settings.crew_model_resolved()).strip()
    client = Anthropic(api_key=settings.anthropic_api_key)
    resp = client.messages.create(
        model=use_model,
        max_tokens=settings.crew_max_tokens,
        system=_SYSTEM,
        messages=[{
            "role": "user",
            "content": _build_user_prompt(lead_ctx, knowledge_text, channel, matched_units),
        }],
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

    # potential_score 0-100 (fallback suy từ readiness nếu thiếu).
    try:
        potential = int(data.get("potential_score"))
    except Exception:  # noqa: BLE001
        potential = readiness * 20
    potential = max(0, min(100, potential))

    actions = _coerce_actions(data.get("recommended_actions"))
    if not actions:
        actions = [{
            "priority": "thường",
            "action": "Liên hệ lại làm rõ nhu cầu (khu vực, ngân sách, loại căn).",
            "reason": "Chưa đủ tín hiệu để đề xuất bước cụ thể hơn.",
        }]

    drafts = _coerce_drafts(data.get("draft_messages") or data.get("draft_message"), channel)

    return {
        "engine": "claude-direct",
        "model": use_model,
        "summary": str(data.get("summary") or "").strip(),
        "potential_score": potential,
        "potential_reason": str(data.get("potential_reason") or "").strip(),
        "readiness": readiness,
        "next_best_action": _coerce_nba(data.get("next_best_action")),
        "recommended_actions": actions,
        "draft_messages": drafts,
        "matched_units": list(matched_units or []),
        "agents": [t["name"] for t in agent_templates()],
    }
