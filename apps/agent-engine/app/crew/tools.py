"""Tool bọc tích hợp sẵn có cho Sales Crew.

Mỗi tool là 1 HÀM THUẦN (plain callable) trả về dữ liệu/text — KHÔNG phụ thuộc
crewai. Nhờ vậy:
  - Chế độ "fallback" (không có crewai): gọi trực tiếp các hàm này để dựng phân
    tích heuristic.
  - Chế độ "live" (CrewAI): bọc các hàm này thành crewai tool qua build_crew_tools()
    (lazy import crewai).

TẤT CẢ tool ở đây là READ-ONLY hoặc TẠO NHÁP. Không hàm nào gửi tin / ghi CRM.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("crew.tools")


# ---------------------------------------------------------------------------
# 1) Tri thức Dify (RAG) — bọc dify_client, fallback an toàn khi chưa cấu hình.
# ---------------------------------------------------------------------------
def dify_knowledge_query(query: str, top_k: int = 5) -> Dict[str, Any]:
    """Truy hồi tri thức dự án từ Dify Knowledge Base.

    Trả {"configured": bool, "text": str, "records": int}. KHÔNG raise: thiếu cấu
    hình / lỗi mạng → configured/records phản ánh, text rỗng → caller tự xử lý."""
    from app.core import dify_client  # lazy import

    if not dify_client.is_dataset_configured():
        return {
            "configured": False,
            "text": "",
            "records": 0,
            "note": "Dify Knowledge Base chưa cấu hình (thiếu DIFY_API_URL/DIFY_DATASET_API_KEY).",
        }
    try:
        records = dify_client.retrieve(query, top_k=top_k)
        text = dify_client.format_records_for_llm(records)
        return {"configured": True, "text": text, "records": len(records)}
    except dify_client.DifyNotConfigured as exc:
        return {"configured": False, "text": "", "records": 0, "note": str(exc)}
    except Exception as exc:  # noqa: BLE001 — lỗi Dify không được làm hỏng crew
        log.warning("dify_knowledge_query lỗi: %s", exc)
        return {"configured": True, "text": "", "records": 0, "note": f"Lỗi Dify: {exc}"}


# ---------------------------------------------------------------------------
# 2) Thông tin lead / CRM — bọc lead_store (READ-ONLY).
# ---------------------------------------------------------------------------
def get_lead_context(lead_id: str, max_logs: int = 10) -> Optional[Dict[str, Any]]:
    """Gom toàn bộ ngữ cảnh 1 lead cho crew phân tích. None nếu không tồn tại.

    Gồm: hồ sơ lead (public_view) + N contact log gần nhất (rút gọn)."""
    from app.core import lead_store  # lazy import

    lead = lead_store.get_lead(lead_id)
    if not lead:
        return None
    logs = lead_store.list_contact_logs(lead_id)[:max_logs]
    slim_logs = [
        {
            "created_at": x.get("created_at"),
            "channel": x.get("channel"),
            "outcome": x.get("outcome"),
            "note": (x.get("note") or "")[:280],
        }
        for x in logs
    ]
    return {
        "id": lead.get("id"),
        "name": lead.get("name"),
        "phone": lead.get("phone"),
        "email": lead.get("email"),
        "status": lead.get("status"),
        "source": lead.get("source"),
        "note": lead.get("note"),
        # NHU CẦU khách (Customer 360) — cho bộ não AI khớp sản phẩm + cá nhân hoá.
        "product_type": lead.get("product_type"),
        "region": lead.get("region"),
        "budget": lead.get("budget"),
        "purpose": lead.get("purpose"),
        "project": lead.get("project"),
        "customer_group": lead.get("customer_group"),
        "ai_score": lead.get("ai_score"),
        "ai_tier": lead.get("ai_tier"),
        "ai_reason": lead.get("ai_reason"),
        "ai_best_time": lead.get("ai_best_time"),
        "ai_next_action": lead.get("ai_next_action"),
        "pipeline_stage": lead.get("pipeline_stage"),
        "days_since_contact": lead.get("days_since_contact"),
        "booking_count": lead.get("booking_count", 0),
        "registered": bool(lead.get("registered")),
        "last_contact_at": lead.get("last_contact_at"),
        "ai_salesman_id": lead.get("ai_salesman_id"),
        "contact_logs": slim_logs,
    }


# ---------------------------------------------------------------------------
# 3) Soạn tin chăm sóc — TẠO NHÁP, KHÔNG GỬI.
# ---------------------------------------------------------------------------
def draft_nurture_message(
    lead: Dict[str, Any],
    *,
    channel: str = "zalo",
    knowledge_snippet: str = "",
) -> Dict[str, Any]:
    """Sinh 1 tin nhắn chăm sóc NHÁP (heuristic, không gọi LLM) dựa trên trạng thái
    lead. Dùng cho chế độ fallback HOẶC làm gợi ý nền cho crew live.

    Trả {"channel", "draft", "requires_confirmation": True, "auto_sent": False}."""
    name = (lead.get("name") or "anh/chị").strip()
    status = (lead.get("status") or "").lower()
    days = lead.get("days_since_contact")
    score = lead.get("ai_score") or 0

    opener = f"Dạ em chào {name},"
    if status in ("hot",) or score >= 80:
        body = (
            " bên em đang giữ một số căn vị trí đẹp với chính sách ưu đãi tốt trong "
            "tuần này. Không biết {anc} sắp xếp được thời gian xem nhà trực tiếp hoặc "
            "qua video call lúc nào để em hỗ trợ chi tiết ạ?"
        ).format(anc=name)
    elif days is not None and days >= 7:
        body = (
            " lâu rồi em chưa cập nhật thông tin dự án tới mình. Hiện có vài thay đổi "
            "về chính sách thanh toán và quỹ căn, em gửi {anc} tham khảo nhé. Mình "
            "còn quan tâm khu vực/loại căn nào để em lọc đúng nhu cầu ạ?"
        ).format(anc=name)
    else:
        body = (
            " em xin phép gửi thêm thông tin về dự án để mình tiện tham khảo. Nếu "
            "{anc} có câu hỏi về giá, pháp lý hay tiến độ, cứ nhắn em hỗ trợ ngay ạ."
        ).format(anc=name)

    closing = "\n\nEm cảm ơn {anc} ạ!".format(anc=name)
    snippet = ""
    if knowledge_snippet.strip():
        snippet = (
            "\n\n(Thông tin tham khảo nội bộ — biên tập trước khi gửi:\n"
            + knowledge_snippet.strip()[:500]
            + ")"
        )
    draft = opener + body + closing + snippet
    return {
        "channel": channel,
        "draft": draft,
        "requires_confirmation": True,
        "auto_sent": False,
    }


# ---------------------------------------------------------------------------
# build_crew_tools() — bọc các hàm trên thành crewai tool (CHỈ gọi ở chế độ live).
# ---------------------------------------------------------------------------
def build_crew_tools(lead_id: str) -> List[Any]:
    """Tạo danh sách crewai BaseTool gắn với 1 lead cụ thể. LAZY import crewai —
    chỉ gọi khi đã xác nhận crewai khả dụng (mode='live').

    Trả [] nếu crewai không import được (an toàn — crew live sẽ chạy không tool)."""
    try:
        from crewai.tools import tool as crew_tool  # type: ignore
    except Exception as exc:  # noqa: BLE001
        log.warning("Không tạo được crewai tools (crewai thiếu/đổi API): %s", exc)
        return []

    @crew_tool("dify_knowledge_query")
    def _t_knowledge(query: str) -> str:
        """Truy hồi tri thức dự án BĐS từ Knowledge Base nội bộ (Dify). Nhập câu hỏi
        ngắn gọn về dự án/chính sách/giá. Trả về đoạn trích tài liệu."""
        res = dify_knowledge_query(query, top_k=5)
        return res.get("text") or res.get("note") or "(không có tri thức phù hợp)"

    @crew_tool("get_lead_profile")
    def _t_lead(_: str = "") -> str:
        """Đọc hồ sơ + lịch sử liên hệ của lead đang xét (CRM nội bộ). Không cần tham số."""
        ctx = get_lead_context(lead_id)
        import json

        return json.dumps(ctx, ensure_ascii=False, default=str) if ctx else "(không tìm thấy lead)"

    return [_t_knowledge, _t_lead]
