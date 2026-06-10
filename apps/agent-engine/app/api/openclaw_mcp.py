"""OpenClaw MCP Bridge — bọc /openclaw/* thành 1 MCP server (transport streamable-http).

LÝ DO TỒN TẠI
  Bot OpenClaw (trợ lý AI CEO) CHỈ tiêu thụ MCP server — không gọi REST thường,
  không OpenAPI. ELC đã có sẵn REST God-Mode ở app/api/openclaw_bridge.py. Module
  này KHÔNG viết lại logic: nó EXPOSE mỗi thao tác /openclaw thành 1 MCP "tool" và
  gọi LẠI hàm xử lý nội bộ sẵn có (tái dùng, KHÔNG vòng qua HTTP).

TẠI SAO TỰ IMPLEMENT (không dùng SDK `mcp`/FastMCP)
  - Môi trường chạy production là Python 3.9 (.venv/pyvenv.cfg: 3.9.6). MCP Python
    SDK yêu cầu Python >= 3.10 → KHÔNG cài/khởi tạo được trong môi trường hiện tại.
  - Vì vậy ta IMPLEMENT TỐI THIỂU giao thức MCP streamable-http theo spec
    (2025-03-26 / 2025-06-18): initialize · tools/list · tools/call · ping —
    bằng Starlette ASGI thuần (đã có sẵn qua FastAPI). KHÔNG thêm dependency.

GIAO THỨC (streamable-http, JSON-RPC 2.0)
  - 1 endpoint duy nhất, mount tại /mcp.
  - POST: nhận message JSON-RPC (đơn hoặc batch). Server trả application/json.
  - GET: kênh SSE server->client (tuỳ chọn) — bản tối thiểu trả 405 (spec cho phép).
  - Client gửi Accept: application/json, text/event-stream.

AUTH (thống nhất require_god của bridge)
  - Header ưu tiên: X-Openclaw-Token: <GOD_TOKEN>
  - Fallback:        Authorization: Bearer <GOD_TOKEN>
  - So khớp settings.openclaw_god_token (fallback env OPENCLAW_GOD_TOKEN).
  - Thiếu/sai/chưa cấu hình → HTTP 401 (fail-closed). So sánh hằng-thời-gian.

URL CUỐI CÙNG (production):  https://api.eurowindowlightcity.net/mcp
"""
from __future__ import annotations

import json
import logging
import secrets
from typing import Any, Callable, Dict, List, Optional

import anyio
from fastapi import HTTPException

from app.api import openclaw_bridge as bridge
from app.core.settings import settings
from app.schemas.openclaw import OpenClawAnnounce, OpenClawTelegramSend

log = logging.getLogger("openclaw.mcp")

# Phiên bản giao thức mặc định nếu client không khai báo trong initialize.
_DEFAULT_PROTOCOL = "2025-06-18"
_SERVER_INFO = {"name": "elc-openclaw-mcp", "version": "1.0.0"}
_ACTOR = "openclaw_ceo"  # principal cố định (đã xác thực ở lớp MCP)


# ===========================================================================
# Đăng ký TOOLS — mỗi tool ánh xạ 1 thao tác /openclaw, gọi lại hàm bridge.
# Mỗi handler nhận dict `arguments`, trả về dict kết quả (sẽ JSON-hoá).
# Handler chạy trong threadpool (anyio.to_thread) vì bridge là sync + I/O chặn.
# ===========================================================================
def _h_get_kpi_realtime(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.kpi_realtime(actor=_ACTOR)


def _h_get_kpi_period(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.kpi_period(date_from=a.get("date_from"), date_to=a.get("date_to"), actor=_ACTOR)


def _h_list_leads(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.list_leads(
        status_filter=a.get("status_filter"),
        sale_id=a.get("sale_id"),
        source=a.get("source"),
        search=a.get("search"),
        page=int(a.get("page", 1)),
        page_size=int(a.get("page_size", 50)),
        actor=_ACTOR,
    )


def _h_list_users(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.list_users(actor=_ACTOR)


def _h_list_inventory(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.list_inventory(actor=_ACTOR)


def _h_get_sales_performance(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.sales_performance(period=a.get("period", "week"), actor=_ACTOR)


def _h_get_commission_config(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.get_commission_config(actor=_ACTOR)


def _h_get_audit_log(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.audit_log(limit=int(a.get("limit", 100)), actor=_ACTOR)


def _h_get_platforms_health(a: Dict[str, Any]) -> Dict[str, Any]:
    return bridge.platforms_health(actor=_ACTOR)


def _h_send_telegram(a: Dict[str, Any]) -> Dict[str, Any]:
    body = OpenClawTelegramSend(
        chat_id=a.get("chat_id"),
        text=a["text"],
        parse_mode=a.get("parse_mode"),
    )
    return bridge.telegram_send(body=body, actor=_ACTOR)


def _h_announce(a: Dict[str, Any]) -> Dict[str, Any]:
    body = OpenClawAnnounce(
        audience=a["audience"],
        channels=a.get("channels") or ["telegram"],
        message=a["message"],
        subject=a.get("subject", "Thông báo từ ELC"),
        user_ids=a.get("user_ids") or [],
    )
    return bridge.announce(body=body, actor=_ACTOR)


# Khai báo tool: name · description (tiếng Việt, cho LLM hiểu khi nào dùng) ·
# inputSchema (JSON Schema) · handler · write (đánh dấu hành động ghi).
TOOLS: List[Dict[str, Any]] = [
    # ----------------------------- READ -----------------------------
    {
        "name": "get_kpi_realtime",
        "description": "ĐỌC KPI realtime toàn hệ thống ELC: thống kê leads, tồn kho theo trạng thái, Live Match hôm nay. Dùng khi CEO hỏi 'tình hình hiện tại', 'số liệu live', 'dashboard ngay bây giờ'.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": _h_get_kpi_realtime,
        "write": False,
    },
    {
        "name": "get_kpi_period",
        "description": "ĐỌC KPI tổng hợp theo khoảng thời gian (date_from, date_to dạng YYYY-MM-DD). Dùng khi CEO hỏi báo cáo theo tuần/tháng/quý. Lưu ý: store hiện trả tổng hợp toàn kỳ (scope=all_time).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string", "description": "Ngày bắt đầu YYYY-MM-DD (tuỳ chọn)"},
                "date_to": {"type": "string", "description": "Ngày kết thúc YYYY-MM-DD (tuỳ chọn)"},
            },
            "additionalProperties": False,
        },
        "handler": _h_get_kpi_period,
        "write": False,
    },
    {
        "name": "list_leads",
        "description": "ĐỌC danh sách leads (CRM) có lọc & phân trang. Tham số: status_filter (cold/warm/hot...), sale_id, source, search (tên/sđt), page, page_size. Dùng khi CEO muốn xem/khảo sát khách hàng tiềm năng.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "status_filter": {"type": "string", "description": "Lọc theo trạng thái lead"},
                "sale_id": {"type": "string", "description": "Lọc theo ID sale phụ trách"},
                "source": {"type": "string", "description": "Lọc theo nguồn lead"},
                "search": {"type": "string", "description": "Tìm theo tên/số điện thoại/email"},
                "page": {"type": "integer", "minimum": 1, "default": 1},
                "page_size": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50},
            },
            "additionalProperties": False,
        },
        "handler": _h_list_leads,
        "write": False,
    },
    {
        "name": "list_users",
        "description": "ĐỌC toàn bộ người dùng hệ thống (sale/admin/client) ở dạng public_view (không lộ mật khẩu). Dùng khi CEO muốn xem đội ngũ, tìm sale, kiểm tra tài khoản.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": _h_list_users,
        "write": False,
    },
    {
        "name": "list_inventory",
        "description": "ĐỌC toàn bộ giỏ hàng/tồn kho căn hộ (đơn vị inventory) cùng trạng thái, giá, diện tích, hướng, view. Dùng khi CEO hỏi về quỹ căn, hàng còn/đã bán.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": _h_list_inventory,
        "write": False,
    },
    {
        "name": "get_sales_performance",
        "description": "ĐỌC bảng xếp hạng hiệu suất sale theo period (week/month). Dùng khi CEO hỏi ai đang dẫn đầu, xếp hạng đội sale.",
        "inputSchema": {
            "type": "object",
            "properties": {"period": {"type": "string", "enum": ["week", "month"], "default": "week"}},
            "additionalProperties": False,
        },
        "handler": _h_get_sales_performance,
        "write": False,
    },
    {
        "name": "get_commission_config",
        "description": "ĐỌC cấu hình hoa hồng hiện hành (tổng pool %, các tier, KPI tiers, version). Dùng khi CEO hỏi chính sách hoa hồng đang áp dụng.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": _h_get_commission_config,
        "write": False,
    },
    {
        "name": "get_audit_log",
        "description": "ĐỌC nhật ký kiểm toán (audit log) các hành động admin./openclaw. gần nhất. Tham số limit (mặc định 100). Dùng khi CEO muốn soát hoạt động/điều tra thao tác.",
        "inputSchema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 1000, "default": 100}},
            "additionalProperties": False,
        },
        "handler": _h_get_audit_log,
        "write": False,
    },
    {
        "name": "get_platforms_health",
        "description": "ĐỌC tình trạng sức khoẻ các nền tảng: Postgres, Chatwoot, cấu hình Telegram/SMTP/Railway. Dùng khi CEO hỏi 'hệ thống có ổn không', kiểm tra hạ tầng.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": _h_get_platforms_health,
        "write": False,
    },
    # ----------------------------- WRITE ----------------------------
    {
        "name": "send_telegram",
        "description": "⚠️ HÀNH ĐỘNG GHI — CẦN XÁC NHẬN. Gửi 1 tin nhắn Telegram. chat_id để trống → gửi cho CEO (OPENCLAW_CEO_CHAT_ID). Tham số: text (bắt buộc), parse_mode (MarkdownV2/HTML, tuỳ chọn). Thiếu cấu hình token/chat_id → trả thông báo lỗi, KHÔNG crash. Mọi lần gửi đều ghi audit.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "chat_id": {"type": "string", "description": "Chat ID đích; trống = CEO mặc định"},
                "text": {"type": "string", "description": "Nội dung tin nhắn"},
                "parse_mode": {"type": "string", "description": "MarkdownV2 | HTML (tuỳ chọn)"},
            },
            "required": ["text"],
            "additionalProperties": False,
        },
        "handler": _h_send_telegram,
        "write": True,
    },
    {
        "name": "announce",
        "description": "⚠️ HÀNH ĐỘNG GHI — CẦN XÁC NHẬN. Gửi thông báo hàng loạt tới audience (all_sales | all_admins | specific_users) qua channels (telegram và/hoặc email). Tham số: message (bắt buộc), subject, user_ids (khi specific_users). Người thiếu kênh sẽ bị skip, không chặn cả lô. Ghi audit.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "audience": {"type": "string", "enum": ["all_sales", "all_admins", "specific_users"]},
                "channels": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["telegram", "email"]},
                    "default": ["telegram"],
                },
                "message": {"type": "string", "description": "Nội dung thông báo"},
                "subject": {"type": "string", "default": "Thông báo từ ELC"},
                "user_ids": {"type": "array", "items": {"type": "string"}, "description": "Khi audience=specific_users"},
            },
            "required": ["audience", "message"],
            "additionalProperties": False,
        },
        "handler": _h_announce,
        "write": True,
    },
]

_TOOLS_BY_NAME: Dict[str, Dict[str, Any]] = {t["name"]: t for t in TOOLS}


# ===========================================================================
# Auth — đọc token từ header (ASGI scope), so khớp hằng-thời-gian.
# ===========================================================================
def _expected_token() -> str:
    return bridge._expected_token()  # tái dùng đúng logic bridge (settings + env)


def _check_auth(headers: Dict[str, str]) -> bool:
    expected = _expected_token()
    presented = (headers.get("x-openclaw-token") or "").strip()
    if not presented:
        authz = headers.get("authorization") or ""
        if authz.lower().startswith("bearer "):
            presented = authz.split(None, 1)[1].strip()
    if not expected or not presented:
        return False
    return secrets.compare_digest(presented, expected)


# ===========================================================================
# JSON-RPC helpers
# ===========================================================================
def _rpc_result(req_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _rpc_error(req_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": req_id, "error": err}


def _tools_list_payload() -> Dict[str, Any]:
    return {
        "tools": [
            {"name": t["name"], "description": t["description"], "inputSchema": t["inputSchema"]}
            for t in TOOLS
        ]
    }


async def _run_tool(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Chạy 1 tool, trả về cấu trúc CallToolResult (content + isError).

    Bắt lỗi gọn: HTTPException (thiếu cấu hình, 4xx/5xx) và mọi Exception khác đều
    được chuyển thành kết quả isError=true (KHÔNG ném ra ngoài → không crash server).
    """
    tool = _TOOLS_BY_NAME.get(name)
    if tool is None:
        return {"content": [{"type": "text", "text": f"Tool không tồn tại: {name}"}], "isError": True}
    handler: Callable[[Dict[str, Any]], Dict[str, Any]] = tool["handler"]
    try:
        data = await anyio.to_thread.run_sync(handler, arguments or {})
        text = json.dumps(data, ensure_ascii=False, default=str)
        return {"content": [{"type": "text", "text": text}], "isError": False}
    except HTTPException as exc:
        msg = f"Lỗi {exc.status_code}: {exc.detail}"
        return {"content": [{"type": "text", "text": msg}], "isError": True}
    except KeyError as exc:
        return {"content": [{"type": "text", "text": f"Thiếu tham số bắt buộc: {exc}"}], "isError": True}
    except Exception as exc:  # noqa: BLE001 — không bao giờ để tool làm chết server
        log.exception("MCP tool %s lỗi", name)
        return {"content": [{"type": "text", "text": f"Lỗi nội bộ: {type(exc).__name__}: {exc}"}], "isError": True}


async def _dispatch(msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Xử lý 1 message JSON-RPC. Trả None nếu là notification (không có id)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return _rpc_error(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid Request")
    req_id = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}
    is_notification = "id" not in msg

    if method == "initialize":
        protocol = params.get("protocolVersion") or _DEFAULT_PROTOCOL
        result = {
            "protocolVersion": protocol,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": _SERVER_INFO,
            "instructions": (
                "MCP bridge điều khiển hệ thống ELC. Tool tiền tố get_/list_ là CHỈ ĐỌC; "
                "send_telegram và announce là HÀNH ĐỘNG GHI — cần xác nhận trước khi gọi."
            ),
        }
        return None if is_notification else _rpc_result(req_id, result)

    if method in ("notifications/initialized", "initialized"):
        return None  # notification, không phản hồi

    if method == "ping":
        return None if is_notification else _rpc_result(req_id, {})

    if method == "tools/list":
        return None if is_notification else _rpc_result(req_id, _tools_list_payload())

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not name:
            return _rpc_error(req_id, -32602, "Thiếu params.name")
        result = await _run_tool(name, arguments)
        return None if is_notification else _rpc_result(req_id, result)

    # Method không hỗ trợ.
    if is_notification:
        return None
    return _rpc_error(req_id, -32601, f"Method không hỗ trợ: {method}")


# ===========================================================================
# ASGI app — mount tại /mcp (app.mount("/mcp", mcp_asgi_app) trong main.py).
# Thuần ASGI để kiểm soát hoàn toàn POST/GET + tránh rắc rối trailing-slash.
# ===========================================================================
async def _send_json(send, status_code: int, payload: Any, extra_headers: Optional[List] = None) -> None:
    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    headers = [(b"content-type", b"application/json; charset=utf-8")]
    if extra_headers:
        headers.extend(extra_headers)
    await send({"type": "http.response.start", "status": status_code, "headers": headers})
    await send({"type": "http.response.body", "body": body})


async def _read_body(receive) -> bytes:
    chunks = b""
    while True:
        event = await receive()
        if event["type"] == "http.request":
            chunks += event.get("body", b"") or b""
            if not event.get("more_body", False):
                break
        elif event["type"] == "http.disconnect":
            break
    return chunks


async def mcp_asgi_app(scope, receive, send) -> None:
    """Điểm vào ASGI cho MCP streamable-http."""
    if scope["type"] == "lifespan":
        # Mount con không nhận lifespan từ parent, nhưng xử lý phòng hờ.
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
        return

    if scope["type"] != "http":
        return

    method = scope["method"].upper()
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}

    # CORS preflight.
    if method == "OPTIONS":
        await send({
            "type": "http.response.start",
            "status": 204,
            "headers": [
                (b"access-control-allow-origin", b"*"),
                (b"access-control-allow-methods", b"POST, GET, OPTIONS"),
                (b"access-control-allow-headers", b"content-type, x-openclaw-token, authorization, mcp-session-id, mcp-protocol-version"),
            ],
        })
        await send({"type": "http.response.body", "body": b""})
        return

    # Xác thực — fail-closed.
    if not _check_auth(headers):
        await _send_json(
            send, 401,
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "Unauthorized: thiếu/sai X-Openclaw-Token"}},
            extra_headers=[(b"www-authenticate", b"Bearer")],
        )
        return

    # GET = kênh SSE server->client (tuỳ chọn). Bản tối thiểu không hỗ trợ → 405.
    if method == "GET":
        await _send_json(
            send, 405,
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "GET/SSE không hỗ trợ; dùng POST JSON-RPC."}},
            extra_headers=[(b"allow", b"POST, OPTIONS")],
        )
        return

    if method != "POST":
        await _send_json(send, 405, {"error": "Method Not Allowed"}, extra_headers=[(b"allow", b"POST, OPTIONS")])
        return

    raw = await _read_body(receive)
    if not raw:
        await _send_json(send, 400, _rpc_error(None, -32700, "Body rỗng"))
        return
    try:
        message = json.loads(raw.decode("utf-8"))
    except Exception:  # noqa: BLE001
        await _send_json(send, 400, _rpc_error(None, -32700, "Parse error: body không phải JSON"))
        return

    session_header = [(b"mcp-session-id", (headers.get("mcp-session-id") or secrets.token_hex(16)).encode("latin-1"))]

    # Batch (list) hoặc message đơn.
    if isinstance(message, list):
        if not message:
            await _send_json(send, 400, _rpc_error(None, -32600, "Batch rỗng"))
            return
        responses = []
        for m in message:
            r = await _dispatch(m)
            if r is not None:
                responses.append(r)
        # Toàn notification → 202 Accepted, không body.
        if not responses:
            await send({"type": "http.response.start", "status": 202, "headers": session_header})
            await send({"type": "http.response.body", "body": b""})
            return
        await _send_json(send, 200, responses, extra_headers=session_header)
        return

    response = await _dispatch(message)
    if response is None:
        # Notification đơn → 202 Accepted.
        await send({"type": "http.response.start", "status": 202, "headers": session_header})
        await send({"type": "http.response.body", "body": b""})
        return
    await _send_json(send, 200, response, extra_headers=session_header)
