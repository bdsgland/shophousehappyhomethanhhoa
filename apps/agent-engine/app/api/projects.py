"""Tài liệu công khai theo dự án — phục vụ mục "Tài liệu" ở trang Chi tiết dự án.

Khác với /learning/* (chỉ sale + admin), router này cho PHÉP mọi người dùng đã
đăng nhập (client/sale/admin) ĐỌC danh sách + TẢI tài liệu đã gắn `project_slug`
tương ứng. Đây là lựa chọn ít rủi ro: không mở cho ẩn danh, chỉ trả metadata an
toàn + tải file đã giới hạn đúng dự án (chống liệt kê tài liệu dự án khác).

Tài liệu nguồn = learning_store (gồm cả tài liệu đồng bộ từ Google Drive, đã lưu
kèm project_slug). Reuse cơ chế lưu file của learning_store.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import get_current_user
from app.core import learning_store
from app.schemas.learning import ProjectDocumentOut

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_project_doc(doc: dict, slug: str) -> ProjectDocumentOut:
    meta = doc.get("source_metadata") or {}
    return ProjectDocumentOut(
        id=doc["id"],
        title=doc.get("title", ""),
        type=doc.get("type", ""),
        size=doc.get("size", 0),
        group=doc.get("group"),
        category=doc.get("category", "other"),
        source=doc.get("source", "upload"),
        updated=meta.get("modified") or doc.get("created_at"),
        download_url=f"/projects/{slug}/documents/{doc['id']}/download",
    )


@router.get("/{slug}/documents", response_model=list[ProjectDocumentOut])
def list_project_documents(
    slug: str,
    _user: dict = Depends(get_current_user),
) -> list[ProjectDocumentOut]:
    """Danh sách tài liệu đã gắn dự án `slug` (mọi user đăng nhập đọc được)."""
    docs = learning_store.list_documents(project_slug=slug)
    return [_to_project_doc(d, slug) for d in docs]


@router.get("/{slug}/documents/{doc_id}/download")
def download_project_document(
    slug: str,
    doc_id: str,
    _user: dict = Depends(get_current_user),
) -> FileResponse:
    """Tải 1 tài liệu của dự án. Bắt buộc tài liệu thuộc đúng `slug` (chống lộ chéo)."""
    doc = learning_store.get_document(doc_id)
    if not doc or doc.get("project_slug") != slug:
        raise HTTPException(404, "Không tìm thấy tài liệu của dự án này")
    path = learning_store.file_abspath(doc)
    if not path.exists():
        raise HTTPException(404, "File không tồn tại trên máy chủ")
    from urllib.parse import quote

    from app.api.learning import _media_for

    filename = doc.get("original_name") or f"{doc.get('title', 'tai-lieu')}.{doc.get('type', 'bin')}"
    media_type, inline = _media_for(doc.get("type") or filename.rsplit(".", 1)[-1])
    disposition = "inline" if inline else "attachment"
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}"
    }
    return FileResponse(path, media_type=media_type, headers=headers)
