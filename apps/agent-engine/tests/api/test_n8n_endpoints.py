"""Smoke test cho stub endpoint phục vụ n8n workflow (app/api/n8n_stubs.py).

Mỗi endpoint chỉ cần trả 200/201 với service token hợp lệ và 401 khi thiếu
token. Cô lập store như test_bookings: users.json + bookings.json tạm.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import leads as leads_store
from app.core import audit_store, booking_store, commission_store, user_store
from app.core.settings import settings
from app.main import app

client = TestClient(app)

_TOKEN = "test-internal-token"
_HEADERS = {"X-Internal-Token": _TOKEN}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "bookings_file", str(tmp_path / "bookings.json"))
    monkeypatch.setattr(settings, "internal_webhook_token", _TOKEN)
    leads_store._LEADS.clear()
    audit_store.clear()
    booking_store.clear()
    commission_store.clear()
    # Seed 1 sale để các endpoint cần sale_id chạy được.
    sale = user_store.create_user(
        email="sale1@example.com", full_name="Sale Một", password_hash="x", role="sale"
    )
    global _SALE_ID
    _SALE_ID = sale["id"]
    yield
    leads_store._LEADS.clear()
    booking_store.clear()
    commission_store.clear()


# (method, path) cho các endpoint không cần body / id động.
_GET_ENDPOINTS = [
    "/admin/leads/silent-14d",
    "/admin/leads/favorites-7d-no-booking",
    "/admin/users/birthday-today",
    "/admin/bookings/upcoming-24h",
    "/admin/bookings/completed-yesterday",
    "/admin/sales/inactive-3d",
    "/admin/kpi/today",
    "/admin/inventory/low",
    "/admin/cost/anthropic-today",
    "/admin/units/hot-pick",
    "/admin/marketing/keywords/pool",
    "/admin/marketing/google-ads/yesterday",
    "/admin/marketing/competitor-prices",
]


@pytest.mark.parametrize("path", _GET_ENDPOINTS)
def test_get_endpoints_ok(path):
    resp = client.get(path, headers=_HEADERS)
    assert resp.status_code == 200, f"{path} → {resp.status_code}: {resp.text}"


@pytest.mark.parametrize("path", _GET_ENDPOINTS)
def test_get_endpoints_require_token(path):
    resp = client.get(path)
    assert resp.status_code == 401, f"{path} không chặn thiếu token"


def test_sale_weekly_stats():
    resp = client.get(f"/admin/sales/{_SALE_ID}/weekly-stats", headers=_HEADERS)
    assert resp.status_code == 200
    assert resp.json()["sale"]["id"] == _SALE_ID


def test_sale_upgrade_tier():
    resp = client.post(
        f"/admin/sales/{_SALE_ID}/upgrade-tier", json={"tier": 3}, headers=_HEADERS
    )
    assert resp.status_code == 200
    assert resp.json()["tier"] == 3


def test_sale_bonus():
    resp = client.post(
        f"/admin/sales/{_SALE_ID}/bonus", json={"amount": 5_000_000}, headers=_HEADERS
    )
    assert resp.status_code == 200


def test_unknown_sale_404():
    resp = client.get("/admin/sales/nope/weekly-stats", headers=_HEADERS)
    assert resp.status_code == 404


def test_escalation():
    resp = client.post(
        "/admin/escalations",
        json={"lead_id": "L1", "sale_id": _SALE_ID, "severity": "high"},
        headers=_HEADERS,
    )
    assert resp.status_code == 201
    assert "escalation_id" in resp.json()


def test_leaderboard_update():
    resp = client.post(
        "/admin/leaderboard/update",
        json={"sale_id": _SALE_ID, "deal_amount": 3.2},
        headers=_HEADERS,
    )
    assert resp.status_code == 200
    assert "leaderboard" in resp.json()


def test_inbox_route():
    resp = client.post(
        "/admin/inbox/route",
        json={"subject": "Hỏi giá căn hộ", "body": "Cho mình xin giá xem nhà"},
        headers=_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["department"] == "sales"


def test_marketing_post_log():
    resp = client.post(
        "/admin/marketing/posts/log",
        json={"channel": "facebook", "content": "Hot pick hôm nay"},
        headers=_HEADERS,
    )
    assert resp.status_code == 201


def test_segments_preview():
    resp = client.post(
        "/admin/marketing/segments/preview",
        json={"role": "sale"},
        headers=_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["count"] >= 1  # có sale đã seed


def test_audience_match():
    resp = client.post(
        "/admin/marketing/audience/match",
        json={"criteria": {"role": "sale"}, "limit": 10},
        headers=_HEADERS,
    )
    assert resp.status_code == 200


def test_campaign_log():
    resp = client.post(
        "/admin/marketing/campaigns/C1/log",
        json={"sent": 100, "opened": 40},
        headers=_HEADERS,
    )
    assert resp.status_code == 201


def test_event_invites():
    resp = client.post("/admin/marketing/events/E1/invites", json={}, headers=_HEADERS)
    assert resp.status_code == 200


def test_hot_pick_returns_unit():
    resp = client.get("/admin/units/hot-pick", headers=_HEADERS)
    assert resp.status_code == 200
    assert "id" in resp.json()["unit"]
