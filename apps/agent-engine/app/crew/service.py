"""Orchestration Sales Crew — điểm vào chung cho endpoint /admin/crew/* + MCP.

run_for_lead() là hàm SYNC (chặn) để dùng được cả từ FastAPI (chạy threadpool) lẫn
MCP handler. Quyết định chạy CrewAI thật hay fallback heuristic, gom kết quả về 1
schema thống nhất, GHI AUDIT. KHÔNG bao giờ tự gửi tin / ghi CRM — chỉ trả nháp +
cần xác nhận.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.settings import settings
from app.crew import availability
from app.crew import tools as crew_tools
from app.crew.sales_crew import agent_templates

log = logging.getLogger("crew.service")


def list_agent_templates() -> List[Dict[str, str]]:
    """Phơi danh sách template agent (cho endpoint /admin/crew/agents)."""
    return agent_templates()


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _audit(event: str, payload: Dict[str, Any], *, status: str = "ok", detail: str = "") -> None:
    """Ghi audit best-effort (không làm hỏng luồng nếu audit lỗi)."""
    try:
        from app.core import audit_store

        audit_store.record(f"crew.{event}", payload, status=status, detail=detail)
    except Exception as exc:  # noqa: BLE001
        log.warning("audit crew.%s lỗi: %s", event, exc)


# ---------------------------------------------------------------------------
# Fallback heuristic — không gọi LLM. Đảm bảo crew LUÔN trả kết quả hữu ích.
# ---------------------------------------------------------------------------
def _fallback_analysis(
    lead_ctx: Dict[str, Any],
    knowledge: Dict[str, Any],
    channel: str,
    matched_units: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    score = lead_ctx.get("ai_score") or 0
    status = (lead_ctx.get("status") or "").lower()
    days = lead_ctx.get("days_since_contact")
    bookings = lead_ctx.get("booking_count", 0) or 0

    # Mức độ sẵn sàng 1-5 (heuristic đơn giản, minh bạch).
    readiness = 1
    if score >= 80 or status == "hot":
        readiness = 5
    elif score >= 50 or bookings >= 1:
        readiness = 4
    elif score >= 30:
        readiness = 3
    elif score >= 10:
        readiness = 2

    actions: List[Dict[str, Any]] = []
    if readiness >= 4:
        actions.append({
            "priority": "cao",
            "action": "Đặt lịch xem nhà / video call trong 48h",
            "reason": "Mức độ quan tâm cao — cần chốt thời điểm gặp để đẩy nhanh.",
        })
        actions.append({
            "priority": "cao",
            "action": "Gửi bảng tính giá + chính sách ưu đãi hiện hành (NHÁP, chờ duyệt)",
            "reason": "Khách sẵn sàng cân nhắc tài chính cụ thể.",
        })
    elif days is not None and days >= 7:
        actions.append({
            "priority": "trung bình",
            "action": "Tái kết nối bằng tin chăm sóc cập nhật dự án",
            "reason": f"Đã {days} ngày chưa liên hệ — nguy cơ nguội lead.",
        })
    else:
        actions.append({
            "priority": "thường",
            "action": "Gửi thêm thông tin dự án phù hợp nhu cầu, hỏi tiêu chí khu vực/loại căn",
            "reason": "Lead còn ở giai đoạn đầu — cần làm rõ nhu cầu.",
        })

    draft = crew_tools.draft_nurture_message(
        lead_ctx, channel=channel, knowledge_snippet=knowledge.get("text", "")
    )

    if days is None:
        contact_phrase = "chưa có mốc liên hệ"
    elif days < 3:
        contact_phrase = "liên hệ gần đây"
    else:
        contact_phrase = f"{days} ngày chưa liên hệ"
    booking_phrase = "Có" if bookings else "Chưa có"
    summary = (
        f"Lead '{lead_ctx.get('name')}' — trạng thái {status or 'n/a'}, "
        f"ai_score={score}, mức độ sẵn sàng {readiness}/5. "
        f"{booking_phrase} booking; {contact_phrase}."
    )

    # next-best-action heuristic = hành động ưu tiên cao nhất.
    top = actions[0] if actions else {}
    nba = {
        "action": top.get("action", ""),
        "reason": top.get("reason", ""),
        "timing": "trong 24-48h" if readiness >= 4 else "trong tuần này",
    } if top.get("action") else None

    return {
        "engine": "heuristic",
        "model": None,
        "summary": summary,
        "potential_score": min(100, int(readiness) * 20),
        "potential_reason": "Ước lượng từ ai_score + trạng thái + tương tác.",
        "readiness": readiness,
        "next_best_action": nba,
        "recommended_actions": actions,
        "draft_messages": [draft],
        "matched_units": list(matched_units or []),
        "agents": [t["name"] for t in agent_templates()],
    }


# ---------------------------------------------------------------------------
# Fallback CHẤT LƯỢNG bằng Claude THẬT (engine=claude-direct) — KHÔNG cần crewai.
# Lỗi bất kỳ → tụt tiếp về heuristic để request không hỏng.
# ---------------------------------------------------------------------------
def _run_claude_or_heuristic(
    base: Dict[str, Any],
    lead_ctx: Dict[str, Any],
    knowledge: Dict[str, Any],
    channel: str,
    matched_units: Optional[List[Dict[str, Any]]] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        from app.crew.claude_fallback import run_claude_analysis

        analysis = run_claude_analysis(
            lead_ctx,
            knowledge.get("text", ""),
            channel=channel,
            matched_units=matched_units,
            model=model,
        )
        # Bảo đảm luôn có ít nhất 1 draft (kèm nền heuristic nếu Claude trả rỗng).
        if not analysis.get("draft_messages"):
            analysis["draft_messages"] = [
                crew_tools.draft_nurture_message(
                    lead_ctx, channel=channel, knowledge_snippet=knowledge.get("text", "")
                )
            ]
        return analysis
    except Exception as exc:  # noqa: BLE001 — Claude lỗi → heuristic
        log.warning("Claude-direct lỗi, fallback heuristic: %s", exc)
        base["notes"].append(f"Claude-direct lỗi → dùng heuristic: {exc}")
        base["mode"] = "fallback"
        return _fallback_analysis(lead_ctx, knowledge, channel, matched_units)


# ---------------------------------------------------------------------------
# Điểm vào chính.
# ---------------------------------------------------------------------------
def match_units_for_lead(lead_ctx: Dict[str, Any], limit: int = 3) -> List[Dict[str, Any]]:
    """Khớp căn phù hợp nhu cầu khách (READ-ONLY, an toàn). [] nếu lỗi/thiếu."""
    try:
        from app.core import inventory_match

        return inventory_match.match_for_lead(lead_ctx, limit=limit)
    except Exception as exc:  # noqa: BLE001 — gợi ý BĐS không được làm hỏng crew
        log.warning("match_units_for_lead lỗi: %s", exc)
        return []


def run_for_lead(
    lead_id: str,
    *,
    channel: str = "zalo",
    requested_by: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Chạy Sales Crew cho 1 lead → trả phân tích + đề xuất + tin nhắn NHÁP.

    `model` (tuỳ chọn): ghi đè model Claude (vd haiku khi quét hàng loạt qua
    Auto-Care). None → crew_model_resolved().

    Schema trả về (ổn định cho endpoint + MCP):
      {
        ok, mode, lead_id, lead_name, generated_at,
        analysis: {...},               # engine=crewai|claude-direct|heuristic
        matched_units: [...],          # BĐS phù hợp nhu cầu khách
        knowledge: {configured, records},
        requires_confirmation: True,   # mọi hành động ghi/gửi cần admin duyệt
        auto_executed: False,          # crew KHÔNG tự thực thi gì
        notes: [...]
      }
    """
    status = availability.crew_runtime_status()
    mode = status["mode"]

    base = {
        "ok": False,
        "mode": mode,
        "lead_id": lead_id,
        "lead_name": None,
        "generated_at": _now_iso(),
        "requires_confirmation": True,
        "auto_executed": False,
        "notes": list(status.get("notes", [])),
    }

    if mode == "disabled":
        base["notes"].append("Sales Crew đang TẮT. Bật bằng CREW_ENABLED=true.")
        _audit("run_skipped", {"lead_id": lead_id, "reason": "disabled"}, detail="crew disabled")
        return base

    lead_ctx = crew_tools.get_lead_context(lead_id)
    if not lead_ctx:
        base["notes"].append(f"Không tìm thấy lead id={lead_id}.")
        _audit("run_not_found", {"lead_id": lead_id}, status="error", detail="lead not found")
        return base

    base["lead_name"] = lead_ctx.get("name")

    # Truy hồi tri thức (best-effort) — query dựng từ note + status của lead.
    kb_query = (
        f"Thông tin dự án phù hợp khách quan tâm: "
        f"{lead_ctx.get('note') or ''} (trạng thái {lead_ctx.get('status')})"
    ).strip()
    knowledge = crew_tools.dify_knowledge_query(kb_query, top_k=5)

    # Khớp căn phù hợp nhu cầu khách (đưa vào bộ não AI + trả ra cho UI/360).
    matched_units = match_units_for_lead(lead_ctx, limit=3)

    # Chạy LIVE nếu đủ điều kiện; lỗi → tụt dần xuống Claude-direct rồi heuristic
    # (không bao giờ làm hỏng request).
    analysis: Dict[str, Any]
    if mode == "live":
        try:
            from app.crew.sales_crew import run_crew_live

            analysis = run_crew_live(lead_ctx, knowledge.get("text", ""))
            # Live không tự soạn draft theo schema → kèm 1 draft heuristic làm nền.
            analysis.setdefault(
                "draft_messages",
                [crew_tools.draft_nurture_message(
                    lead_ctx, channel=channel, knowledge_snippet=knowledge.get("text", "")
                )],
            )
            analysis.setdefault("matched_units", matched_units)
        except Exception as exc:  # noqa: BLE001 — CrewAI lỗi → thử Claude-direct
            log.warning("CrewAI live lỗi, thử Claude-direct: %s", exc)
            base["notes"].append(f"CrewAI lỗi runtime → chuyển Claude-direct: {exc}")
            base["mode"] = "claude"
            analysis = _run_claude_or_heuristic(
                base, lead_ctx, knowledge, channel, matched_units, model
            )
    elif mode == "claude":
        analysis = _run_claude_or_heuristic(
            base, lead_ctx, knowledge, channel, matched_units, model
        )
    else:
        analysis = _fallback_analysis(lead_ctx, knowledge, channel, matched_units)

    base["ok"] = True
    base["analysis"] = analysis
    base["matched_units"] = analysis.get("matched_units", matched_units)
    base["knowledge"] = {
        "configured": knowledge.get("configured"),
        "records": knowledge.get("records"),
    }

    _audit(
        "run",
        {
            "lead_id": lead_id,
            "lead_name": lead_ctx.get("name"),
            "mode": base["mode"],
            "engine": analysis.get("engine"),
            "requested_by": requested_by,
        },
        detail=f"crew run lead={lead_id} mode={base['mode']} engine={analysis.get('engine')}",
    )
    return base
