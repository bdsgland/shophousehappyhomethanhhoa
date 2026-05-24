"""Endpoint /agent/chat — nơi web dashboard / chat widget gọi vào."""

from fastapi import APIRouter, HTTPException
from app.agents.sales_agent import run_sales_agent
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages không được rỗng")
    return await run_sales_agent(
        messages=req.messages,
        project_slug=req.project_slug,
    )
