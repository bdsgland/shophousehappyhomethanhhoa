"""Schema cho endpoint /agent/chat."""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = Field(description="Vai trò người gửi tin")
    content: str = Field(description="Nội dung tin nhắn")


class ChatRequest(BaseModel):
    lead_id: Optional[str] = Field(default=None, description="ID khách (nếu đã có)")
    project_slug: Optional[str] = Field(default=None, description="Mã dự án quan tâm")
    messages: List[ChatMessage] = Field(description="Lịch sử hội thoại")


class ChatResponse(BaseModel):
    reply: str = Field(description="Câu trả lời của agent")
    intent_score: int = Field(ge=0, le=100, description="Điểm intent ước tính 0-100")
    is_hot: bool = Field(description="Lead đã đạt ngưỡng nóng chưa")
    suggested_next_step: Optional[str] = Field(
        default=None, description="Gợi ý hành động tiếp theo cho hệ thống"
    )
