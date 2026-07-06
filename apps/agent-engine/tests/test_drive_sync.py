"""Unit test cho đồng bộ Google Drive (app/core/drive_sync.py).

Cô lập: trỏ LEARNING_DIR + DRIVE_SYNC_JOBS_FILE sang thư mục tạm, mock toàn bộ
gọi mạng (token + list + download) nên KHÔNG chạm Drive thật. Test:
  - classify_category (thuần) + extract_folder_id.
  - learning_store: add_document có source/content_hash + exists_by_hash + reindex.
  - run_sync_job end-to-end (mock): đếm uploaded/skipped/failed + job completed.
"""

from __future__ import annotations

import asyncio
import importlib
import os
import tempfile

import pytest


@pytest.fixture()
def stores(monkeypatch):
    tmp = tempfile.mkdtemp(prefix="elc-drive-test-")
    monkeypatch.setenv("LEARNING_DIR", os.path.join(tmp, "learning"))
    monkeypatch.setenv(
        "DRIVE_SYNC_JOBS_FILE", os.path.join(tmp, "drive_sync_jobs.json")
    )
    from app.core import settings as settings_module

    importlib.reload(settings_module)
    from app.core import learning_store, drive_sync

    importlib.reload(learning_store)
    importlib.reload(drive_sync)
    return learning_store, drive_sync


def test_classify_category(stores):
    _, drive_sync = stores
    cases = {
        "Ban_do_phan_khu_ELC.pdf": "master_plan",
        "Mặt bằng tổng thể.pdf": "master_plan",
        "Chinh_sach_ban_hang_2026.docx": "policy",
        "Bang_gia_thang_6.xlsx": "pricing",
        "Mau_hop_dong_mua_ban.pdf": "contract",
        "Brochure_gioi_thieu.pdf": "brochure",
        "Thiet_ke_can_2PN.pdf": "units",
        "Phap_ly_giay_phep.pdf": "legal",
        "Kich_ban_dao_tao_sale.docx": "training",
        "Video_review_du_an.txt": "media",
        "tai_lieu_linh_tinh.txt": "other",
    }
    for name, expected in cases.items():
        assert drive_sync.classify_category(name) == expected, name


def test_extract_folder_id(stores):
    _, drive_sync = stores
    fid = "1Cct7yxa-BmJzxfaVc9R-CAVmSbFeLpAV"
    assert drive_sync.extract_folder_id(
        f"https://drive.google.com/drive/folders/{fid}"
    ) == fid
    assert drive_sync.extract_folder_id(
        f"https://drive.google.com/drive/folders/{fid}?usp=sharing"
    ) == fid
    assert drive_sync.extract_folder_id(fid) == fid
    assert drive_sync.extract_folder_id("không-có-id ở đây") is None


def test_add_document_source_hash_dedup(stores):
    learning_store, _ = stores
    content = "CHÍNH SÁCH BÁN HÀNG Happy Home. Hoa hồng 3%.".encode("utf-8")
    chash = learning_store._content_hash(content)
    assert learning_store.exists_by_hash(chash) is False

    doc = learning_store.add_document(
        content=content, original_name="chinh_sach.txt", title="Chính sách",
        category="policy", source="google_drive",
        source_metadata={"drive_file_id": "abc"}, content_hash=chash, reindex=True,
    )
    assert doc["source"] == "google_drive"
    assert doc["content_hash"] == chash
    assert doc["source_metadata"]["drive_file_id"] == "abc"
    assert learning_store.exists_by_hash(chash) is True
    # Đã reindex → tìm được nội dung.
    hits = learning_store.search("hoa hồng", top_k=3)
    assert any(h.document_id == doc["id"] for h in hits)


def test_run_sync_job_mocked(stores, monkeypatch):
    learning_store, drive_sync = stores

    files = [
        {"id": "f1", "name": "Bang_gia_T6.txt", "mimeType": "text/plain",
         "modifiedTime": "2026-06-01T00:00:00Z"},
        {"id": "f2", "name": "Chinh_sach.txt", "mimeType": "text/plain",
         "modifiedTime": "2026-06-02T00:00:00Z"},
        {"id": "f3", "name": "Phim_review.mp4", "mimeType": "video/mp4",
         "modifiedTime": "2026-06-03T00:00:00Z"},
        # f4 trùng nội dung f1 → skip.
        {"id": "f4", "name": "Bang_gia_copy.txt", "mimeType": "text/plain",
         "modifiedTime": "2026-06-04T00:00:00Z"},
    ]
    bodies = {
        "f1": b"Bang gia thang 6: BM-01 gia 5 ty.",
        "f2": b"Chinh sach hoa hong 3 phan tram.",
        "f3": b"\x00\x01\x02 binary video",
        "f4": b"Bang gia thang 6: BM-01 gia 5 ty.",  # giống f1
    }

    async def fake_token():
        return "fake-token"

    async def fake_list(folder_id, token, recursive=True, depth=0):
        return files

    async def fake_download(file_id, mime_type, token):
        suffix = ""
        return bodies[file_id], suffix

    monkeypatch.setattr(drive_sync, "get_workspace_access_token", fake_token)
    monkeypatch.setattr(drive_sync, "list_drive_folder", fake_list)
    monkeypatch.setattr(drive_sync, "download_drive_file", fake_download)

    from app.schemas.drive_sync import DriveSyncRequest

    req = DriveSyncRequest(
        folder_url="https://drive.google.com/drive/folders/XYZ",
        skip_existing=True, reindex_rag=True,
    )
    drive_sync.create_job("job-1", req.folder_url)
    result = asyncio.run(drive_sync.run_sync_job("job-1", req, "admin@hhth.net"))

    assert result.success is True
    assert result.total_files == 4
    assert result.uploaded == 2  # f1, f2
    assert result.skipped == 1   # f4 trùng f1
    assert result.failed == 1    # f3 .mp4 không hỗ trợ
    assert result.rag_chunks_added > 0

    job = drive_sync.get_job("job-1")
    assert job["status"] == "completed"
    assert job["progress"] == 100

    # Tài liệu đã vào store, tìm RAG ra nội dung bảng giá.
    hits = learning_store.search("bảng giá BM-01", top_k=3)
    assert hits, "RAG phải tìm được tài liệu vừa sync"
    # Lịch sử ghi nhận.
    assert drive_sync.list_history()[0]["uploaded"] == 2
