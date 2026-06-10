"""Sale Learning Center — thư viện tài liệu chính thống + RAG hỏi đáp + phiếu báo giá.

Phân quyền (JWT 3-role có sẵn):
- Upload / xoá tài liệu  → admin.
- List / search / ask / quote / download → admin + sale (KHÔNG cho client).

RAG dùng BM25 offline trên tài liệu admin upload (core/learning_store.py), không
phụ thuộc API key. Phần soạn câu trả lời /ask: mock khi USE_MOCK_LLM hoặc thiếu
ANTHROPIC_API_KEY; ngược lại gọi Claude (stream).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse

from app.api.deps import get_current_user, require_admin
from app.core import learning_store, sales_policy_store
from app.core.settings import settings
from app.services import pricing_policy
from app.schemas.sales_policy import (
    PolicyQuoteRequest,
    PolicyQuoteResponse,
    SalesPolicyConfig,
)
from app.schemas.learning import (
    CATEGORIES,
    AskRequest,
    AskResponse,
    AskSource,
    LearningDocument,
    QuoteRequest,
    QuoteResponse,
    SearchPassage,
    SearchRequest,
    SearchResponse,
    UploadResponse,
)
from app.services import quote_pdf

log = logging.getLogger(__name__)

router = APIRouter(prefix="/learning", tags=["learning"])

# Giới hạn dung lượng 1 file upload (25MB) — chặn payload bất thường.
_MAX_UPLOAD = 25 * 1024 * 1024

SYSTEM_PROMPT_ASK = (
    "Bạn là AI tư vấn nội bộ của Eurowindow Light City (ELC), hỗ trợ đội ngũ "
    "Sale. Trả lời NGẮN GỌN, chính xác, CHỈ dựa trên TÀI LIỆU CHÍNH THỐNG đã "
    "được cung cấp trong ngữ cảnh bên dưới. Luôn trích dẫn nguồn theo dạng "
    "[số] tương ứng đoạn tài liệu. Nếu ngữ cảnh không đủ thông tin, nói rõ "
    '"Tài liệu hiện có chưa đề cập nội dung này" và gợi ý sale xác minh lại — '
    "TUYỆT ĐỐI không bịa số liệu, chính sách hay pháp lý."
)


def require_sale_or_admin(user: dict = Depends(get_current_user)) -> dict:
    """Cho phép admin + sale; chặn client và vai trò khác."""
    if user.get("role") not in ("admin", "sale"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Sale và Quản trị viên được truy cập Kho học tập",
        )
    return user


def _to_document_model(doc: dict) -> LearningDocument:
    indexed_at = doc.get("indexed_at")
    if isinstance(indexed_at, str):
        try:
            indexed_at = datetime.fromisoformat(indexed_at.replace("Z", ""))
        except ValueError:
            indexed_at = None
    return LearningDocument(
        id=doc["id"],
        title=doc["title"],
        category=doc["category"],
        type=doc.get("type", ""),
        size=doc.get("size", 0),
        file_path=doc.get("file_path", ""),
        version=doc.get("version", 1),
        chunks=doc.get("chunks", 0),
        indexed=doc.get("indexed", False),
        uploaded_by=doc.get("uploaded_by"),
        indexed_at=indexed_at,
        download_url=f"/learning/documents/{doc['id']}/download",
        group=doc.get("group"),
        source=doc.get("source", "upload"),
        project_slug=doc.get("project_slug"),
    )


# ============================================================
# Tài liệu
# ============================================================

@router.post("/documents", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    category: str = Form("policy"),
    admin: dict = Depends(require_admin),
) -> UploadResponse:
    if category not in CATEGORIES:
        raise HTTPException(400, f"Nhóm không hợp lệ. Cho phép: {', '.join(CATEGORIES)}")
    content = await file.read()
    if not content:
        raise HTTPException(400, "File rỗng")
    if len(content) > _MAX_UPLOAD:
        raise HTTPException(413, "File vượt quá 25MB")
    try:
        doc = learning_store.add_document(
            content=content,
            original_name=file.filename or "tai-lieu",
            title=title,
            category=category,
            uploaded_by=admin.get("email"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    log.info(
        "learning.upload email=%s doc=%s cat=%s size=%d chunks=%d",
        admin.get("email"), doc["id"], category, doc["size"], doc.get("chunks", 0),
    )
    return UploadResponse(
        document_id=doc["id"],
        title=doc["title"],
        type=doc["type"],
        size=doc["size"],
        category=doc["category"],
        chunks=doc.get("chunks", 0),
        indexed_at=_to_document_model(doc).indexed_at,
    )


@router.get("/documents", response_model=list[LearningDocument])
def list_documents(
    category: Optional[str] = None,
    group: Optional[str] = None,
    project_slug: Optional[str] = None,
    _user: dict = Depends(require_sale_or_admin),
) -> list[LearningDocument]:
    if category and category not in CATEGORIES:
        raise HTTPException(400, "Nhóm không hợp lệ")
    docs = learning_store.list_documents(
        category=category, group=group, project_slug=project_slug
    )
    return [_to_document_model(d) for d in docs]


@router.get("/documents/{doc_id}", response_model=LearningDocument)
def get_document(
    doc_id: str,
    _user: dict = Depends(require_sale_or_admin),
) -> LearningDocument:
    doc = learning_store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    return _to_document_model(doc)


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    ok = learning_store.delete_document(doc_id)
    if not ok:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    log.info("learning.delete email=%s doc=%s", admin.get("email"), doc_id)
    return {"ok": True, "deleted": doc_id}


# Map đuôi file → (media_type, xem-inline-được). Quyết định Content-Type + Disposition.
_FILE_MEDIA: dict[str, tuple[str, bool]] = {
    "pdf": ("application/pdf", True),
    "png": ("image/png", True),
    "jpg": ("image/jpeg", True),
    "jpeg": ("image/jpeg", True),
    "gif": ("image/gif", True),
    "webp": ("image/webp", True),
    "svg": ("image/svg+xml", True),
    "txt": ("text/plain; charset=utf-8", True),
    "md": ("text/markdown; charset=utf-8", True),
    "csv": ("text/csv; charset=utf-8", False),
    "xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", False),
    "xls": ("application/vnd.ms-excel", False),
    "docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", False),
    "doc": ("application/msword", False),
    "pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        False),
}


def _media_for(ext: str) -> tuple[str, bool]:
    """Trả (media_type, inline?) theo đuôi file. Mặc định octet-stream + attachment."""
    e = (ext or "").lower().lstrip(".")
    if e in _FILE_MEDIA:
        return _FILE_MEDIA[e]
    import mimetypes

    guess, _ = mimetypes.guess_type(f"x.{e}")
    return (guess or "application/octet-stream", False)


@router.get("/documents/{doc_id}/download")
def download_document(
    doc_id: str,
    _user: dict = Depends(require_sale_or_admin),
) -> FileResponse:
    from urllib.parse import quote

    doc = learning_store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    path = learning_store.file_abspath(doc)
    if not path.exists():
        raise HTTPException(404, "File không tồn tại trên máy chủ")
    filename = doc.get("original_name") or f"{doc['title']}.{doc.get('type', 'bin')}"
    media_type, inline = _media_for(doc.get("type") or filename.rsplit(".", 1)[-1])
    disposition = "inline" if inline else "attachment"
    # filename* (RFC 5987) để hỗ trợ tên có dấu tiếng Việt.
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}"
    }
    return FileResponse(path, media_type=media_type, headers=headers)


# ============================================================
# Tìm kiếm RAG
# ============================================================

@router.post("/search", response_model=SearchResponse)
def search(
    req: SearchRequest,
    _user: dict = Depends(require_sale_or_admin),
) -> SearchResponse:
    hits = learning_store.search(req.query, top_k=req.top_k, category=req.category)
    passages = [
        SearchPassage(
            document_id=h.document_id,
            title=h.title,
            category=h.category,
            source_file=h.source_file,
            chunk_index=h.chunk_index,
            score=round(h.score, 4),
            text=h.text,
        )
        for h in hits
    ]
    return SearchResponse(query=req.query, passages=passages)


# ============================================================
# Hỏi AI (RAG + Claude, streaming NDJSON)
# ============================================================

def _build_context(hits: list) -> tuple[str, list[AskSource]]:
    """Gói các đoạn retrieved thành ngữ cảnh cho LLM + danh sách nguồn."""
    lines = []
    sources: list[AskSource] = []
    seen_docs: set[str] = set()
    for i, h in enumerate(hits, 1):
        snippet = h.text.replace("\n", " ").strip()
        lines.append(f"[{i}] (Nguồn: {h.title}) {snippet[:700]}")
        if h.document_id not in seen_docs:
            seen_docs.add(h.document_id)
            sources.append(
                AskSource(
                    document_id=h.document_id,
                    title=h.title,
                    category=h.category,
                    source_file=h.source_file,
                    score=round(h.score, 4),
                    snippet=snippet[:280],
                )
            )
    return "\n".join(lines), sources


def _mock_answer(question: str, hits: list) -> str:
    if not hits:
        return (
            "Tài liệu hiện có chưa đề cập nội dung này. Anh/chị vui lòng kiểm tra "
            "lại từ khoá hoặc liên hệ phòng kinh doanh để bổ sung tài liệu chính thống."
        )
    cites = " ".join(f"[{i}]" for i in range(1, min(len(hits), 3) + 1))
    top = hits[0].text.replace("\n", " ").strip()
    return (
        f'Theo tài liệu chính thống {cites}: {top[:360]}…\n\n'
        "(Chế độ MOCK — chưa cấu hình ANTHROPIC_API_KEY nên trả trực tiếp trích "
        "đoạn tài liệu thay vì diễn giải. Nguồn xem ở phần Tài liệu tham chiếu.)"
    )


async def _stream_ask(req: AskRequest, hits: list):
    """Generator NDJSON: 1 dòng sources, nhiều dòng delta, 1 dòng done."""
    context, sources = _build_context(hits)
    yield json.dumps(
        {"type": "sources", "session_id": req.session_id,
         "sources": [s.model_dump() for s in sources]},
        ensure_ascii=False,
    ) + "\n"

    use_mock = settings.use_mock_llm or not settings.anthropic_api_key
    if use_mock or not context:
        answer = _mock_answer(req.question, hits)
        # Phát từng cụm từ để mô phỏng streaming.
        for token in answer.split(" "):
            yield json.dumps({"type": "delta", "text": token + " "}, ensure_ascii=False) + "\n"
        yield json.dumps({"type": "done"}, ensure_ascii=False) + "\n"
        return

    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        system = SYSTEM_PROMPT_ASK + "\n\nTÀI LIỆU CHÍNH THỐNG:\n" + context
        async with client.messages.stream(
            model=settings.llm_model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": req.question}],
        ) as stream:
            async for text in stream.text_stream:
                yield json.dumps({"type": "delta", "text": text}, ensure_ascii=False) + "\n"
        yield json.dumps({"type": "done"}, ensure_ascii=False) + "\n"
    except Exception as e:  # noqa: BLE001
        log.error("learning.ask LLM error: %s", e)
        yield json.dumps(
            {"type": "delta", "text": "\n\n[Lỗi kết nối AI — vui lòng thử lại sau.]"},
            ensure_ascii=False,
        ) + "\n"
        yield json.dumps({"type": "done"}, ensure_ascii=False) + "\n"


@router.post("/ask")
async def ask(
    req: AskRequest,
    _user: dict = Depends(require_sale_or_admin),
) -> StreamingResponse:
    hits = learning_store.search(req.question, top_k=req.top_k)
    return StreamingResponse(
        _stream_ask(req, hits),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/ask/sync", response_model=AskResponse)
async def ask_sync(
    req: AskRequest,
    _user: dict = Depends(require_sale_or_admin),
) -> AskResponse:
    """Phiên bản không streaming — tiện cho test / client không hỗ trợ stream."""
    hits = learning_store.search(req.question, top_k=req.top_k)
    _, sources = _build_context(hits)
    answer = _mock_answer(req.question, hits)
    if not (settings.use_mock_llm or not settings.anthropic_api_key) and hits:
        try:
            from anthropic import AsyncAnthropic

            context, _ = _build_context(hits)
            client = AsyncAnthropic(api_key=settings.anthropic_api_key)
            resp = await client.messages.create(
                model=settings.llm_model,
                max_tokens=1024,
                system=SYSTEM_PROMPT_ASK + "\n\nTÀI LIỆU CHÍNH THỐNG:\n" + context,
                messages=[{"role": "user", "content": req.question}],
            )
            answer = resp.content[0].text
        except Exception as e:  # noqa: BLE001
            log.error("learning.ask_sync LLM error: %s", e)
    return AskResponse(session_id=req.session_id, answer=answer, sources=sources)


# ============================================================
# Phiếu báo giá
# ============================================================

@router.post("/quote", response_model=QuoteResponse)
def create_quote(
    req: QuoteRequest,
    user: dict = Depends(require_sale_or_admin),
) -> QuoteResponse:
    from app.api import inventory as inventory_module

    unit = inventory_module.get_unit(req.unit_id)
    if not unit:
        raise HTTPException(404, f"Không tìm thấy căn '{req.unit_id}' trong quỹ hàng")

    list_price = quote_pdf.list_price_vnd(unit)
    discount_amount, total_price, milestones = quote_pdf.compute_quote(
        list_price, req.discount_pct, req.payment_plan
    )
    quote_id = str(uuid.uuid4())
    computed = {
        "list_price": list_price,
        "discount_amount": discount_amount,
        "total_price": total_price,
        "milestones": milestones,
    }
    # Mặc định lấy tên sale từ tài khoản nếu form bỏ trống.
    if not req.sale_name:
        req.sale_name = user.get("full_name", "")
    if not req.sale_phone:
        req.sale_phone = user.get("phone") or ""

    pdf_bytes = quote_pdf.build_quote_pdf(
        quote_id=quote_id, unit=unit, req=req, computed=computed
    )
    created_at = datetime.utcnow()
    record = {
        "quote_id": quote_id,
        "unit_id": req.unit_id,
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "sale_name": req.sale_name,
        "sale_phone": req.sale_phone,
        "created_by": user.get("email"),
        "list_price": list_price,
        "discount_pct": req.discount_pct,
        "discount_amount": discount_amount,
        "total_price": total_price,
        "payment_plan": req.payment_plan,
        "created_at": created_at.isoformat() + "Z",
    }
    learning_store.save_quote(record, pdf_bytes)
    log.info(
        "learning.quote email=%s quote=%s unit=%s total=%.0f",
        user.get("email"), quote_id, req.unit_id, total_price,
    )
    return QuoteResponse(
        quote_id=quote_id,
        unit_id=req.unit_id,
        customer_name=req.customer_name,
        sale_name=req.sale_name,
        list_price=list_price,
        discount_pct=req.discount_pct,
        discount_amount=discount_amount,
        total_price=total_price,
        payment_plan=req.payment_plan,
        milestones=milestones,
        pdf_url=f"/learning/quotes/{quote_id}/download",
        created_at=created_at,
    )


@router.get("/quotes/{quote_id}/download")
def download_quote(
    quote_id: str,
    _user: dict = Depends(require_sale_or_admin),
) -> FileResponse:
    path = learning_store.quote_abspath(quote_id)
    if not path.exists():
        raise HTTPException(404, "Không tìm thấy phiếu báo giá")
    return FileResponse(
        path, media_type="application/pdf", filename=f"phieu-bao-gia-{quote_id[:8]}.pdf"
    )


# ============================================================
# Phiếu TÍNH GIÁ theo Chính sách bán hàng (policy quote)
# ============================================================

@router.get("/sales-policy", response_model=SalesPolicyConfig)
def get_sales_policy() -> SalesPolicyConfig:
    """Chính sách bán hàng hiện hành — PUBLIC (chỉ đọc cấu hình % để dựng form).

    Để PUBLIC (không require auth) nhằm tránh trình duyệt phải preflight header
    Authorization → giảm rủi ro 'Failed to fetch'. Không chứa dữ liệu nhạy cảm
    (chỉ % chiết khấu + nhãn phương án). Chỉnh sửa vẫn qua PUT /admin/sales-policy
    (yêu cầu quyền admin).
    """
    return sales_policy_store.get_current()


@router.post("/policy-quote", response_model=PolicyQuoteResponse)
def create_policy_quote(
    req: PolicyQuoteRequest,
    user: dict = Depends(require_sale_or_admin),
) -> PolicyQuoteResponse:
    from app.api import inventory as inventory_module

    unit = inventory_module.get_unit(req.unit_id)
    if not unit:
        raise HTTPException(404, f"Không tìm thấy căn '{req.unit_id}' trong quỹ hàng")

    prices = pricing_policy.get_unit_prices(unit)
    if prices is None:
        raise HTTPException(
            400,
            "Căn chưa có dữ liệu giá chi tiết (niêm yết gồm VAT/KPBT, VAT, KPBT) — "
            "vui lòng cập nhật bảng hàng hoặc nhập trong trang Quỹ căn.",
        )

    try:
        dien_tich = float(unit.get("dien_tich") or 0)
    except (TypeError, ValueError):
        dien_tich = 0.0
    if dien_tich <= 0:
        raise HTTPException(
            400,
            f"Căn '{req.unit_id}' chưa có diện tích hợp lệ để tính đơn giá — "
            "vui lòng cập nhật bảng hàng.",
        )

    config = sales_policy_store.get_current()
    try:
        computed = pricing_policy.compute_policy_quote(
            prices=prices,
            dien_tich=dien_tich,
            base_key=req.base_plan,
            addon_keys=req.addons,
            gift_cash=req.gift_cash,
            config=config,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001 — lỗi tính toán bất ngờ → báo rõ, không 500 trần
        log.exception("policy_quote compute error unit=%s", req.unit_id)
        raise HTTPException(500, f"Lỗi tính giá: {type(e).__name__}: {e}")

    if not req.sale_name:
        req.sale_name = user.get("full_name", "")
    if not req.sale_phone:
        req.sale_phone = user.get("phone") or ""

    quote_id = str(uuid.uuid4())
    try:
        pdf_bytes = quote_pdf.build_policy_quote_pdf(
            quote_id=quote_id, unit=unit, req=req, computed=computed
        )
    except Exception as e:  # noqa: BLE001 — lỗi render PDF → báo rõ
        log.exception("policy_quote pdf error unit=%s", req.unit_id)
        raise HTTPException(500, f"Lỗi tạo PDF phiếu: {type(e).__name__}: {e}")
    created_at = datetime.utcnow()
    record = {
        "quote_id": quote_id,
        "kind": "policy",
        "unit_id": req.unit_id,
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "sale_name": req.sale_name,
        "sale_phone": req.sale_phone,
        "created_by": user.get("email"),
        "base_plan": req.base_plan,
        "addons": req.addons,
        "gift_cash": req.gift_cash,
        "gtsp_final": computed["gtsp_final"],
        "policy_version": config.version,
        "created_at": created_at.isoformat() + "Z",
    }
    learning_store.save_quote(record, pdf_bytes)
    log.info(
        "learning.policy_quote email=%s quote=%s unit=%s plan=%s total=%.0f",
        user.get("email"), quote_id, req.unit_id, req.base_plan,
        computed["gtsp_final"],
    )
    return PolicyQuoteResponse(
        quote_id=quote_id,
        unit_id=req.unit_id,
        customer_name=req.customer_name,
        sale_name=req.sale_name,
        pdf_url=f"/learning/policy-quotes/{quote_id}/download",
        created_at=created_at,
        **computed,
    )


@router.get("/policy-quotes/{quote_id}/download")
def download_policy_quote(
    quote_id: str,
    _user: dict = Depends(require_sale_or_admin),
) -> FileResponse:
    path = learning_store.quote_abspath(quote_id)
    if not path.exists():
        raise HTTPException(404, "Không tìm thấy phiếu tính giá")
    return FileResponse(
        path, media_type="application/pdf", filename=f"phieu-tinh-gia-{quote_id[:8]}.pdf"
    )
