"""Dify client — "bộ não tri thức" RAG thay thế Open Notebook.

Bọc API Dify (self-host) qua httpx. Đọc cấu hình từ `settings` (KHÔNG hardcode
secret). Mọi đường dẫn lấy từ `settings.dify_api_url`; key lấy từ
`settings.dify_api_key` (chatbot) và `settings.dify_dataset_api_key` (knowledge
base). Khi thiếu env → raise `DifyNotConfigured` với thông báo rõ ràng để lớp gọi
fallback an toàn (chatbot vẫn trả lời không cần RAG, KHÔNG crash).

Cung cấp cả bản SYNC (cho code chặn như OpenClaw bridge) và ASYNC (cho chatbot
FastAPI async). Endpoint chính:
  - Chat:      POST {DIFY_API_URL}/v1/chat-messages          (Bearer dify_api_key)
  - Retrieve:  POST {DIFY_API_URL}/v1/datasets/{id}/retrieve (Bearer dataset key)
  - Add doc:   POST {DIFY_API_URL}/v1/datasets/{id}/document/create-by-text
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.settings import settings

log = logging.getLogger("dify.client")

# Timeout mặc định — blocking chat của Dify có thể lâu (LLM sinh chữ).
_CHAT_TIMEOUT = 60.0
_DATASET_TIMEOUT = 30.0


class DifyNotConfigured(RuntimeError):
    """Ném ra khi gọi Dify nhưng thiếu DIFY_API_URL / DIFY_API_KEY."""


class DifyError(RuntimeError):
    """Lỗi từ phía Dify (HTTP 4xx/5xx, mạng...)."""


# ---------------------------------------------------------------------------
# Helpers cấu hình — đọc từ settings, không hardcode.
# ---------------------------------------------------------------------------
def is_configured() -> bool:
    return settings.dify_configured()


def is_dataset_configured() -> bool:
    return settings.dify_dataset_configured()


def _base_url() -> str:
    url = (settings.dify_api_url or "").strip().rstrip("/")
    if not url:
        raise DifyNotConfigured(
            "Dify chưa cấu hình: thiếu DIFY_API_URL (đặt env trỏ tới Dify self-host)."
        )
    # Cho phép người dùng lỡ kèm /v1 — chuẩn hoá về gốc.
    if url.endswith("/v1"):
        url = url[: -len("/v1")]
    return url


def _chat_headers() -> Dict[str, str]:
    key = (settings.dify_api_key or "").strip()
    if not key:
        raise DifyNotConfigured(
            "Dify chưa cấu hình: thiếu DIFY_API_KEY (App API key của chatbot Dify)."
        )
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _dataset_headers() -> Dict[str, str]:
    key = (settings.dify_dataset_api_key or "").strip()
    if not key:
        raise DifyNotConfigured(
            "Dify Knowledge Base chưa cấu hình: thiếu DIFY_DATASET_API_KEY."
        )
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _chat_payload(
    query: str,
    user: str,
    inputs: Optional[Dict[str, Any]],
    conversation_id: Optional[str],
) -> Dict[str, Any]:
    return {
        "inputs": inputs or {},
        "query": query,
        "response_mode": "blocking",  # bản này chỉ hỗ trợ blocking (không stream)
        "user": user or "elc-agent-engine",
        "conversation_id": conversation_id or "",
    }


def _parse_chat_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Chuẩn hoá phản hồi chat-messages về {answer, conversation_id, message_id, raw}."""
    return {
        "answer": data.get("answer", "") or "",
        "conversation_id": data.get("conversation_id", "") or "",
        "message_id": data.get("message_id") or data.get("id") or "",
        "raw": data,
    }


# ---------------------------------------------------------------------------
# CHAT — sync + async. Trả dict đã chuẩn hoá.
# ---------------------------------------------------------------------------
async def chat_async(
    query: str,
    *,
    user: str = "elc-agent-engine",
    inputs: Optional[Dict[str, Any]] = None,
    conversation_id: Optional[str] = None,
    timeout: float = _CHAT_TIMEOUT,
) -> Dict[str, Any]:
    """Gọi Dify chat-messages (blocking) bất đồng bộ. Dùng cho chatbot FastAPI."""
    base = _base_url()
    headers = _chat_headers()
    payload = _chat_payload(query, user, inputs, conversation_id)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{base}/v1/chat-messages", headers=headers, json=payload
            )
    except httpx.HTTPError as exc:
        raise DifyError(f"Không kết nối được Dify: {exc}") from exc
    if resp.status_code >= 400:
        raise DifyError(f"Dify trả lỗi {resp.status_code}: {resp.text[:500]}")
    return _parse_chat_response(resp.json())


def chat(
    query: str,
    *,
    user: str = "elc-agent-engine",
    inputs: Optional[Dict[str, Any]] = None,
    conversation_id: Optional[str] = None,
    timeout: float = _CHAT_TIMEOUT,
) -> Dict[str, Any]:
    """Bản đồng bộ của chat_async — dùng cho code chặn (OpenClaw bridge)."""
    base = _base_url()
    headers = _chat_headers()
    payload = _chat_payload(query, user, inputs, conversation_id)
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                f"{base}/v1/chat-messages", headers=headers, json=payload
            )
    except httpx.HTTPError as exc:
        raise DifyError(f"Không kết nối được Dify: {exc}") from exc
    if resp.status_code >= 400:
        raise DifyError(f"Dify trả lỗi {resp.status_code}: {resp.text[:500]}")
    return _parse_chat_response(resp.json())


# ---------------------------------------------------------------------------
# KNOWLEDGE RETRIEVAL — truy hồi đoạn tài liệu từ 1 dataset.
# ---------------------------------------------------------------------------
def _retrieve_payload(query: str, top_k: int) -> Dict[str, Any]:
    return {
        "query": query,
        "retrieval_model": {
            "search_method": "semantic_search",
            "reranking_enable": False,
            "top_k": top_k,
            "score_threshold_enabled": False,
        },
    }


def _resolve_dataset_id(dataset_id: Optional[str]) -> str:
    did = (dataset_id or settings.dify_dataset_id or "").strip()
    if not did:
        raise DifyNotConfigured(
            "Thiếu dataset_id: truyền vào hoặc đặt env DIFY_DATASET_ID."
        )
    return did


async def retrieve_async(
    query: str,
    *,
    dataset_id: Optional[str] = None,
    top_k: int = 5,
    timeout: float = _DATASET_TIMEOUT,
) -> List[Dict[str, Any]]:
    """Truy hồi top-k đoạn (records) từ Knowledge Base Dify — async."""
    base = _base_url()
    headers = _dataset_headers()
    did = _resolve_dataset_id(dataset_id)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{base}/v1/datasets/{did}/retrieve",
                headers=headers,
                json=_retrieve_payload(query, top_k),
            )
    except httpx.HTTPError as exc:
        raise DifyError(f"Không kết nối được Dify dataset: {exc}") from exc
    if resp.status_code >= 400:
        raise DifyError(f"Dify dataset lỗi {resp.status_code}: {resp.text[:500]}")
    return resp.json().get("records", []) or []


def retrieve(
    query: str,
    *,
    dataset_id: Optional[str] = None,
    top_k: int = 5,
    timeout: float = _DATASET_TIMEOUT,
) -> List[Dict[str, Any]]:
    """Bản đồng bộ của retrieve_async — dùng cho OpenClaw bridge."""
    base = _base_url()
    headers = _dataset_headers()
    did = _resolve_dataset_id(dataset_id)
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                f"{base}/v1/datasets/{did}/retrieve",
                headers=headers,
                json=_retrieve_payload(query, top_k),
            )
    except httpx.HTTPError as exc:
        raise DifyError(f"Không kết nối được Dify dataset: {exc}") from exc
    if resp.status_code >= 400:
        raise DifyError(f"Dify dataset lỗi {resp.status_code}: {resp.text[:500]}")
    return resp.json().get("records", []) or []


def format_records_for_llm(records: List[Dict[str, Any]], max_chars: int = 6000) -> str:
    """Gói records truy hồi thành text nhét vào system prompt (giống retrieval BM25)."""
    if not records:
        return ""
    lines = ["Trích từ Knowledge Base Dify (top match):"]
    used = 0
    for i, rec in enumerate(records, 1):
        seg = rec.get("segment") or {}
        content = (seg.get("content") or rec.get("content") or "").strip()
        doc = (seg.get("document") or {}).get("name", "") if isinstance(seg.get("document"), dict) else ""
        score = rec.get("score")
        head = f"\n--- [{i}]"
        if doc:
            head += f" Nguồn: {doc}"
        if isinstance(score, (int, float)):
            head += f" (score={score:.2f})"
        block = f"{head}\n{content}\n"
        if used + len(block) > max_chars:
            break
        lines.append(block)
        used += len(block)
    return "".join(lines)


# ---------------------------------------------------------------------------
# ĐẨY TÀI LIỆU vào Knowledge Base (dùng cho n8n/admin nếu cần — tuỳ chọn).
# ---------------------------------------------------------------------------
def create_document_by_text(
    title: str,
    text: str,
    *,
    dataset_id: Optional[str] = None,
    indexing_technique: str = "high_quality",
    timeout: float = _DATASET_TIMEOUT,
) -> Dict[str, Any]:
    """Thêm 1 tài liệu dạng text vào dataset (đồng bộ). KB key cần quyền ghi."""
    base = _base_url()
    headers = _dataset_headers()
    did = _resolve_dataset_id(dataset_id)
    payload = {
        "name": title,
        "text": text,
        "indexing_technique": indexing_technique,
        "process_rule": {"mode": "automatic"},
    }
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                f"{base}/v1/datasets/{did}/document/create-by-text",
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise DifyError(f"Không kết nối được Dify dataset: {exc}") from exc
    if resp.status_code >= 400:
        raise DifyError(f"Dify dataset lỗi {resp.status_code}: {resp.text[:500]}")
    return resp.json()
