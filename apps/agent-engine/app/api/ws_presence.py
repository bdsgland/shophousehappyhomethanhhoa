"""WebSocket cho SALE — presence + nhận/đáp match realtime.

Endpoint: /ws/sale-presence?token=<JWT>

Client (sale console) gửi các message:
  {"type": "heartbeat"}
  {"type": "set_availability", "availability": "online|busy|away|dnd"}
  {"type": "accept_match", "match_id": "..."}
  {"type": "decline_match", "match_id": "..."}

Server push (xem match_service): match:incoming / match:meet_ready /
match:cancelled / match:expired / match:gone / match:completed / match:meet_error.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import get_user_from_token
from app.core import match_service, presence

router = APIRouter(tags=["live-match-ws"])


@router.websocket("/ws/sale-presence")
async def sale_presence_ws(websocket: WebSocket, token: str = "") -> None:
    user = get_user_from_token(token)
    if not user or user.get("role") not in ("sale", "admin"):
        # 4401: quy ước app-level "unauthorized" cho WebSocket.
        await websocket.close(code=4401)
        return

    sale_id = user["id"]
    await websocket.accept()
    presence.set_online(sale_id, user.get("full_name", "Sale"))
    presence.register_sale_ws(sale_id, websocket)

    # Gửi trạng thái khởi tạo + thống kê hôm nay.
    await websocket.send_json(
        {
            "type": "presence:state",
            "availability": "online",
            "stats": match_service.get_match_stats("today"),
        }
    )

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "heartbeat":
                presence.heartbeat(sale_id)
                await websocket.send_json({"type": "heartbeat:ack"})
            elif mtype == "set_availability":
                presence.set_availability(sale_id, msg.get("availability", "online"))
                await websocket.send_json(
                    {
                        "type": "presence:state",
                        "availability": msg.get("availability", "online"),
                    }
                )
            elif mtype == "accept_match":
                await match_service.accept_match(msg.get("match_id", ""), sale_id)
            elif mtype == "decline_match":
                await match_service.decline_match(msg.get("match_id", ""), sale_id)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — mọi lỗi đều dọn dẹp sạch
        pass
    finally:
        presence.set_offline(sale_id)
