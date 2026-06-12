"""Endpoint /agent/chat — nơi web dashboard / chat widget gọi vào."""

import logging
import re

from fastapi import APIRouter, HTTPException
from app.agents.sales_agent import run_sales_agent
from app.core import conversation_store
from app.schemas.chat import ChatRequest, ChatResponse

log = logging.getLogger("api.chat")

router = APIRouter(prefix="/agent", tags=["agent"])


# ---------------------------------------------------------------------------
# Trích xuất thông tin liên hệ từ tin nhắn khách (cho auto-capture lead)
# ---------------------------------------------------------------------------

# Ứng viên SĐT: bắt đầu +84 / 84 / 0, theo sau là các chữ số (cho phép khoảng
# trắng/dấu chấm/gạch ngang xen giữa). Chuẩn hoá + kiểm độ dài ở _extract_phone.
_PHONE_RE = re.compile(r"(?:\+?84|0)[\d\s.\-]{7,13}")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Tên (best-effort, tuỳ chọn): "tên tôi/mình/em là ...", "tên: ..."
_NAME_RE = re.compile(
    r"t[êe]n\s*(?:t[ôo]i|m[ìi]nh|em|ch[áa]u|anh|ch[ị]|c[ôo])?\s*(?:l[àa]|:)\s*([^\n,.;0-9@]{1,40})",
    re.IGNORECASE,
)


def _extract_phone(text: str) -> str | None:
    """Trả SĐT chuẩn hoá (0xxxxxxxxx) đầu tiên hợp lệ trong text, None nếu không có."""
    from app.core import lead_store

    for m in _PHONE_RE.finditer(text or ""):
        norm = lead_store.normalize_phone(m.group())
        # SĐT VN sau chuẩn hoá: bắt đầu '0', dài 9–11 chữ số.
        if norm.startswith("0") and 9 <= len(norm) <= 11:
            return norm
    return None


def _extract_email(text: str) -> str | None:
    m = _EMAIL_RE.search(text or "")
    return m.group(0).strip().lower() if m else None


def _extract_name(text: str) -> str | None:
    m = _NAME_RE.search(text or "")
    if not m:
        return None
    name = m.group(1).strip()
    return name or None


def _maybe_capture_lead(req: ChatRequest) -> None:
    """Tự tạo / cập nhật lead vào CRM thật khi khách để lại liên hệ trong chat.

    AN TOÀN — đặc tả KHE HỞ 2:
      - CHỈ tạo khi có ít nhất SĐT HOẶC email hợp lệ (không tạo lead rác).
      - Khử trùng theo SĐT/email (find_by_contact); đã có thì bổ sung field thiếu.
      - Lead mới gắn source="chatbot" và đi qua create_lead → tự gán sale AI + pipeline.
      - Nuốt MỌI lỗi: không bao giờ làm hỏng phản hồi chat.
    """
    try:
        from app.core import lead_store

        # Chỉ quét tin nhắn của KHÁCH (role user) để lấy thông tin liên hệ.
        text = "\n".join(m.content or "" for m in req.messages if m.role == "user")
        phone = _extract_phone(text)
        email = _extract_email(text)
        if not phone and not email:
            return  # chưa có liên hệ hợp lệ → không tạo lead

        name = _extract_name(text) or ""
        note = "Khách để lại liên hệ qua chatbot tư vấn"
        if req.project_slug:
            note += f" (dự án: {req.project_slug})"

        existing = lead_store.find_by_contact(phone, email)
        if existing:
            fields: dict = {}
            if name and not existing.get("name"):
                fields["name"] = name
            if email and not existing.get("email"):
                fields["email"] = email
            if phone and not existing.get("phone"):
                fields["phone"] = phone
            if fields:
                lead_store.update_lead(existing["id"], **fields)
        else:
            lead_store.create_lead(
                {
                    "name": name,
                    "phone": phone or "",
                    "email": email,
                    "note": note,
                    "source": "chatbot",
                }
            )
    except Exception as exc:  # noqa: BLE001 — auto-capture không được phá luồng chat
        log.warning("auto-capture lead từ chatbot thất bại: %s", exc)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages không được rỗng")
    result = await run_sales_agent(
        messages=req.messages,
        project_slug=req.project_slug,
    )
    # Bịt KHE HỞ ĐỒNG BỘ: nếu khách để lại SĐT/email trong hội thoại → tạo/cập nhật
    # lead vào CRM thật (best-effort, đã nuốt lỗi bên trong).
    _maybe_capture_lead(req)
    # Ghi lịch sử hội thoại cho admin tra cứu (best-effort, không chặn luồng chat).
    try:
        conversation_store.log_turn(
            conversation_id=req.lead_id,
            user_message=req.messages[-1].content,
            assistant_reply=result.reply,
            intent_score=result.intent_score,
            is_hot=result.is_hot,
            project_slug=req.project_slug,
        )
    except Exception:  # noqa: BLE001 — log lỗi không được ảnh hưởng phản hồi
        pass
    return result
