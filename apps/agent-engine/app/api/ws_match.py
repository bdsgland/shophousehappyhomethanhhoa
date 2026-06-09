"""WebSocket cho KHÁCH — tự động xin match khi vào portal + nhận cập nhật.

Endpoint: /ws/customer-match?token=<JWT>

Khi khách kết nối, server tự gọi match_service.request_match → đẩy các event:
  match:assigning / match:assigned / match:meet_ready / match:no_sale_available /
  match:completed.

Client (khách) có thể gửi:
  {"type": "cancel"}     — huỷ tìm sale
  {"type": "heartbeat"}  — giữ kết nối
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import get_user_from_token
from app.core import match_service, match_store, presence

router = APIRouter(tags=["live-match-ws"])


@router.websocket("/ws/customer-match")
async def customer_match_ws(websocket: WebSocket, token: str = "") -> None:
    user = get_user_from_token(token)
    if not user or user.get("role") != "client":
        await websocket.close(code=4401)
        return

    customer_id = user["id"]
    await websocket.accept()
    presence.register_customer_ws(customer_id, websocket)

    # Tự động kích hoạt tìm sale ngay khi khách vào portal.
    await match_service.request_match(
        customer_id,
        user.get("full_name", "Khách hàng"),
        user.get("email", ""),
    )

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "heartbeat":
                await websocket.send_json({"type": "heartbeat:ack"})
            elif mtype == "cancel":
                active = match_store.find_active_for_customer(customer_id)
                if active:
                    await match_service.cancel_match(active["id"], by_customer=True)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        presence.unregister_customer_ws(customer_id)
