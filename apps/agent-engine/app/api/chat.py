"""Endpoint /agent/chat — nơi web dashboard / chat widget gọi vào."""

from fastapi import APIRouter, HTTPException
from app.agents.sales_agent import run_sales_agent
from app.core import conversation_store
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages không được rỗng")
    result = await run_sales_agent(
        messages=req.messages,
        project_slug=req.project_slug,
    )
    # Ghi lịch sử hội thoại cho admin tra cứu (best-effort, không chặn luồng chat).
    try:
        conversation_store.log_turn(
            conversation_id=req.lead_id,
            user_message=req.messages[-1].content,
            assistant_reply=result.reply,
            intent_score=result.intent_score,
            is_hot=result.is_hot,
            project_slug=req.project_slug,
        )
    except Exception:  # noqa: BLE001 — log lỗi không được ảnh hưởng phản hồi
        pass
    return result
