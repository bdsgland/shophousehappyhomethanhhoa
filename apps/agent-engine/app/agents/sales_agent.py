"""Sales Agent — orchestrator chính.

Phiên bản MVP+RAG:
- Mọi câu hỏi có project_slug đều đi qua retrieval BM25 offline để lấy ngữ
  cảnh từ tài liệu dự án (KHÔNG cần API key).
- Sinh câu trả lời:
    * USE_MOCK_LLM=true hoặc thiếu ANTHROPIC_API_KEY -> mock reply (vẫn lộ
      trích dẫn nguồn để demo retrieval đã đúng).
    * Ngược lại -> gọi Claude thật, nhét retrieved context vào system prompt.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from app.agents.retrieval import (
    RetrievedChunk,
    format_context_for_llm,
    get_index,
)
from app.core.settings import settings
from app.schemas.chat import ChatMessage, ChatResponse

log = logging.getLogger(__name__)


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


def _last_user_text(messages: List[ChatMessage]) -> str:
    return next((m.content for m in reversed(messages) if m.role == "user"), "")


def _retrieve(project_slug: str, query: str, top_k: int = 5) -> list[RetrievedChunk]:
    idx = get_index(project_slug)
    if idx is None:
        log.info("Chưa có knowledge base cho '%s' — bỏ qua retrieval", project_slug)
        return []
    return idx.search(query, top_k=top_k)


def _mock_reply(messages: List[ChatMessage], chunks: list[RetrievedChunk]) -> str:
    """Trả lời giả lập — nhưng vẫn lộ trích dẫn nguồn để chứng minh retrieval chạy."""
    last = _last_user_text(messages)
    head = (
        "Em chào anh/chị, em là chuyên viên tư vấn của dự án. "
        f'Em đã ghi nhận câu hỏi: "{last[:120]}". '
    )
    if not chunks:
        return head + (
            "Hiện em chưa tìm thấy thông tin phù hợp trong tài liệu dự án. "
            "Anh/chị có thể chia sẻ thêm để em hỗ trợ ạ?"
        )
    cites = "\n".join(
        f"  • [{i+1}] {c.source_file} (nhóm {c.group}): {c.short(180)}"
        for i, c in enumerate(chunks[:3])
    )
    return head + (
        "Em tìm thấy các đoạn tài liệu liên quan sau (chế độ MOCK — chưa có "
        "ANTHROPIC_API_KEY để soạn câu trả lời tự nhiên):\n"
        f"{cites}\n"
        "Anh/chị muốn em đi sâu vào phần nào trước ạ?"
    )


async def _real_reply(
    messages: List[ChatMessage],
    project_context: str,
) -> str:
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
    """Chấm điểm intent thô sơ ở MVP — đếm tín hiệu trong tin của khách."""
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
    """Điểm vào chính — retrieve + sinh trả lời + chấm điểm intent."""
    chunks: list[RetrievedChunk] = []
    project_context = ""

    if project_slug:
        query = _last_user_text(messages)
        if query:
            chunks = _retrieve(project_slug, query, top_k=5)
            project_context = format_context_for_llm(chunks)

    if settings.use_mock_llm or not settings.anthropic_api_key:
        reply = _mock_reply(messages, chunks)
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
