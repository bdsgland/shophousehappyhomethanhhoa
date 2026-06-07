"""Schema payload webhook của Chatwoot Agent Bot.

Chatwoot POST vào `/webhook/chatwoot` mỗi khi có sự kiện trong conversation
được assign cho bot. Mình chỉ khai báo những field thực sự dùng và `extra="ignore"`
để không vỡ khi Chatwoot bổ sung field mới.

Tham chiếu: https://www.chatwoot.com/docs/product/others/agent-bots
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class ChatwootContactInbox(BaseModel):
    model_config = ConfigDict(extra="ignore")

    contact_id: Optional[int] = None
    inbox_id: Optional[int] = None


class ChatwootConversation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    channel: Optional[str] = None
    status: Optional[str] = None
    contact_inbox: Optional[ChatwootContactInbox] = None


class ChatwootSender(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: Optional[int] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None


class ChatwootAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: Optional[int] = None


class ChatwootWebhookPayload(BaseModel):
    """Payload sự kiện Chatwoot (message_created, ...)."""

    model_config = ConfigDict(extra="ignore")

    event: Optional[str] = None
    id: Optional[int] = None
    content: Optional[str] = None
    message_type: Optional[str] = None  # "incoming" | "outgoing"
    content_type: Optional[str] = None
    private: bool = False
    conversation: Optional[ChatwootConversation] = None
    sender: Optional[ChatwootSender] = None
    account: Optional[ChatwootAccount] = None
