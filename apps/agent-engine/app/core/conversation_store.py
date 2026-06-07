"""Lịch sử hội thoại chatbot web (MVP — in-memory ring buffer).

Mỗi lần web widget gọi /agent/chat, ta ghi lại 1 bản ghi hội thoại (gộp theo
lead_id nếu có, nếu không thì theo session ngẫu nhiên) để admin tra cứu ở tab
"Chatbot Web". Giai đoạn 2 thay bằng bảng PostgreSQL `conversations`.
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Optional
from uuid import uuid4

_LOCK = threading.Lock()
_MAX = 500

# conversation_id -> record
_CONVERSATIONS: dict[str, dict] = {}


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def log_turn(
    *,
    conversation_id: Optional[str],
    user_message: str,
    assistant_reply: str,
    intent_score: int = 0,
    is_hot: bool = False,
    project_slug: Optional[str] = None,
) -> dict:
    """Ghi 1 lượt hội thoại. Tạo mới nếu chưa có conversation_id."""
    with _LOCK:
        cid = conversation_id or str(uuid4())
        conv = _CONVERSATIONS.get(cid)
        if conv is None:
            conv = {
                "id": cid,
                "channel": "web",
                "project_slug": project_slug,
                "messages": [],
                "created_at": _now(),
                "status": "open",
            }
            _CONVERSATIONS[cid] = conv
            # Giới hạn bộ nhớ: xoá hội thoại cũ nhất khi vượt ngưỡng.
            if len(_CONVERSATIONS) > _MAX:
                oldest = min(_CONVERSATIONS.values(), key=lambda c: c["created_at"])
                _CONVERSATIONS.pop(oldest["id"], None)
        conv["messages"].append({"role": "user", "content": user_message, "at": _now()})
        conv["messages"].append(
            {"role": "assistant", "content": assistant_reply, "at": _now()}
        )
        conv["last_message"] = assistant_reply[:160]
        conv["updated_at"] = _now()
        conv["intent_score"] = intent_score
        conv["is_hot"] = is_hot
        return conv


def _summary(conv: dict) -> dict:
    return {
        "id": conv["id"],
        "channel": conv.get("channel", "web"),
        "status": conv.get("status", "open"),
        "last_message": conv.get("last_message", ""),
        "intent_score": conv.get("intent_score", 0),
        "is_hot": conv.get("is_hot", False),
        "message_count": len(conv.get("messages", [])),
        "created_at": conv.get("created_at"),
        "updated_at": conv.get("updated_at", conv.get("created_at")),
    }


def list_conversations(limit: int = 100) -> list[dict]:
    with _LOCK:
        items = list(_CONVERSATIONS.values())
    items.sort(key=lambda c: c.get("updated_at", c["created_at"]), reverse=True)
    return [_summary(c) for c in items[:limit]]


def get_conversation(conversation_id: str) -> Optional[dict]:
    with _LOCK:
        return _CONVERSATIONS.get(conversation_id)


def clear() -> None:
    """Dùng trong test."""
    with _LOCK:
        _CONVERSATIONS.clear()
