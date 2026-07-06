"""Webhook Chatwoot Agent Bot — AI tự trả lời khách qua RAG knowledge base Happy Home.

Luồng xử lý (POST /webhook/chatwoot):
  1. Lọc sự kiện: chỉ xử lý message_created + incoming + không phải private.
  2. Lookup/tạo Lead local, link với Chatwoot contact_id.
  3. Append tin khách vào lịch sử hội thoại (in-memory theo conversation_id).
  4. Retrieval BM25 trên KB dự án Happy Home → top-k context.
  5. Gọi Claude (stream) sinh câu trả lời tiếng Việt ngắn gọn.
  6. Gửi reply về Chatwoot (outgoing message).
  7. Handoff: nếu phát hiện ý định mua mạnh → assign team BĐS + gắn nhãn hot-lead.

Thiết kế MVP:
  - Store hội thoại & map contact→lead nằm in-memory (giống app/api/leads.py),
    giai đoạn 2 thay bằng PostgreSQL.
  - Luôn trả 200 OK cho Chatwoot (kể cả khi xử lý lỗi) để tránh retry vô hạn.
  - Xử lý nặng (LLM + gọi API Chatwoot) chạy ở BackgroundTask: webhook phản hồi
    nhanh, không để Chatwoot timeout.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks

from app.agents.retrieval import format_context_for_llm, get_index
from app.api import leads as leads_store
from app.core.settings import settings
from app.schemas.chat import ChatMessage
from app.schemas.lead import Lead
from app.schemas.webhook import ChatwootSender, ChatwootWebhookPayload

log = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])


# ---------------------------------------------------------------------------
# State in-memory (MVP)
# ---------------------------------------------------------------------------

# conversation_id (Chatwoot) -> lịch sử hội thoại
_HISTORY: dict[int, list[ChatMessage]] = {}
# contact_id (Chatwoot) -> lead_id (local)
_CONTACT_TO_LEAD: dict[int, str] = {}

_MAX_HISTORY = 20  # giữ tối đa N tin gần nhất để giới hạn token


# ---------------------------------------------------------------------------
# Prompt & intent
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "Bạn là AI tư vấn căn hộ Happy Home Thanh Hóa Thanh Hoá. "
    "Trả lời ngắn gọn, thân thiện tiếng Việt. "
    "Khi khách hỏi giá/căn cụ thể, đề xuất 2-3 căn phù hợp. "
    "Khi khách thể hiện ý định mua mạnh, mời họ để lại SĐT để CSKH gọi lại "
    "trong 5 phút. Tuyệt đối không bịa thông tin ngoài ngữ cảnh được cấp."
)

# Tín hiệu khách muốn gặp người thật → handoff sang team BĐS.
_HANDOFF_KEYWORDS = (
    "đặt cọc",
    "muốn xem nhà",
    "xem nhà",
    "xem căn",
    "gọi cho tôi",
    "gọi cho em",
    "gọi lại",
    "khi nào xem",
    "đi xem",
    "nhà mẫu",
    "để lại sđt",
    "số điện thoại của tôi",
    "ký hợp đồng",
)


def _detect_handoff(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in _HANDOFF_KEYWORDS)


# ---------------------------------------------------------------------------
# Lead + history helpers
# ---------------------------------------------------------------------------

def _get_or_create_lead(sender: Optional[ChatwootSender]) -> Optional[Lead]:
    """Tìm lead theo Chatwoot contact_id (hoặc phone/email), tạo mới nếu chưa có.

    Đăng ký lead vào store dùng chung của app/api/leads.py để dashboard thấy.
    """
    if sender is None:
        return None

    contact_id = sender.id

    # 1) Đã từng map contact_id này.
    if contact_id is not None and contact_id in _CONTACT_TO_LEAD:
        lead = leads_store._LEADS.get(_CONTACT_TO_LEAD[contact_id])
        if lead:
            _enrich_lead(lead, sender)
            return lead

    # 2) Dedupe theo phone/email (khách từng vào qua kênh khác).
    existing = leads_store._find_existing(sender.phone_number, sender.email)
    if existing:
        if contact_id is not None:
            _CONTACT_TO_LEAD[contact_id] = existing.id
        _enrich_lead(existing, sender)
        return existing

    # 3) Tạo lead mới.
    lead = Lead(
        id=str(uuid4()),
        full_name=sender.name,
        phone=sender.phone_number,
        email=sender.email,
        source_channel="chatwoot",
        project="Happy Home Thanh Hóa",
        project_slug=settings.elc_project_slug,
    )
    leads_store._LEADS[lead.id] = lead
    if contact_id is not None:
        _CONTACT_TO_LEAD[contact_id] = lead.id
    log.info("[chatwoot] tạo lead mới %s cho contact_id=%s", lead.id, contact_id)
    return lead


def _enrich_lead(lead: Lead, sender: ChatwootSender) -> None:
    """Bổ sung thông tin liên hệ nếu lần này khách cung cấp thêm."""
    if sender.name and not lead.full_name:
        lead.full_name = sender.name
    if sender.phone_number and not lead.phone:
        lead.phone = sender.phone_number
    if sender.email and not lead.email:
        lead.email = sender.email


def _append_history(conversation_id: int, role: str, content: str) -> list[ChatMessage]:
    history = _HISTORY.setdefault(conversation_id, [])
    history.append(ChatMessage(role=role, content=content))  # type: ignore[arg-type]
    if len(history) > _MAX_HISTORY:
        del history[: len(history) - _MAX_HISTORY]
    return history


# ---------------------------------------------------------------------------
# Sinh câu trả lời (RAG + Claude)
# ---------------------------------------------------------------------------

def _retrieve_context(query: str) -> str:
    idx = get_index(settings.elc_project_slug)
    if idx is None:
        log.info("[chatwoot] chưa có KB '%s' — bỏ qua retrieval", settings.elc_project_slug)
        return ""
    chunks = idx.search(query, top_k=3)
    return format_context_for_llm(chunks)


def _mock_reply(query: str, context: str) -> str:
    """Trả lời giả lập khi chưa có ANTHROPIC_API_KEY (USE_MOCK_LLM)."""
    base = (
        "Em chào anh/chị, em là trợ lý ảo của Happy Home Thanh Hóa Thanh Hoá. "
        f'Em đã ghi nhận câu hỏi: "{query[:120]}". '
    )
    if context:
        return base + "Em đã tìm được thông tin liên quan trong tài liệu dự án và sẽ tư vấn chi tiết ngay ạ."
    return base + "Anh/chị muốn tham khảo loại căn nào (1PN/2PN/3PN) và tầm ngân sách bao nhiêu để em tư vấn ạ?"


async def _generate_reply(history: list[ChatMessage], context: str) -> str:
    """Sinh câu trả lời. Stream từ Claude rồi gộp lại thành 1 message gửi Chatwoot."""
    query = next((m.content for m in reversed(history) if m.role == "user"), "")

    if settings.use_mock_llm or not settings.anthropic_api_key:
        return _mock_reply(query, context)

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    system = SYSTEM_PROMPT
    if context:
        system += f"\n\nNGỮ CẢNH DỰ ÁN Happy Home:\n{context}"

    parts: list[str] = []
    async with client.messages.stream(
        model=settings.llm_model,
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in history],
    ) as stream:
        async for text in stream.text_stream:
            parts.append(text)
    reply = "".join(parts).strip()
    return reply or _mock_reply(query, context)


# ---------------------------------------------------------------------------
# Gọi API Chatwoot
# ---------------------------------------------------------------------------

async def _chatwoot_request(
    method: str, path: str, json: Optional[dict] = None
) -> Optional[Any]:
    """Gọi REST API Chatwoot. Trả None nếu chưa cấu hình token hoặc lỗi.

    Toàn bộ outbound HTTP đi qua hàm này để dễ mock trong test.
    """
    if not settings.chatwoot_api_token:
        log.warning("[chatwoot] thiếu CHATWOOT_API_TOKEN — bỏ qua call %s %s", method, path)
        return None

    import httpx

    url = f"{settings.chatwoot_base_url.rstrip('/')}{path}"
    headers = {
        "api_access_token": settings.chatwoot_api_token,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.request(method, url, json=json, headers=headers)
            resp.raise_for_status()
            return resp.json() if resp.content else None
    except Exception as exc:  # noqa: BLE001 — không để lỗi outbound làm vỡ webhook
        log.error("[chatwoot] call %s %s lỗi: %s: %s", method, path, type(exc).__name__, exc)
        return None


async def _send_message(account_id: int, conversation_id: int, content: str) -> None:
    await _chatwoot_request(
        "POST",
        f"/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages",
        json={"content": content, "message_type": "outgoing", "private": False},
    )


async def _assign_team(account_id: int, conversation_id: int, team_id: int) -> None:
    await _chatwoot_request(
        "POST",
        f"/api/v1/accounts/{account_id}/conversations/{conversation_id}/assignments",
        json={"team_id": team_id},
    )


async def _add_labels(account_id: int, conversation_id: int, labels: list[str]) -> None:
    await _chatwoot_request(
        "POST",
        f"/api/v1/accounts/{account_id}/conversations/{conversation_id}/labels",
        json={"labels": labels},
    )


async def _set_status_open(account_id: int, conversation_id: int) -> None:
    await _chatwoot_request(
        "POST",
        f"/api/v1/accounts/{account_id}/conversations/{conversation_id}/toggle_status",
        json={"status": "open"},
    )


# ---------------------------------------------------------------------------
# Xử lý sự kiện
# ---------------------------------------------------------------------------

def _should_process(payload: ChatwootWebhookPayload) -> bool:
    """Chỉ xử lý tin nhắn mới từ khách (incoming), bỏ qua reply của agent/bot."""
    if payload.event != "message_created":
        return False
    if payload.message_type != "incoming":
        return False
    if payload.private:
        return False
    if not (payload.content and payload.content.strip()):
        return False
    if payload.conversation is None:
        return False
    return True


async def _process_event(payload: ChatwootWebhookPayload) -> None:
    """Xử lý đầy đủ một message_created. Bọc try/except để luôn an toàn."""
    try:
        conversation = payload.conversation
        assert conversation is not None  # đã kiểm trong _should_process
        conversation_id = conversation.id
        account_id = (payload.account.id if payload.account else None) or settings.chatwoot_account_id
        content = (payload.content or "").strip()

        lead = _get_or_create_lead(payload.sender)
        history = _append_history(conversation_id, "user", content)

        context = _retrieve_context(content)
        reply = await _generate_reply(history, context)

        _append_history(conversation_id, "assistant", reply)
        await _send_message(account_id, conversation_id, reply)

        # Handoff: ý định mua mạnh → chuyển team BĐS + gắn nhãn hot-lead.
        if _detect_handoff(content):
            log.info("[chatwoot] phát hiện handoff intent ở conversation %s", conversation_id)
            if lead is not None:
                lead.status = "hot"
                lead.intent_score = max(lead.intent_score, settings.lead_hot_score_threshold)
            await _add_labels(account_id, conversation_id, [settings.chatwoot_hot_lead_label])
            await _set_status_open(account_id, conversation_id)
            if settings.chatwoot_bds_team_id:
                await _assign_team(account_id, conversation_id, settings.chatwoot_bds_team_id)
            else:
                log.warning("[chatwoot] CHATWOOT_BDS_TEAM_ID chưa cấu hình — bỏ qua assign team")
    except Exception as exc:  # noqa: BLE001 — nuốt mọi lỗi, đã trả 200 cho Chatwoot
        log.exception("[chatwoot] lỗi xử lý event: %s: %s", type(exc).__name__, exc)


@router.post("/chatwoot")
async def chatwoot_webhook(
    payload: ChatwootWebhookPayload, background: BackgroundTasks
) -> dict:
    """Endpoint Chatwoot Agent Bot gọi vào. Luôn trả 200 OK ngay lập tức."""
    if not _should_process(payload):
        return {"status": "ignored"}
    # Xử lý nặng ở background để Chatwoot không phải chờ → không timeout/retry.
    background.add_task(_process_event, payload)
    return {"status": "accepted"}
