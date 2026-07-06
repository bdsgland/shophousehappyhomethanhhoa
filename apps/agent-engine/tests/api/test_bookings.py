"""Test E2E flow đặt lịch xem nhà (/bookings + /me/bookings).

Cô lập store: users.json + bookings.json tạm, clear in-memory leads/audit, tắt
service token. Outbound n8n monkeypatch để không gọi mạng — TestClient chạy
BackgroundTasks đồng bộ nên forward hoàn tất trước khi response trả về.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api import automation
from app.api import leads as leads_store
from app.core import audit_store, booking_store, user_store
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "bookings_file", str(tmp_path / "bookings.json"))
    monkeypatch.setattr(settings, "internal_webhook_token", "")
    leads_store._LEADS.clear()
    audit_store.clear()
    booking_store.clear()
    yield
    leads_store._LEADS.clear()
    booking_store.clear()


@pytest.fixture
def n8n_calls(monkeypatch):
    """Thay automation.post_to_n8n bằng recorder. Trả list (url, payload)."""
    calls: list[tuple[str, dict]] = []

    async def _fake(url, payload):
        calls.append((url, payload))
        return {"ok": True}

    monkeypatch.setattr(automation, "post_to_n8n", _fake)
    return calls


def _make_user(email, role="client", full_name="Khách Hàng", favorites=None):
    user = user_store.create_user(
        email=email, full_name=full_name, password_hash="x", role=role
    )
    for uid in favorites or []:
        user_store.add_favorite(user["id"], uid)
    return user_store.find_by_id(user["id"])


def _auth(user):
    token, _ = create_access_token(
        user["id"], {"role": user.get("role"), "email": user["email"]}
    )
    return {"Authorization": f"Bearer {token}"}


def _tomorrow_10am() -> str:
    d = (datetime.utcnow() + timedelta(days=3)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )
    return d.isoformat()


def _payload(**over):
    base = {
        "unit_id": "HH-B1-1205",
        "scheduled_at": _tomorrow_10am(),
        "customer_name": "Nguyễn Văn A",
        "customer_phone": "0900000001",
        "customer_email": "a@gmail.com",
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# POST /bookings — tạo booking + trigger n8n + tạo lead
# ---------------------------------------------------------------------------

def test_create_booking_anonymous_creates_lead_and_triggers_n8n(n8n_calls):
    resp = client.post("/bookings", json=_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["ai_score"] == 50  # base, không có tài khoản
    assert body["lead_id"]

    # Lead được tạo từ booking.
    assert any(l.phone == "0900000001" for l in leads_store._LEADS.values())

    # Trigger n8n hot-lead-alert đúng 1 lần.
    assert len(n8n_calls) == 1
    url, payload = n8n_calls[0]
    assert url.endswith("/webhook/hot-lead-alert")
    assert payload["lead_name"] == "Nguyễn Văn A"

    # Lưu vào JSON store.
    assert len(booking_store.list_all()) == 1


def test_create_booking_with_referral_links_sale(n8n_calls):
    sale = _make_user("sale@hhth.net", role="sale", full_name="Trần Sale")
    ref = sale["referral_code"]
    assert ref

    resp = client.post("/bookings", json=_payload(referral_code=ref))
    assert resp.status_code == 201
    assert resp.json()["sale_id"] == sale["id"]


def test_ai_score_uses_favorites_and_account_age(n8n_calls):
    # Khách có > 1 favorite (+15) → score 65 (chưa tính tuổi tài khoản mới tạo).
    user = _make_user("rich@hhth.net", favorites=["HH-B1-01", "HH-B1-02"])
    resp = client.post("/bookings", json=_payload(), headers=_auth(user))
    assert resp.status_code == 201
    assert resp.json()["ai_score"] == 65


# ---------------------------------------------------------------------------
# GET /bookings — phân quyền
# ---------------------------------------------------------------------------

def test_list_bookings_role_scoping(n8n_calls):
    sale = _make_user("s2@hhth.net", role="sale")
    admin = _make_user("admin2@hhth.net", role="admin")
    # Booking gắn sale qua referral.
    client.post("/bookings", json=_payload(referral_code=sale["referral_code"]))
    # Booking không gắn sale.
    client.post("/bookings", json=_payload(customer_phone="0900000002"))

    # Admin thấy cả 2.
    r_admin = client.get("/bookings", headers=_auth(admin))
    assert r_admin.status_code == 200
    assert r_admin.json()["total"] == 2

    # Sale chỉ thấy của mình (1).
    r_sale = client.get("/bookings", headers=_auth(sale))
    assert r_sale.json()["total"] == 1
    assert r_sale.json()["items"][0]["sale_id"] == sale["id"]


def test_me_bookings_for_client(n8n_calls):
    user = _make_user("client3@hhth.net")
    client.post("/bookings", json=_payload(customer_email="client3@hhth.net"), headers=_auth(user))
    r = client.get("/me/bookings", headers=_auth(user))
    assert r.status_code == 200
    assert len(r.json()) == 1


# ---------------------------------------------------------------------------
# PATCH /bookings/{id} — đổi trạng thái theo quyền
# ---------------------------------------------------------------------------

def test_sale_confirms_booking(n8n_calls):
    sale = _make_user("s4@hhth.net", role="sale")
    create = client.post(
        "/bookings", json=_payload(referral_code=sale["referral_code"])
    )
    bid = create.json()["id"]
    r = client.patch(f"/bookings/{bid}", json={"status": "confirmed"}, headers=_auth(sale))
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


def test_client_cannot_set_completed(n8n_calls):
    user = _make_user("c5@hhth.net")
    create = client.post(
        "/bookings", json=_payload(customer_email="c5@hhth.net"), headers=_auth(user)
    )
    bid = create.json()["id"]
    r = client.patch(f"/bookings/{bid}", json={"status": "completed"}, headers=_auth(user))
    assert r.status_code == 403


def test_client_cancel_within_24h_blocked(n8n_calls):
    user = _make_user("c6@hhth.net")
    soon = (datetime.utcnow() + timedelta(hours=5)).isoformat()
    create = client.post(
        "/bookings",
        json=_payload(customer_email="c6@hhth.net", scheduled_at=soon),
        headers=_auth(user),
    )
    bid = create.json()["id"]
    r = client.patch(f"/bookings/{bid}", json={"status": "cancelled"}, headers=_auth(user))
    assert r.status_code == 400


def test_client_cancel_far_future_ok(n8n_calls):
    user = _make_user("c7@hhth.net")
    create = client.post(
        "/bookings", json=_payload(customer_email="c7@hhth.net"), headers=_auth(user)
    )
    bid = create.json()["id"]
    r = client.patch(f"/bookings/{bid}", json={"status": "cancelled"}, headers=_auth(user))
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


# ---------------------------------------------------------------------------
# POST /bookings/{id}/reschedule
# ---------------------------------------------------------------------------

def test_reschedule_resets_to_pending(n8n_calls):
    sale = _make_user("s8@hhth.net", role="sale")
    create = client.post(
        "/bookings", json=_payload(referral_code=sale["referral_code"])
    )
    bid = create.json()["id"]
    client.patch(f"/bookings/{bid}", json={"status": "confirmed"}, headers=_auth(sale))
    new_time = (datetime.utcnow() + timedelta(days=5)).isoformat()
    r = client.post(
        f"/bookings/{bid}/reschedule",
        json={"scheduled_at": new_time},
        headers=_auth(sale),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------

def test_list_requires_auth():
    assert client.get("/bookings").status_code == 401


def test_get_missing_booking_404():
    admin = _make_user("admin9@hhth.net", role="admin")
    assert client.get("/bookings/nope", headers=_auth(admin)).status_code == 404
