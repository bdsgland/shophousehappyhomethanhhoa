"""WebSocket cho ADMIN — theo dõi Live Match realtime (push thay vì polling).

Endpoint: /ws/admin-match?token=<JWT admin>

Khi admin kết nối, server gửi 1 snapshot khởi tạo (stats + presence + danh sách
match đang sống) để dựng UI ngay; sau đó giữ kết nối để nhận các event do
match_service đẩy qua presence.broadcast_to_admins:
  match:snapshot  — gửi 1 lần khi vừa kết nối
  match:update    — mỗi khi 1 match đổi trạng thái (kèm match + stats mới)

Client (admin console) có thể gửi {"type": "heartbeat"} để giữ kết nối.

Auth theo đúng convention các WS khác (ws_match/ws_presence): JWT lấy từ query
param `token`, verify bằng deps.get_user_from_token, chỉ chấp nhận role admin —
trùng quy ước 4401 = unauthorized cho WebSocket.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import get_user_from_token
from app.core import match_service, presence

router = APIRouter(tags=["live-match-ws"])

# Các trạng thái match còn "sống" (đưa vào snapshot live feed của admin).
_ACTIVE = {"pending", "invited", "accepted", "live"}


@router.websocket("/ws/admin-match")
async def admin_match_ws(websocket: WebSocket, token: str = "") -> None:
    user = get_user_from_token(token)
    if not user or user.get("role") != "admin":
        # 4401: quy ước app-level "unauthorized" cho WebSocket (giống ws_presence).
        await websocket.close(code=4401)
        return

    await websocket.accept()
    presence.register_admin_ws(websocket)

    # Snapshot khởi tạo — admin dựng UI ngay, không phải chờ event đầu tiên.
    await websocket.send_json(
        {
            "type": "match:snapshot",
            "stats": match_service.get_match_stats("today"),
            "presence": {
                "counts": presence.counts(),
                "sales": presence.list_all_presence(),
            },
            "live": [
                m
                for m in match_service.get_match_history(limit=50)
                if m.get("status") in _ACTIVE
            ],
        }
    )

    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "heartbeat":
                await websocket.send_json({"type": "heartbeat:ack"})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — mọi lỗi đều dọn dẹp sạch
        pass
    finally:
        presence.unregister_admin_ws(websocket)
