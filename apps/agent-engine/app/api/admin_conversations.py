"""Lịch sử hội thoại cho admin — chatbot web (in-memory) + proxy Chatwoot.

- GET /admin/conversations            → hội thoại chatbot web
- GET /admin/conversations/chatwoot   → proxy Chatwoot API (cần CHATWOOT_API_TOKEN)
- GET /admin/conversations/{id}        → chi tiết hội thoại web (full messages)

Proxy Chatwoot đặt ở server để giấu token + tránh giới hạn CORS của trình duyệt.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import require_admin
from app.core import conversation_store
from app.core.settings import settings

router = APIRouter(prefix="/admin/conversations", tags=["admin-conversations"])


@router.get("")
def list_web_conversations(
    limit: int = Query(default=100, le=500),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Danh sách hội thoại chatbot web (từ /agent/chat)."""
    items = conversation_store.list_conversations(limit=limit)
    return {"conversations": items, "count": len(items)}


@router.get("/chatwoot")
async def list_chatwoot_conversations(
    status: str = Query(default="open", description="open | resolved | all"),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Proxy danh sách hội thoại từ Chatwoot.

    Trả về `configured=False` (không lỗi) khi chưa đặt CHATWOOT_API_TOKEN — để
    frontend hiển thị hướng dẫn cấu hình thay vì báo lỗi đỏ.
    """
    if not settings.chatwoot_api_token:
        return {
            "configured": False,
            "conversations": [],
            "detail": "Chưa cấu hình CHATWOOT_API_TOKEN trên backend.",
        }
    base = settings.chatwoot_base_url.rstrip("/")
    account_id = settings.chatwoot_account_id
    url = f"{base}/api/v1/accounts/{account_id}/conversations"
    params = {} if status == "all" else {"status": status}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                url,
                headers={"api_access_token": settings.chatwoot_api_token},
                params=params,
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Không gọi được Chatwoot: {type(e).__name__}")
    if r.status_code >= 400:
        raise HTTPException(r.status_code, "Chatwoot trả lỗi — kiểm tra token/account.")

    data = r.json()
    payload = data.get("data", data)
    raw = payload.get("payload", []) if isinstance(payload, dict) else []
    convos = []
    for c in raw:
        meta = c.get("meta", {})
        sender = meta.get("sender", {}) if isinstance(meta, dict) else {}
        last = c.get("last_non_activity_message") or {}
        convos.append(
            {
                "id": c.get("id"),
                "contact": sender.get("name") or sender.get("email") or "Khách",
                "channel": c.get("channel", "Chatwoot"),
                "status": c.get("status"),
                "last_message": (last.get("content") or "")[:160],
                "assignee": (c.get("meta", {}).get("assignee") or {}).get("name"),
                "created_at": c.get("created_at"),
            }
        )
    return {"configured": True, "conversations": convos, "count": len(convos)}


@router.get("/{conversation_id}")
def get_web_conversation(
    conversation_id: str,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Chi tiết 1 hội thoại web (full messages)."""
    conv = conversation_store.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(404, "Không tìm thấy hội thoại")
    return conv
