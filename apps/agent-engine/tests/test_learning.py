"""Unit test cho Sale Learning Center (/learning/*).

Cô lập hoàn toàn: trỏ LEARNING_DIR sang thư mục tạm + ép USE_MOCK_LLM nên KHÔNG
gọi mạng / LLM thật. Tự seed 1 admin + 1 sale qua user_store và tạo JWT thật.
"""

from __future__ import annotations

import importlib
import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    tmp = tempfile.mkdtemp(prefix="elc-learning-test-")
    # Cô lập storage: tài liệu learning + user store đều nằm trong thư mục tạm.
    monkeypatch.setenv("LEARNING_DIR", os.path.join(tmp, "learning"))
    monkeypatch.setenv("USERS_FILE", os.path.join(tmp, "users.json"))
    monkeypatch.setenv("USE_MOCK_LLM", "true")

    # Reload settings + 2 store để ăn env mới (reload tại chỗ — giữ nguyên định
    # danh module nên deps/router vẫn trỏ đúng). KHÔNG reload `security`: token
    # ký/giải mã phải cùng 1 runtime-secret trong tiến trình.
    from app.core import settings as settings_module

    importlib.reload(settings_module)
    from app.core import user_store, learning_store, security

    importlib.reload(user_store)
    importlib.reload(learning_store)

    # Seed admin + sale.
    admin = user_store.create_user(
        email="admin@elc.net", full_name="Quản Trị",
        password_hash=security.hash_password("admin123x"), role="admin",
    )
    sale = user_store.create_user(
        email="sale@elc.net", full_name="Nguyễn Văn Sale",
        password_hash=security.hash_password("sale123xy"), role="sale",
    )
    client_user = user_store.create_user(
        email="client@elc.net", full_name="Khách Hàng",
        password_hash=security.hash_password("client123x"), role="client",
    )

    from app.main import app

    c = TestClient(app)
    # create_access_token trả (token, expires_in) → lấy phần token.
    c.tokens = {  # type: ignore[attr-defined]
        "admin": security.create_access_token(admin["id"])[0],
        "sale": security.create_access_token(sale["id"])[0],
        "client": security.create_access_token(client_user["id"])[0],
    }
    yield c


def _auth(c, role):
    return {"Authorization": f"Bearer {c.tokens[role]}"}


def _upload_policy(c, role="admin"):
    text = (
        "CHÍNH SÁCH BÁN HÀNG ELC 2026\n"
        "Hoa hồng cho sale là 3% giá trị căn đã chốt.\n"
        "Chiết khấu thanh toán nhanh: 8%.\n"
    ).encode("utf-8")
    return c.post(
        "/learning/documents",
        headers=_auth(c, role),
        files={"file": ("policy_elc_2026.txt", text, "text/plain")},
        data={"title": "Chính sách bán hàng ELC 2026", "category": "policy"},
    )


# ----- Phân quyền upload -----

def test_upload_requires_admin(client):
    r = _upload_policy(client, role="sale")
    assert r.status_code == 403


def test_upload_and_index(client):
    r = _upload_policy(client, role="admin")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["category"] == "policy"
    assert body["chunks"] >= 1
    assert body["document_id"]


def test_list_documents_sale_allowed_client_blocked(client):
    _upload_policy(client)
    r_sale = client.get("/learning/documents", headers=_auth(client, "sale"))
    assert r_sale.status_code == 200
    docs = r_sale.json()
    assert len(docs) == 1
    assert docs[0]["download_url"].endswith("/download")

    r_client = client.get("/learning/documents", headers=_auth(client, "client"))
    assert r_client.status_code == 403

    r_anon = client.get("/learning/documents")
    assert r_anon.status_code == 401


def test_search_finds_uploaded(client):
    _upload_policy(client)
    r = client.post(
        "/learning/search",
        headers=_auth(client, "sale"),
        json={"query": "hoa hồng cho sale", "top_k": 5},
    )
    assert r.status_code == 200, r.text
    passages = r.json()["passages"]
    assert passages, "Phải tìm thấy ít nhất 1 đoạn"
    assert any("hoa hồng" in p["text"].lower() for p in passages)


def test_ask_sync_mock_has_sources(client):
    _upload_policy(client)
    r = client.post(
        "/learning/ask/sync",
        headers=_auth(client, "sale"),
        json={"question": "Chính sách hoa hồng dự án ELC?"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"]
    assert body["sources"], "Mock answer phải kèm nguồn trích dẫn"


def test_ask_stream_emits_ndjson(client):
    _upload_policy(client)
    r = client.post(
        "/learning/ask",
        headers=_auth(client, "sale"),
        json={"question": "Hoa hồng bao nhiêu?"},
    )
    assert r.status_code == 200
    lines = [json.loads(ln) for ln in r.text.splitlines() if ln.strip()]
    types = [ln["type"] for ln in lines]
    assert types[0] == "sources"
    assert "done" in types
    assert any(t == "delta" for t in types)


def test_quote_generates_pdf(client):
    r = client.post(
        "/learning/quote",
        headers=_auth(client, "sale"),
        json={
            "unit_id": "BM-01",
            "customer_name": "Trần Thị Khách",
            "customer_phone": "0900000000",
            "payment_plan": "standard",
            "discount_pct": 5,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_price"] < body["list_price"]  # đã trừ chiết khấu
    assert abs(sum(m["pct"] for m in body["milestones"]) - 100) < 0.01
    # Tải PDF về và kiểm tra magic header.
    dl = client.get(body["pdf_url"], headers=_auth(client, "sale"))
    assert dl.status_code == 200
    assert dl.content[:4] == b"%PDF"


def test_quote_unknown_unit(client):
    r = client.post(
        "/learning/quote",
        headers=_auth(client, "sale"),
        json={"unit_id": "ZZ-99", "customer_name": "X"},
    )
    assert r.status_code == 404


def test_delete_document_admin_only(client):
    up = _upload_policy(client).json()
    doc_id = up["document_id"]
    r_sale = client.delete(f"/learning/documents/{doc_id}", headers=_auth(client, "sale"))
    assert r_sale.status_code == 403
    r_admin = client.delete(f"/learning/documents/{doc_id}", headers=_auth(client, "admin"))
    assert r_admin.status_code == 200
    assert client.get("/learning/documents", headers=_auth(client, "sale")).json() == []
