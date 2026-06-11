"""API Tổng đài (Call Center) tích hợp Stringee — click-to-call + webhook + log 360.

Hai router (đăng ký trong app/main.py):
  • router         (prefix /crm/call)           — sale/admin (auth require_sale).
      - GET  /crm/call/config  : FE kiểm tra Stringee đã cấu hình chưa (ẩn/hiện nút).
      - GET  /crm/call/token   : cấp client access token cho Web SDK (userId = sale).
      - POST /crm/call/start   : bắt đầu gọi 1 lead → ghi contact log "đang gọi"
                                  (kênh call_center) + trả thông tin cho FE Web SDK
                                  (hoặc callout server-side nếu server_callout=true).
      - POST /crm/call/attach  : FE gắn call_id (Web SDK) vào log để khớp sự kiện.
      - POST /crm/call/status  : FE cập nhật trạng thái cuối (fallback khi webhook
                                  công khai chưa nhận được — vd môi trường dev).
  • webhook_router (prefix /webhook/stringee, PUBLIC) — Stringee gọi vào (không auth):
      - {GET,POST} /webhook/stringee/answer : trả SCCO (bật ghi âm + kết nối).
      - POST       /webhook/stringee/event  : sự kiện cuộc gọi (answered/ended) +
                                  ghi âm (recording) → cập nhật contact log 360.

AN TOÀN: KHÔNG lộ API secret ra FE — chỉ cấp client access token TẠM THỜI (TTL
ngắn, userId = sale). Thiếu cấu hình Stringee → 503 "chưa cấu hình" (không 500).
Webhook trả/nhận an toàn: mọi lỗi đều nuốt + log, luôn trả 200 cho Stringee.

Khai báo trong Stringee Dashboard (Project → Manage answer_url / event_url):
  answer_url = https://api.eurowindowlightcity.net/webhook/stringee/answer
  event_url  = https://api.eurowindowlightcity.net/webhook/stringee/event
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from app.api.deps import require_sale
from app.core import lead_store, stringee_client
from app.core.settings import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/crm/call", tags=["call-center"])
webhook_router = APIRouter(prefix="/webhook/stringee", tags=["call-center-webhook"])

# Kênh dùng cho cuộc gọi tổng đài (khớp khối "call_center" của Hồ sơ 360°).
CALL_CHANNEL = "call_center"


# Stringee giới hạn độ dài userId (báo lỗi USER_ID_TOO_LONG nếu vượt). Tài liệu
# không công bố con số chính xác; thực tế cap ~36 ký tự. Sale id là UUID4 (36 ký
# tự) nên "sale_" + UUID = 41 ký tự → vượt giới hạn. Đặt ngưỡng an toàn 36.
_STRINGEE_USER_ID_MAXLEN = 36


def _stringee_user_id(sale_id: str) -> str:
    """userId trên Stringee cho 1 sale — ỔN ĐỊNH, DUY NHẤT, ≤ giới hạn độ dài.

    Giữ namespace `sale_` cho dễ đọc khi id ngắn. Nếu `sale_<id>` vượt giới hạn
    (vd id là UUID dài) → dùng `sale_<16 ký tự đầu sha1(id)>` (21 ký tự): luôn ra
    cùng userId cho cùng sale, chỉ gồm ký tự hợp lệ [a-z0-9_], không vượt cap.

    Lưu ý: webhook khớp cuộc gọi về lead/sale qua clientCustomData = log_id (xem
    call_start), KHÔNG dùng userId này, nên rút gọn userId không phá vỡ mapping.
    """
    sid = str(sale_id)
    candidate = f"sale_{sid}"
    if len(candidate) <= _STRINGEE_USER_ID_MAXLEN:
        return candidate
    digest = hashlib.sha1(sid.encode("utf-8")).hexdigest()[:16]
    return f"sale_{digest}"


def _answer_url() -> str:
    return f"{settings.stringee_webhook_base.rstrip('/')}/webhook/stringee/answer"


def _event_url() -> str:
    return f"{settings.stringee_webhook_base.rstrip('/')}/webhook/stringee/event"


# ===========================================================================
# FE-FACING (auth sale/admin)
# ===========================================================================

@router.get("/config")
def call_config(user: dict = Depends(require_sale)) -> dict:
    """FE kiểm tra tổng đài đã sẵn sàng chưa (để ẩn/disable nút Gọi)."""
    return {
        "configured": stringee_client.is_configured(),
        "from_number": settings.stringee_from_number or None,
        "user_id": _stringee_user_id(user["id"]),
    }


@router.get("/token")
def call_token(user: dict = Depends(require_sale)) -> dict:
    """Cấp client access token (Web SDK) cho sale hiện tại — userId = sale."""
    if not stringee_client.is_configured():
        raise HTTPException(status_code=503, detail="Chưa cấu hình Stringee")
    try:
        token = stringee_client.generate_client_token(
            _stringee_user_id(user["id"]),
            expires_seconds=settings.stringee_token_ttl,
        )
    except stringee_client.StringeeNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {
        "access_token": token,
        "user_id": _stringee_user_id(user["id"]),
        "expires_in": settings.stringee_token_ttl,
    }


class CallStartBody(BaseModel):
    lead_id: str
    # True → server gọi callout (Stringee gọi số tổng đài tới khách). False (mặc
    # định) → FE dùng Web SDK gọi từ trình duyệt; server chỉ ghi log + trả thông tin.
    server_callout: bool = False


def _owned_lead(lead_id: str, user: dict) -> dict:
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    if user.get("role") != "admin" and lead.get("assigned_sale_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc về bạn")
    return lead


@router.post("/start", status_code=status.HTTP_201_CREATED)
def call_start(payload: CallStartBody, user: dict = Depends(require_sale)) -> dict:
    """Bắt đầu gọi 1 khách: ghi contact log "đang gọi" + trả thông tin gọi.

    Mặc định trả thông tin để FE gọi bằng Web SDK (mode=web_sdk). Nếu
    server_callout=true thì server gọi callout luôn (mode=server_callout).
    """
    if not stringee_client.is_configured():
        raise HTTPException(status_code=503, detail="Chưa cấu hình Stringee")
    lead = _owned_lead(payload.lead_id, user)
    to_number = (lead.get("phone") or "").strip()
    if not to_number:
        raise HTTPException(status_code=400, detail="Khách hàng chưa có số điện thoại")

    clog = lead_store.add_contact_log(
        payload.lead_id,
        user["id"],
        channel=CALL_CHANNEL,
        note="Bắt đầu gọi tổng đài",
        outcome="",  # chưa có kết quả — cập nhật khi cuộc gọi kết thúc
        created_by_name=user.get("full_name"),
        extra={
            "call_status": "calling",
            "direction": "outbound",
            "to_number": to_number,
            "duration": None,
            "recording_url": None,
            "call_id": None,
        },
    )
    if clog is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

    result: dict[str, Any] = {
        "mode": "web_sdk",
        "log_id": clog["id"],
        "to_number": to_number,
        "from_number": settings.stringee_from_number or None,
        "user_id": _stringee_user_id(user["id"]),
        # FE truyền custom_data vào makeCall → Stringee echo lại (clientCustomData)
        # trong sự kiện để khớp đúng contact log.
        "custom_data": clog["id"],
    }

    if payload.server_callout:
        try:
            res = stringee_client.callout(
                to_number=to_number,
                answer_url=_answer_url(),
                custom_data=clog["id"],
            )
        except stringee_client.StringeeNotConfigured as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        except stringee_client.StringeeError as exc:
            lead_store.update_contact_log(
                clog["id"], call_status="failed", note="Gọi tổng đài lỗi"
            )
            raise HTTPException(status_code=502, detail=str(exc))
        call_id = res.get("call_id") or res.get("callId")
        if call_id:
            lead_store.update_contact_log(clog["id"], call_id=call_id)
        result["mode"] = "server_callout"
        result["call_id"] = call_id
        result["stringee_response"] = res

    return result


class AttachBody(BaseModel):
    log_id: str
    call_id: str


@router.post("/attach")
def call_attach(payload: AttachBody, user: dict = Depends(require_sale)) -> dict:
    """FE gắn call_id (Web SDK sinh) vào log để webhook ghi âm khớp được."""
    updated = lead_store.update_contact_log(payload.log_id, call_id=payload.call_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy log cuộc gọi")
    return {"ok": True}


class CallStatusBody(BaseModel):
    log_id: str
    call_status: str
    duration: Optional[int] = None
    outcome: Optional[str] = None


@router.post("/status")
def call_status_update(payload: CallStatusBody, user: dict = Depends(require_sale)) -> dict:
    """FE cập nhật trạng thái cuối cuộc gọi (fallback khi webhook chưa tới).

    Hữu ích ở môi trường dev (Stringee không gọi được webhook localhost) để
    timeline 360 vẫn hiện đúng trạng thái/thời lượng.
    """
    updated = lead_store.update_contact_log(
        payload.log_id,
        call_status=payload.call_status,
        duration=payload.duration,
        outcome=payload.outcome or None,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy log cuộc gọi")
    return {"ok": True}


@router.get("/recording/{log_id}")
def call_recording(log_id: str, user: dict = Depends(require_sale)) -> Response:
    """Proxy stream file ghi âm của 1 cuộc gọi (xác thực bằng REST token server-side).

    recording_url của Stringee cần header X-STRINGEE-AUTH — trình duyệt KHÔNG tự
    gắn được (và không được lộ secret). Endpoint này (auth sale/admin, kiểm quyền
    sở hữu lead) tải file rồi trả về cho FE phát lại. Ghi âm Stringee giữ 30 ngày.
    """
    clog = lead_store.get_contact_log(log_id)
    if not clog:
        raise HTTPException(status_code=404, detail="Không tìm thấy log cuộc gọi")
    lead = lead_store.get_lead(clog.get("lead_id"))
    if (
        lead
        and user.get("role") != "admin"
        and lead.get("assigned_sale_id") != user["id"]
    ):
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc về bạn")
    rec_url = clog.get("recording_url")
    if not rec_url:
        raise HTTPException(status_code=404, detail="Cuộc gọi chưa có ghi âm")
    if not stringee_client.is_configured():
        raise HTTPException(status_code=503, detail="Chưa cấu hình Stringee")

    import httpx

    headers = {"X-STRINGEE-AUTH": stringee_client.generate_rest_token()}
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(rec_url, headers=headers)
            resp.raise_for_status()
            content = resp.content
            ctype = resp.headers.get("content-type", "audio/mpeg")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Lấy ghi âm lỗi: {exc}")
    return Response(content=content, media_type=ctype)


# ===========================================================================
# WEBHOOK PUBLIC (Stringee gọi vào — KHÔNG auth)
# ===========================================================================

async def _read_params(request: Request) -> dict:
    """Đọc tham số từ query + body (JSON hoặc form-urlencoded). An toàn mọi lỗi."""
    params: dict[str, Any] = dict(request.query_params)
    try:
        raw = await request.body()
        if raw:
            ctype = request.headers.get("content-type", "")
            if "json" in ctype:
                data = json.loads(raw)
                if isinstance(data, dict):
                    params.update(data)
            else:
                for k, v in parse_qs(raw.decode("utf-8", "ignore")).items():
                    params[k] = v[0] if isinstance(v, list) and v else v
    except Exception as exc:  # noqa: BLE001 — webhook không được vỡ vì parse lỗi
        log.warning("[stringee] đọc params lỗi: %s", exc)
    return params


def _extract_number(value: Any) -> Optional[str]:
    """Lấy số điện thoại từ field from/to (có thể là dict, JSON-string, hoặc str)."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("number") or value.get("alias")
    if isinstance(value, str):
        s = value.strip()
        if s.startswith("{"):
            try:
                obj = json.loads(s)
                return obj.get("number") or obj.get("alias")
            except Exception:  # noqa: BLE001
                return None
        return s or None
    return None


def _to_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_destination(params: dict) -> Optional[str]:
    """Số đích (SĐT khách) cho cuộc gọi app-to-phone.

    Ưu tiên `to` Stringee gửi (FE truyền vào makeCall → Stringee echo lại). Nếu
    thiếu, tra ngược qua custom_data (= log_id) để lấy `to_number` đã lưu lúc
    /call/start. Trả None nếu không xác định được (→ chỉ ghi âm, không connect).
    """
    to = _extract_number(params.get("to"))
    if to:
        return to
    custom = params.get("clientCustomData") or params.get("custom_data") or params.get("custom")
    if custom:
        try:
            clog = lead_store.get_contact_log(str(custom))
        except Exception:  # noqa: BLE001 — webhook không được vỡ
            clog = None
        if clog:
            num = (clog.get("to_number") or "").strip()
            return num or None
    return None


@webhook_router.api_route("/answer", methods=["GET", "POST"])
async def stringee_answer(request: Request):
    """answer_url — trả SCCO điều khiển cuộc gọi: BẬT GHI ÂM + KẾT NỐI. PUBLIC.

    SCCO (Stringee Call Control Object) là 1 mảng action. Ở đây:
      1) record  — ghi âm mp3, gửi recording_url về event_url khi xong.
      2) connect — nối số TỔNG ĐÀI Stringee (from) ra SĐT khách (to).

    QUAN TRỌNG (app-to-phone, Web SDK gọi ra số điện thoại): theo tài liệu Stringee
    "Make call to a phone number, then connect…", action `connect` phải đặt
      from = SỐ TỔNG ĐÀI Stringee đã đăng ký (STRINGEE_FROM_NUMBER), type "external"
      to   = SĐT khách, type "external"
    KHÔNG dùng `from` type "internal" / userId — đó là nguyên nhân lỗi
    CALL_NOT_ALLOWED_BY_YOUR_SERVER (Stringee từ chối vì caller-id không phải số
    đã đăng ký của project). Khi Web SDK makeCall, Stringee gửi `from`=tham số FE
    truyền (có thể là userId nếu thiếu số), nên KHÔNG tin `from` của request mà
    LUÔN dùng STRINGEE_FROM_NUMBER làm caller-id của connect.

    Thiếu số đích (chưa rõ số khách) → chỉ trả record (tránh connect rỗng gây lỗi).
    """
    params = await _read_params(request)
    # Caller-id của connect PHẢI là số tổng đài Stringee đã đăng ký, không lấy từ
    # request (request `from` có thể là userId của Web SDK → bị từ chối).
    caller = (settings.stringee_from_number or "").strip() or _extract_number(
        params.get("from")
    )
    to = _resolve_destination(params)

    scco: list[dict] = [
        {"action": "record", "eventUrl": _event_url(), "format": "mp3"}
    ]
    if to and caller:
        scco.append(
            {
                "action": "connect",
                "from": {"type": "external", "number": caller, "alias": caller},
                "to": {"type": "external", "number": to, "alias": to},
            }
        )
    return scco


@webhook_router.api_route("/event", methods=["GET", "POST"])
async def stringee_event(request: Request) -> dict:
    """event_url — sự kiện cuộc gọi (answered/ended) + ghi âm (recording). PUBLIC.

    Cập nhật contact log của lead (trạng thái, thời lượng, link ghi âm) → hiện
    trong timeline 360. Khớp log theo clientCustomData (= log_id) hoặc call_id.
    Luôn trả 200 (nuốt mọi lỗi) để Stringee không retry vô hạn.
    """
    params = await _read_params(request)
    try:
        etype = params.get("type")
        call_id = params.get("call_id") or params.get("callId")

        # 1) Sự kiện ghi âm: chỉ có call_id + recording_url.
        if etype == "recording":
            rec_url = params.get("recording_url")
            if call_id and rec_url:
                lead_store.update_contact_log_by_call_id(
                    call_id, recording_url=rec_url
                )
            return {"status": "ok"}

        # 2) Sự kiện cuộc gọi: cập nhật trạng thái + (khi ended) thời lượng/kết quả.
        custom = params.get("clientCustomData") or params.get("custom_data")
        call_status = params.get("call_status")
        fields: dict[str, Any] = {}
        if call_status:
            fields["call_status"] = call_status
        if call_id:
            fields["call_id"] = call_id
        if call_status == "ended":
            answer_dur = _to_int(params.get("answerDuration"))
            duration = _to_int(params.get("duration"))
            if duration is not None:
                fields["duration"] = duration
            if answer_dur is not None:
                fields["answer_duration"] = answer_dur
            end_cause = params.get("endCallCause")
            if end_cause:
                fields["end_cause"] = end_cause
            # Không nghe máy (answerDuration=0) → outcome no_answer cho timeline/KPI.
            if answer_dur == 0:
                fields["call_status"] = "no_answer"
                fields["outcome"] = "no_answer"

        if not fields:
            return {"status": "ignored"}

        # Khớp log: ưu tiên log_id (clientCustomData), fallback theo call_id.
        if custom and lead_store.update_contact_log(custom, **fields) is not None:
            return {"status": "ok"}
        if call_id:
            lead_store.update_contact_log_by_call_id(call_id, **fields)
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001 — webhook luôn an toàn
        log.exception("[stringee] xử lý event lỗi: %s: %s", type(exc).__name__, exc)
        return {"status": "error"}
