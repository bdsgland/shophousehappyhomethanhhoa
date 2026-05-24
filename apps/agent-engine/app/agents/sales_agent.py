"""Sales Agent — orchestrator chính.

Phiên bản MVP: dùng mock LLM (trả lời thô sơ) hoặc gọi Claude thật tuỳ
biến môi trường USE_MOCK_LLM. Ở giai đoạn 2 sẽ thay bằng RAG đầy đủ.
"""

from __future__ import annotations

from typing import List, Optional

from app.core.settings import settings
from app.schemas.chat import ChatMessage, ChatResponse


SYSTEM_PROMPT_VI = """\
Bạn là chuyên viên tư vấn bất động sản CAO CẤP, đại diện cho chủ đầu tư.
Giọng điệu: sang trọng, lịch sự, chuyên nghiệp, ngắn gọn, không spammy.
Mục tiêu:
1. Hiểu nhu cầu khách (ngân sách, vị trí, mục đích đầu tư/ở, thời điểm dự kiến).
2. Cung cấp thông tin chính xác về dự án dựa trên ngữ cảnh được cấp.
3. Khi khách thể hiện quan tâm rõ (muốn xem nhà mẫu, hỏi giá chi tiết, hỏi
   chính sách thanh toán), gợi ý gặp chuyên viên phụ trách trực tiếp.
4. KHÔNG bịa thông tin. Nếu chưa rõ, trả lời "Em sẽ xác nhận lại với chuyên viên".
5. Tuyệt đối không tư vấn dự án nhà ở xã hội/NOXH.
"""


def _mock_reply(messages: List[ChatMessage]) -> str:
    """Trả lời giả lập khi USE_MOCK_LLM=true (không tốn token)."""
    last_user_msg = next(
        (m.content for m in reversed(messages) if m.role == "user"), ""
    )
    return (
        "Em chào anh/chị, em là chuyên viên tư vấn của dự án. "
        f'Em đã ghi nhận câu hỏi: "{last_user_msg[:120]}". '
        "Anh/chị có thể cho em biết thêm về ngân sách dự kiến và "
        "thời điểm muốn vào ở để em tư vấn phù hợp nhất ạ?"
    )


async def _real_reply(messages: List[ChatMessage], project_context: str) -> str:
    """Gọi Claude thật. Yêu cầu ANTHROPIC_API_KEY."""
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    system = SYSTEM_PROMPT_VI
    if project_context:
        system += f"\n\nNGỮ CẢNH DỰ ÁN:\n{project_context}"

    response = await client.messages.create(
        model=settings.llm_model,
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in messages],
    )
    return response.content[0].text


def _score_intent(messages: List[ChatMessage]) -> int:
    """Chấm điểm intent thô sơ ở MVP — đếm tín hiệu trong tin của khách.

    Sẽ thay bằng LLM-based scoring ở giai đoạn 2.
    """
    user_text = " ".join(m.content.lower() for m in messages if m.role == "user")
    signals = {
        "giá": 8,
        "bảng giá": 12,
        "thanh toán": 10,
        "vay": 8,
        "ngân hàng": 6,
        "nhà mẫu": 18,
        "xem nhà": 18,
        "đặt cọc": 25,
        "ký": 15,
        "hợp đồng": 15,
        "khi nào bàn giao": 10,
        "pháp lý": 8,
        "sổ hồng": 10,
    }
    score = sum(weight for kw, weight in signals.items() if kw in user_text)
    return min(score, 100)


async def run_sales_agent(
    messages: List[ChatMessage],
    project_slug: Optional[str] = None,
) -> ChatResponse:
    """Điểm vào chính — sinh trả lời + chấm điểm intent."""
    project_context = ""
    if project_slug:
        # Placeholder: giai đoạn 2 sẽ load từ DB + RAG.
        project_context = (
            f"Dự án mã: {project_slug}. "
            "Thông tin chi tiết sẽ được nạp từ knowledge base ở giai đoạn 2."
        )

    if settings.use_mock_llm or not settings.anthropic_api_key:
        reply = _mock_reply(messages)
    else:
        reply = await _real_reply(messages, project_context)

    score = _score_intent(messages)
    is_hot = score >= settings.lead_hot_score_threshold
    next_step = "handoff_to_saleman" if is_hot else "continue_nurturing"

    return ChatResponse(
        reply=reply,
        intent_score=score,
        is_hot=is_hot,
        suggested_next_step=next_step,
    )
