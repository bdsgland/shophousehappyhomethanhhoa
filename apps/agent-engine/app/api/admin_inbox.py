"""Omnichannel Inbox — hộp thư đa kênh cho admin.

Gộp hội thoại từ nhiều nguồn vào một màn hình:
  • Chatwoot (mọi kênh Chatwoot quản lý: web/Facebook/Zalo/email/...)
  • Chat web nội bộ (conversation_store — chatbot widget /agent/chat)

Mỗi hội thoại có ID gắn tiền tố để biết nguồn khi thao tác:
  • "cw:<id>"   → Chatwoot
  • "web:<id>"  → chat web nội bộ

Endpoint:
  GET  /admin/inbox/conversations              — danh sách gộp đa kênh
  GET  /admin/inbox/conversations/{id}/messages — tin nhắn của 1 hội thoại
  POST /admin/inbox/conversations/{id}/reply    — trả lời (Chatwoot API)

An toàn: chưa cấu hình token / Chatwoot down → trả thông báo "chưa cấu hình",
KHÔNG 500; vẫn hiện hội thoại web nội bộ bình thường.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import require_admin
from app.core import chatwoot_client, conversation_store
from app.core.chatwoot_client import PREFIX_CHATWOOT, PREFIX_WEB

router = APIRouter(prefix="/admin/inbox", tags=["admin-inbox"])


class ReplyPayload(BaseModel):
    content: str = Field(..., min_length=1, description="Nội dung trả lời")


def _split_id(conversation_id: str) -> tuple[str, str]:
    """Tách 'cw:123' → ('cw', '123'). Mặc định coi là web nếu không có tiền tố."""
    if ":" in conversation_id:
        prefix, _, raw = conversation_id.partition(":")
        return prefix, raw
    return PREFIX_WEB, conversation_id


def _web_summary(conv: dict) -> dict:
    """Chuẩn hoá 1 hội thoại web nội bộ về hình dạng thống nhất của inbox."""
    return {
        "id": f"{PREFIX_WEB}:{conv.get('id')}",
        "raw_id": conv.get("id"),
        "source": "web",
        "channel": "web",
        "contact": {"name": "Khách web", "phone": None, "email": None},
        "last_message": conv.get("last_message", ""),
        "last_at": conv.get("updated_at") or conv.get("created_at"),
        "status": conv.get("status", "open"),
        "assignee": None,
        "crm_lead_id": None,
        "crm_lead_name": None,
        "is_hot": conv.get("is_hot", False),
        "intent_score": conv.get("intent_score", 0),
    }


@router.get("/conversations")
async def list_inbox_conversations(
    channel: str = Query(default="all", description="all|web|facebook|zalo|email|..."),
    status: str = Query(default="open", description="open|resolved|all"),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Danh sách hội thoại gộp đa kênh (Chatwoot + web nội bộ).

    `chatwoot.configured=False` khi chưa cấu hình token — FE hiện hướng dẫn, vẫn
    có hội thoại web nội bộ. Không bao giờ 500 vì Chatwoot.
    """
    cfg = chatwoot_client.config_status()
    conversations: list[dict] = []

    # 1) Chatwoot (nếu đã cấu hình). Lỗi/None → bỏ qua, không sập.
    chatwoot_error = False
    if cfg["configured"]:
        cw = await chatwoot_client.list_conversations(status=status)
        if cw is None:
            chatwoot_error = True
        else:
            conversations.extend(cw)

    # 2) Chat web nội bộ (luôn có, in-memory).
    for conv in conversation_store.list_conversations(limit=200):
        if status in ("open", "resolved") and conv.get("status", "open") != status:
            continue
        conversations.append(_web_summary(conv))

    # 3) Lọc theo kênh.
    if channel and channel != "all":
        conversations = [c for c in conversations if c.get("channel") == channel]

    # 4) Sắp theo thời gian gần nhất (None xuống cuối).
    def _key(c: dict):
        return c.get("last_at") or ""

    conversations.sort(key=_key, reverse=True)

    return {
        "conversations": conversations,
        "count": len(conversations),
        "chatwoot": {
            "configured": cfg["configured"],
            "error": chatwoot_error,
            "detail": (
                "Không gọi được Chatwoot — kiểm tra kết nối/token."
                if chatwoot_error
                else cfg["detail"]
            ),
        },
    }


@router.get("/diagnostics")
async def inbox_diagnostics(_admin: dict = Depends(require_admin)) -> dict:
    """Tự kiểm tra kết nối Chatwoot cho admin.

    Trả: configured, base_url, account_id, token đã che, và KẾT QUẢ GỌI THỬ
    Chatwoot (status code / số hội thoại / lỗi / gợi ý khắc phục). Dùng để biết
    chính xác vì sao hộp thư/360 không kéo được hội thoại mà không cần đọc log.
    """
    return await chatwoot_client.diagnostics()


@router.get("/conversations/{conversation_id}/messages")
async def get_inbox_messages(
    conversation_id: str,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Tin nhắn của 1 hội thoại (dispatch theo tiền tố nguồn)."""
    prefix, raw = _split_id(conversation_id)

    if prefix == PREFIX_CHATWOOT:
        if not chatwoot_client.is_configured():
            return {
                "id": conversation_id,
                "source": "chatwoot",
                "configured": False,
                "messages": [],
                "detail": "Chưa cấu hình CHATWOOT_API_TOKEN trên backend.",
            }
        try:
            cw_id = int(raw)
        except ValueError:
            raise HTTPException(400, "ID hội thoại Chatwoot không hợp lệ.")
        msgs = await chatwoot_client.list_messages(cw_id)
        if msgs is None:
            raise HTTPException(502, "Không tải được tin nhắn từ Chatwoot.")
        return {
            "id": conversation_id,
            "source": "chatwoot",
            "configured": True,
            "messages": msgs,
        }

    # Web nội bộ.
    conv = conversation_store.get_conversation(raw)
    if not conv:
        raise HTTPException(404, "Không tìm thấy hội thoại")
    return {
        "id": conversation_id,
        "source": "web",
        "configured": True,
        "messages": conv.get("messages", []),
        "status": conv.get("status", "open"),
    }


@router.post("/conversations/{conversation_id}/reply")
async def reply_inbox_conversation(
    conversation_id: str,
    payload: ReplyPayload,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Gửi trả lời. Chatwoot → gửi qua API đúng kênh. Web nội bộ → không hỗ trợ."""
    prefix, raw = _split_id(conversation_id)

    if prefix == PREFIX_CHATWOOT:
        if not chatwoot_client.is_configured():
            raise HTTPException(
                400,
                "Chưa cấu hình CHATWOOT_API_TOKEN — không thể gửi trả lời qua Chatwoot.",
            )
        try:
            cw_id = int(raw)
        except ValueError:
            raise HTTPException(400, "ID hội thoại Chatwoot không hợp lệ.")
        result = await chatwoot_client.send_message(cw_id, payload.content.strip())
        if result is None:
            raise HTTPException(502, "Gửi trả lời qua Chatwoot thất bại.")
        return {"ok": True, "source": "chatwoot", "message": result}

    # Web nội bộ là hội thoại bot — không có kênh outbound để trả lời trực tiếp.
    raise HTTPException(
        400,
        "Hội thoại chat web nội bộ do bot xử lý — chưa hỗ trợ trả lời thủ công. "
        "Để trả lời người thật, hãy đấu kênh qua Chatwoot.",
    )
