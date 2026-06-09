"""Đồng bộ tài liệu từ Google Drive vào Sale Learning Center + RAG BM25.

Luồng tổng quát (chạy nền):
  1. Tách folder_id từ link Drive.
  2. Lấy access token Workspace (tái dùng refresh token của google_meet).
  3. List toàn bộ file trong folder (đệ quy subfolder, phân trang).
  4. Tải từng file (Google Docs/Sheets/Slides → export PDF; còn lại tải nguyên).
  5. Bỏ qua file trùng nội dung (content hash) nếu skip_existing.
  6. Lưu vào learning_store (persist Volume Railway) — KHÔNG reindex từng file.
  7. Reindex BM25 1 lần ở cuối (nhanh hơn nhiều khi nhiều file).

Trạng thái job + lịch sử lưu JSON (atomic write) tại data/_runtime/drive_sync_jobs.json,
resolve theo $DATA_DIR (Volume) giống các store khác.

⚠️ Scope: refresh token Workspace ban đầu chỉ có `calendar.events`. Drive API cần
thêm `https://www.googleapis.com/auth/drive.readonly`. Nếu thiếu, Google trả 403 —
ta bắt và báo lỗi rõ ràng để admin cấp lại token (xem report/hướng dẫn).
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import httpx

from app.core import learning_store
from app.core.google_meet import (
    get_workspace_access_token,
    is_configured as workspace_is_configured,
)
from app.core.settings import settings
from app.schemas.drive_sync import (
    DriveSyncFileResult,
    DriveSyncJob,
    DriveSyncRequest,
    DriveSyncResult,
)

log = logging.getLogger(__name__)

DRIVE_FOLDER_PATTERN = re.compile(r"folders/([a-zA-Z0-9_-]+)")
DRIVE_LIST_API = "https://www.googleapis.com/drive/v3/files"
DRIVE_FILE_DOWNLOAD = "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
DRIVE_FILE_EXPORT = "https://www.googleapis.com/drive/v3/files/{file_id}/export"

# Google native → export sang định dạng learning_store đọc được.
_EXPORT_MAP = {
    "application/vnd.google-apps.document": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.drawing": ("application/pdf", ".pdf"),
}

_FOLDER_MIME = "application/vnd.google-apps.folder"
_MAX_DEPTH = 5
_HISTORY_KEEP = 20

_LOCK = threading.RLock()


# ============================================================
# Phân loại tài liệu theo tên file
# ============================================================

def classify_category(filename: str) -> str:
    """Tự gán nhóm tài liệu từ tên file (có bỏ dấu để khớp tiếng Việt)."""
    from app.core.extract import strip_accents

    name = strip_accents(filename.lower())
    rules = [
        (("ban_do", "ban do", "master_plan", "masterplan", "phan_khu",
          "phan khu", "tong_the", "tong the", "mat_bang", "mat bang"), "master_plan"),
        (("chinh_sach", "chinh sach", "policy", "quy_dinh", "quy dinh"), "policy"),
        (("bang_gia", "bang gia", "gia_", "price", "bao_gia", "bao gia"), "pricing"),
        (("hop_dong", "hop dong", "contract", "mau_hd", "mau hd"), "contract"),
        (("brochure", "flyer", "leaflet", "gioi_thieu", "gioi thieu"), "brochure"),
        (("can_", "can ", "unit_", "unit ", "thiet_ke", "thiet ke", "loai_can",
          "loai can"), "units"),
        (("phap_ly", "phap ly", "legal", "giay_phep", "giay phep", "phap_li"), "legal"),
        (("training", "dao_tao", "dao tao", "huong_dan", "huong dan", "kich_ban",
          "kich ban"), "training"),
        (("video", "review", "hinh_anh", "hinh anh", "anh_", "media", "photo"), "media"),
    ]
    for keywords, category in rules:
        if any(kw in name for kw in keywords):
            return category
    return "other"


# ============================================================
# Google Drive API
# ============================================================

def extract_folder_id(folder_url: str) -> Optional[str]:
    """Lấy folder_id từ link Drive; chấp nhận cả khi truyền thẳng id."""
    m = DRIVE_FOLDER_PATTERN.search(folder_url or "")
    if m:
        return m.group(1)
    cand = (folder_url or "").strip()
    if cand and "/" not in cand and " " not in cand:
        return cand
    return None


async def list_drive_folder(
    folder_id: str,
    oauth_token: str,
    recursive: bool = True,
    depth: int = 0,
) -> list[dict]:
    """List tất cả file trong folder (đệ quy, phân trang). Trả list metadata file."""
    files: list[dict] = []
    page_token: Optional[str] = None
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            params = {
                "q": f"'{folder_id}' in parents and trashed=false",
                "fields": "nextPageToken, files(id, name, mimeType, size, modifiedTime, parents)",
                "pageSize": 100,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(
                DRIVE_LIST_API,
                params=params,
                headers={"Authorization": f"Bearer {oauth_token}"},
            )
            resp.raise_for_status()
            data = resp.json()
            for f in data.get("files", []):
                if f.get("mimeType") == _FOLDER_MIME:
                    if recursive and depth < _MAX_DEPTH:
                        files.extend(
                            await list_drive_folder(
                                f["id"], oauth_token, True, depth + 1
                            )
                        )
                else:
                    files.append(f)
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return files


async def download_drive_file(
    file_id: str, mime_type: str, oauth_token: str
) -> tuple[bytes, str]:
    """Tải nội dung file. Google native → export. Trả (bytes, gợi-ý-đuôi-file)."""
    headers = {"Authorization": f"Bearer {oauth_token}"}
    suffix = ""
    if mime_type in _EXPORT_MAP:
        export_mime, suffix = _EXPORT_MAP[mime_type]
        url = DRIVE_FILE_EXPORT.format(file_id=file_id)
        params = {"mimeType": export_mime}
    else:
        url = DRIVE_FILE_DOWNLOAD.format(file_id=file_id)
        params = {"supportsAllDrives": "true"}
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        return resp.content, suffix


def _effective_name(name: str, suffix: str) -> str:
    """Đảm bảo tên file có đuôi hợp lệ (Google native export cần gắn .pdf/.xlsx)."""
    if suffix and not name.lower().endswith(suffix):
        return f"{name}{suffix}"
    return name


# ============================================================
# Job state store (JSON atomic, resolve theo DATA_DIR)
# ============================================================

def _jobs_path() -> Path:
    p = Path(settings.drive_sync_jobs_file)
    if p.is_absolute():
        return p
    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / p).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / p).resolve()
    return (Path.cwd() / p).resolve()


def _load_jobs() -> dict:
    path = _jobs_path()
    if not path.exists():
        return {"jobs": {}, "history": []}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:  # noqa: BLE001
        log.error("Hỏng drive_sync_jobs.json (%s) — khởi tạo lại rỗng", e)
        return {"jobs": {}, "history": []}
    data.setdefault("jobs", {})
    data.setdefault("history", [])
    return data


def _save_jobs(data: dict) -> None:
    path = _jobs_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    tmp.replace(path)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def create_job(job_id: str, folder_url: str) -> None:
    with _LOCK:
        data = _load_jobs()
        data["jobs"][job_id] = DriveSyncJob(
            job_id=job_id,
            status="queued",
            folder_url=folder_url,
            started_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        ).model_dump(mode="json")
        _save_jobs(data)


def update_job(job_id: str, **fields) -> None:
    with _LOCK:
        data = _load_jobs()
        job = data["jobs"].get(job_id)
        if not job:
            return
        job.update(fields)
        job["updated_at"] = _now_iso()
        # Tính % tiến độ thô từ processed/total.
        total = job.get("total_files") or 0
        if total:
            job["progress"] = min(100, round(job.get("processed", 0) * 100 / total))
        _save_jobs(data)


def get_job(job_id: str) -> Optional[dict]:
    with _LOCK:
        return _load_jobs()["jobs"].get(job_id)


def save_history(result: DriveSyncResult) -> None:
    with _LOCK:
        data = _load_jobs()
        data["history"].insert(0, result.model_dump(mode="json"))
        data["history"] = data["history"][:_HISTORY_KEEP]
        _save_jobs(data)


def list_history() -> list[dict]:
    with _LOCK:
        return _load_jobs()["history"]


# ============================================================
# Background runner
# ============================================================

async def run_sync_job(
    job_id: str,
    request: DriveSyncRequest,
    user_id: Optional[str],
    on_progress: Optional[Callable[[dict], None]] = None,
) -> DriveSyncResult:
    """Thực thi 1 job đồng bộ. Cập nhật job_state khi chạy; lưu lịch sử lúc xong."""
    start = datetime.utcnow()
    results: list[DriveSyncFileResult] = []

    def _fail(msg: str) -> DriveSyncResult:
        update_job(job_id, status="failed", error=msg)
        res = DriveSyncResult(
            success=False, synced_at=datetime.utcnow(), triggered_by_user_id=user_id,
            duration_seconds=(datetime.utcnow() - start).total_seconds(), error=msg,
        )
        save_history(res)
        return res

    folder_id = extract_folder_id(request.folder_url)
    if not folder_id:
        return _fail("Không tách được folder_id từ link Drive đã nhập.")

    # Drive sync tái dùng credential Workspace của Google Meet, nhưng thông báo
    # lỗi phải theo ngữ cảnh Drive (không nhắc "Google Meet" gây nhầm cho admin).
    if not workspace_is_configured():
        return _fail(
            "Chưa cấu hình Google Workspace (thiếu GOOGLE_WORKSPACE_REFRESH_TOKEN "
            "hoặc client id/secret) — không đồng bộ được tài liệu từ Google Drive."
        )

    try:
        update_job(job_id, status="listing")
        oauth_token = await get_workspace_access_token()
    except RuntimeError as e:
        return _fail(f"Không lấy được access token Google Workspace cho Drive: {e}")

    try:
        files = await list_drive_folder(folder_id, oauth_token, recursive=True)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            return _fail(
                "Google trả 403 khi đọc Drive. Refresh token Workspace hiện thiếu "
                "scope 'drive.readonly'. Hãy cấp lại token kèm scope này (xem hướng dẫn)."
            )
        return _fail(f"Lỗi list Drive {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:  # noqa: BLE001
        return _fail(f"Lỗi list Drive: {e}")

    update_job(job_id, status="downloading", total_files=len(files), processed=0)
    rag_chunks_before = sum(d.get("chunks", 0) for d in learning_store.list_documents())

    uploaded_ids: list[str] = []
    for i, f in enumerate(files):
        name = f.get("name", "(không tên)")
        try:
            content, suffix = await download_drive_file(
                f["id"], f.get("mimeType", ""), oauth_token
            )
            content_hash = learning_store._content_hash(content)  # noqa: SLF001
            if request.skip_existing and learning_store.exists_by_hash(content_hash):
                results.append(DriveSyncFileResult(
                    file_id=f["id"], name=name, category="-", status="skipped",
                    size_bytes=len(content),
                ))
            else:
                eff_name = _effective_name(name, suffix)
                category = classify_category(name)
                doc = learning_store.add_document(
                    content=content,
                    original_name=eff_name,
                    title=name,
                    category=category,
                    uploaded_by=user_id,
                    source="google_drive",
                    source_metadata={
                        "drive_file_id": f["id"],
                        "modified": f.get("modifiedTime"),
                        "mime_type": f.get("mimeType"),
                    },
                    content_hash=content_hash,
                    reindex=False,  # reindex 1 lần ở cuối
                )
                uploaded_ids.append(doc["id"])
                results.append(DriveSyncFileResult(
                    file_id=f["id"], name=name, category=category, status="uploaded",
                    size_bytes=len(content), document_id=doc["id"],
                ))
        except ValueError as e:
            # Định dạng không hỗ trợ (vd video .mp4) — báo lỗi nhẹ, tiếp tục.
            results.append(DriveSyncFileResult(
                file_id=f["id"], name=name, category="-", status="failed",
                error=str(e), size_bytes=0,
            ))
        except Exception as e:  # noqa: BLE001
            log.exception("Sync file lỗi %s", name)
            results.append(DriveSyncFileResult(
                file_id=f["id"], name=name, category="-", status="failed",
                error=str(e)[:300], size_bytes=0,
            ))
        update_job(
            job_id, processed=i + 1, current_file=name,
            uploaded=sum(1 for r in results if r.status == "uploaded"),
            skipped=sum(1 for r in results if r.status == "skipped"),
            failed=sum(1 for r in results if r.status == "failed"),
        )

    rag_chunks_added = 0
    if request.reindex_rag and uploaded_ids:
        update_job(job_id, status="indexing")
        try:
            learning_store.reindex_all()
        except Exception as e:  # noqa: BLE001
            log.exception("Reindex sau sync lỗi: %s", e)
        rag_chunks_after = sum(
            d.get("chunks", 0) for d in learning_store.list_documents()
        )
        rag_chunks_added = max(0, rag_chunks_after - rag_chunks_before)

    result = DriveSyncResult(
        success=True,
        total_files=len(files),
        uploaded=sum(1 for r in results if r.status == "uploaded"),
        skipped=sum(1 for r in results if r.status == "skipped"),
        failed=sum(1 for r in results if r.status == "failed"),
        files=results,
        rag_chunks_added=rag_chunks_added,
        synced_at=datetime.utcnow(),
        triggered_by_user_id=user_id,
        duration_seconds=(datetime.utcnow() - start).total_seconds(),
    )
    update_job(
        job_id, status="completed", current_file="",
        result=result.model_dump(mode="json"),
    )
    save_history(result)
    log.info(
        "drive_sync xong job=%s total=%d up=%d skip=%d fail=%d chunks+=%d",
        job_id, result.total_files, result.uploaded, result.skipped,
        result.failed, result.rag_chunks_added,
    )
    return result
