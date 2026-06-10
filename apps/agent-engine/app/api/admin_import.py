"""API Import khách CRM đa nguồn (admin) — Google Trang tính + file CSV/XLSX.

Luồng 2 bước:
  • PARSE: đọc nguồn → trả headers + rows + gợi ý mapping (admin xem trước).
  • COMMIT: admin chỉnh mapping → tạo lead (dedupe + source + auto-assign +
    đánh dấu auto-care để Phần B chấm điểm AI).

Tái dùng:
  - sheets_import (đọc Google Sheet qua refresh token Workspace đã Connect).
  - customer_import (parse file + auto-detect cột + chuẩn hoá dòng).
  - lead_store.import_customers (dedupe + tạo + auto-assign).

Mount prefix /admin/import. Chỉ admin (require_admin).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import require_admin
from app.core import customer_import, lead_store, sheets_import, workspace_token_store
from app.schemas.customer_import import (
    ColumnMapping,
    ImportCommitRequest,
    ImportResult,
    ParsePreview,
    SheetParseRequest,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/import", tags=["crm-import"])

# Giới hạn số dòng trả về preview (FE không cần xem hết để map cột).
_PREVIEW_ROWS = 200
_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


@router.get("/workspace-status")
def import_workspace_status(_admin: dict = Depends(require_admin)) -> dict:
    """Cho FE biết đã Connect Google Workspace chưa + có scope Sheets chưa.

    `sheets_ready` = đã kết nối và scope chứa spreadsheets (để nút import Sheet
    bật/tắt + hiện hướng dẫn connect lại nếu thiếu scope).
    """
    status = workspace_token_store.get_status()
    scopes = status.get("scopes") or []
    status["sheets_ready"] = bool(
        status.get("connected")
        and any("spreadsheets" in s for s in scopes)
    )
    return status


@router.post("/google-sheet/parse", response_model=ParsePreview)
async def parse_google_sheet(
    payload: SheetParseRequest, _admin: dict = Depends(require_admin)
) -> ParsePreview:
    """Đọc Google Trang tính → headers + rows + gợi ý mapping."""
    sid = sheets_import.extract_spreadsheet_id(payload.sheet_url)
    if not sid:
        raise HTTPException(
            status_code=400,
            detail="Link Google Trang tính không hợp lệ. Dán link dạng "
            "https://docs.google.com/spreadsheets/d/<ID>/edit",
        )
    try:
        tabs = await sheets_import.list_sheet_tabs(sid)
        table = await sheets_import.read_sheet_values(sid, payload.sheet_name)
    except sheets_import.SheetsNotConfiguredError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except sheets_import.SheetsScopeError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Lỗi đọc Google Trang tính: {e}")

    headers, records = customer_import.table_to_records(table)
    if not headers:
        raise HTTPException(status_code=400, detail="Trang tính rỗng hoặc không có dữ liệu.")
    mapping = customer_import.suggest_mapping(headers)
    return ParsePreview(
        headers=headers,
        rows=records[:_PREVIEW_ROWS],
        total=len(records),
        suggested_mapping=ColumnMapping(**mapping),
        sheet_names=tabs or None,
        source_label="google_sheet",
    )


@router.post("/file/parse", response_model=ParsePreview)
async def parse_file_upload(
    file: UploadFile = File(...), _admin: dict = Depends(require_admin)
) -> ParsePreview:
    """Upload CSV/XLSX → headers + rows + gợi ý mapping."""
    content = await file.read()
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File quá lớn (giới hạn 10MB).")
    try:
        table = customer_import.parse_file(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Không đọc được file: {e}")

    headers, records = customer_import.table_to_records(table)
    if not headers:
        raise HTTPException(status_code=400, detail="File rỗng hoặc không có dữ liệu.")
    mapping = customer_import.suggest_mapping(headers)
    return ParsePreview(
        headers=headers,
        rows=records[:_PREVIEW_ROWS],
        total=len(records),
        suggested_mapping=ColumnMapping(**mapping),
        source_label="file_upload",
    )


@router.post("/commit", response_model=ImportResult)
async def commit_import(
    payload: ImportCommitRequest, admin: dict = Depends(require_admin)
) -> ImportResult:
    """Tạo lead từ rows + mapping. Dedupe + source + (tuỳ chọn) auto-assign +
    auto-care. Nếu auto_care và có API key → chấm điểm AI ngay (Phần B)."""
    if payload.mapping.phone is None and payload.mapping.email is None:
        raise HTTPException(
            status_code=400,
            detail="Cần map ít nhất 1 cột SĐT hoặc Email để chống trùng và liên hệ.",
        )
    leads = customer_import.records_to_leads(
        payload.rows, payload.mapping.model_dump()
    )
    result = lead_store.import_customers(
        leads,
        source=payload.source.value,
        imported_by_sale_id=admin["id"],
        assigned_sale_id=payload.assigned_sale_id,
        auto_assign=payload.auto_assign,
        skip_duplicates=payload.skip_duplicates,
        default_status=payload.default_status.value,
        auto_care=payload.auto_care,
    )

    ai_scored = 0
    if payload.auto_care and result.get("created_ids"):
        # Chấm điểm AI ngay sau import (Phần B). Import phần B mềm để Phần A chạy
        # độc lập nếu module AI chưa có / thiếu API key.
        try:
            from app.core import ai_crm  # type: ignore

            ai_scored = await ai_crm.rescore_leads(result["created_ids"])
        except Exception as e:  # noqa: BLE001
            log.info("Bỏ qua chấm điểm AI sau import (chưa sẵn sàng): %s", e)

    return ImportResult(**result, ai_scored=ai_scored)
