"""Test đồng bộ quỹ căn từ Google Sheets — parse, persist, backup, restore, API.

Cô lập store: inventory.json + users.json tạm (tmp_path). Mock fetch_sheet_csv
để KHÔNG gọi mạng — kiểm tra toàn bộ pipeline parse → store → backup offline.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core import inventory_store, inventory_sync, user_store
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app

client = TestClient(app)


# Header + vài dòng mô phỏng đúng layout sheet thật (16 cột, có cột trùng tên).
HEADER = [
    "STT", "PHÂN KHU", "ĐƯỜNG", "MÃ CĂN ", "HÌNH THỨC", "HƯỚNG", "VIEW",
    "VỊ TRÍ ", "Diện tích (m2)", "Diện tích (m2)", "GIÁ MIN", "THÀNH TIỀN",
    "GIÁ MAX", "THÀNH TIỀN", "QUỸ RA HÀNG", "ĐÃ CỌC THIỆN CHÍ",
]


def _row(stt, duong, ma, vitri, area, tt_min, tt_max, coc=""):
    return [
        str(stt), "PK MẶT TRỜI", duong, ma, "LÂU DÀI", "BẮC", "VIEW HỒ",
        vitri, area, area, "70.000.000,00", tt_min, "73.000.000,00", tt_max,
        "ĐỢT 1", coc,
    ]


SAMPLE_ROWS = [
    HEADER,
    _row(1, "DƯƠNG QUANG", "DQ-55", "GÓC", "87.2", "", ""),  # góc, chưa giá
    _row(2, "DƯƠNG QUANG", "DQ-53", "THƯỜNG", "96M2",
         "6.873.600.000,00", "7.056.000.000,00"),
    _row(3, "HỒNG QUANG", "HQ-10", "THƯỜNG", "95.5M2",
         "6.800.000.000,00", "6.900.000.000,00", coc="ĐÃ CỌC"),
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],  # dòng rỗng
]


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "inventory_file", str(tmp_path / "inventory.json"))
    inventory_store.clear()
    yield
    inventory_store.clear()


@pytest.fixture
def fake_fetch(monkeypatch):
    """Mock fetch_sheet_csv trả SAMPLE_ROWS (không gọi mạng)."""
    async def _fake(sheet_url, gid=0):
        return SAMPLE_ROWS

    monkeypatch.setattr(inventory_sync, "fetch_sheet_csv", _fake)


def _admin_headers():
    u = user_store.create_user(
        email="admin@hhth.net", full_name="Admin Happy Home", password_hash="x", role="admin"
    )
    token, _ = create_access_token(u["id"], {"role": "admin", "email": u["email"]})
    return {"Authorization": f"Bearer {token}"}


# --- Unit parse functions --------------------------------------------------
def test_parse_vn_money():
    assert inventory_sync.parse_vn_money("6.873.600.000,00") == 6873600000
    assert inventory_sync.parse_vn_money("71.600.000,00") == 71600000
    assert inventory_sync.parse_vn_money("") is None
    assert inventory_sync.parse_vn_money("   ") is None


def test_parse_area():
    assert inventory_sync.parse_area("96M2") == 96.0
    assert inventory_sync.parse_area("87.2") == 87.2
    assert inventory_sync.parse_area("95.8M2") == 95.8
    assert inventory_sync.parse_area("") is None


def test_map_status():
    assert inventory_sync.map_status("") == "Còn hàng"
    assert inventory_sync.map_status("ĐÃ CỌC") == "Đặt cọc"
    assert inventory_sync.map_status("Đã bán") == "Đã bán"


def test_extract_sheet_id():
    url = "https://docs.google.com/spreadsheets/d/ABC123_xy/edit?usp=sharing"
    assert inventory_sync.extract_sheet_id(url) == "ABC123_xy"
    with pytest.raises(ValueError):
        inventory_sync.extract_sheet_id("not a url")


def test_parse_rows_skips_blank_and_header():
    units, errors = inventory_sync.parse_rows(SAMPLE_ROWS)
    assert errors == []
    assert len(units) == 3  # bỏ header + dòng rỗng
    ids = {u["id"] for u in units}
    assert ids == {"DQ-55", "DQ-53", "HQ-10"}


def test_parse_row_price_label():
    units, _ = inventory_sync.parse_rows(SAMPLE_ROWS)
    by_id = {u["id"]: u for u in units}
    # Căn có giá min-max → nhãn "x - y tỷ"
    assert by_id["DQ-53"]["gia_min"] == 6873600000
    assert by_id["DQ-53"]["gia_max"] == 7056000000
    assert "tỷ" in by_id["DQ-53"]["gia"]
    assert "-" in by_id["DQ-53"]["gia"]
    # Căn góc chưa giá → "Liên hệ"
    assert by_id["DQ-55"]["gia"] == "Liên hệ"
    assert by_id["DQ-55"]["gia_min"] == 0
    # loai map từ vị trí
    assert by_id["DQ-55"]["loai"] == "Lô góc"
    assert by_id["DQ-53"]["loai"] == "Liền kề"
    # status từ cột cọc
    assert by_id["HQ-10"]["trang_thai"] == "Đặt cọc"


# --- Sync orchestration ----------------------------------------------------
def _run_sync(url, **kw):
    return asyncio.run(inventory_sync.sync_from_sheet(url, **kw))


def test_sync_replace_all_persists(fake_fetch):
    r = _run_sync(
        "https://docs.google.com/spreadsheets/d/X/edit",
        replace_all=True, user_id="u1", user_name="Thu",
    )
    assert r["success"] is True
    assert r["total_units"] == 3
    assert r["created"] == 3
    # Đã persist xuống store
    assert len(inventory_store.get_all()) == 3


def test_sync_twice_creates_backup(fake_fetch):
    url = "https://docs.google.com/spreadsheets/d/X/edit"
    _run_sync(url, replace_all=True, user_id="u1")
    r2 = _run_sync(url, replace_all=True, user_id="u1")
    assert r2["updated"] == 3
    assert r2["created"] == 0
    assert r2["backup_file"] is not None  # lần 2 backup hiện trạng
    assert len(inventory_store.list_backups()) >= 1
    assert len(inventory_store.get_sync_history()) == 2


def test_restore_from_backup(fake_fetch):
    url = "https://docs.google.com/spreadsheets/d/X/edit"
    _run_sync(url, replace_all=True)
    # Sync lần 2 tạo backup của trạng thái 3 căn.
    _run_sync(url, replace_all=True)
    backups = inventory_store.list_backups()
    assert backups
    inventory_store.delete_soft("DQ-53")
    assert len(inventory_store.get_all()) == 2
    inventory_store.restore_from_backup(backups[0]["timestamp"])
    assert len(inventory_store.get_all()) == 3


def test_sync_empty_sheet_fails(monkeypatch):
    async def _empty(sheet_url, gid=0):
        return [HEADER]  # chỉ header, không dòng dữ liệu

    monkeypatch.setattr(inventory_sync, "fetch_sheet_csv", _empty)
    r = _run_sync("https://x/d/Y/edit", replace_all=True)
    assert r["success"] is False
    assert r["errors"]


def test_sync_fetch_error_recorded(monkeypatch):
    async def _boom(sheet_url, gid=0):
        raise ValueError("Sheet chưa share công khai")

    monkeypatch.setattr(inventory_sync, "fetch_sheet_csv", _boom)
    r = _run_sync("https://x/d/Z/edit", replace_all=True)
    assert r["success"] is False
    assert any("công khai" in e for e in r["errors"])


# --- API endpoints ---------------------------------------------------------
def test_sync_endpoint_requires_admin():
    res = client.post("/admin/inventory/sync", json={"sheet_url": "https://x"})
    assert res.status_code in (401, 403)


def test_sync_endpoint_and_public_read(fake_fetch):
    headers = _admin_headers()
    res = client.post(
        "/admin/inventory/sync",
        json={"sheet_url": "https://docs.google.com/spreadsheets/d/X/edit",
              "replace_all": True},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["total_units"] == 3

    # Public endpoint phản ánh dữ liệu đã sync
    pub = client.get("/inventory/happy-home-thanh-hoa/units")
    assert pub.status_code == 200
    units = pub.json()
    assert len(units) == 3
    assert {u["id"] for u in units} == {"DQ-55", "DQ-53", "HQ-10"}

    # History endpoint
    hist = client.get("/admin/inventory/sync/history", headers=headers)
    assert hist.status_code == 200
    assert len(hist.json()["history"]) == 1
