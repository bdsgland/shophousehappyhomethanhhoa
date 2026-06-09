"""Test Live Match — thuật toán ghép, decline→sale kế, timeout, Meet, cancel.

Service async nên test gói mỗi lời gọi trong asyncio.run (không cần pytest-asyncio).
Cô lập store: users.json / match_requests.json / sale_tasks.json tạm + reset
presence in-memory. find_best_match yêu cầu sale có WS đăng ký → dùng FakeWS.
"""

from __future__ import annotations

import asyncio

import pytest

from app.core import match_service, match_store, presence, sale_task_store, user_store
from app.core import google_meet
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def run(coro):
    return asyncio.run(coro)


class FakeWS:
    """WebSocket giả — ghi lại message server push để assert."""

    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, msg: dict) -> None:
        self.sent.append(msg)

    def last(self, mtype: str) -> dict | None:
        for m in reversed(self.sent):
            if m.get("type") == mtype:
                return m
        return None

    def has(self, mtype: str) -> bool:
        return any(m.get("type") == mtype for m in self.sent)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "match_requests_file", str(tmp_path / "match.json"))
    monkeypatch.setattr(settings, "sale_tasks_file", str(tmp_path / "tasks.json"))
    monkeypatch.setattr(settings, "internal_webhook_token", "")
    presence.reset()
    match_store.clear()
    sale_task_store.clear()
    yield
    presence.reset()
    match_store.clear()
    sale_task_store.clear()


def _make_sale(name: str) -> tuple[dict, FakeWS]:
    user = user_store.create_user(
        email=f"{name.lower()}@elc.test",
        full_name=name,
        password_hash="x",
        role="sale",
    )
    presence.set_online(user["id"], name)
    # Mở rộng giờ làm để test không phụ thuộc giờ chạy (VN time).
    p = presence.get_presence(user["id"])
    p["schedule_start"] = "00:00"
    p["schedule_end"] = "23:59"
    ws = FakeWS()
    presence.register_sale_ws(user["id"], ws)
    return user, ws


def _make_customer(name: str = "Khách A") -> dict:
    return user_store.create_user(
        email=f"{name.replace(' ', '').lower()}@kh.test",
        full_name=name,
        password_hash="x",
        role="client",
    )


def _boost(sale_id: str) -> None:
    """Tăng eligibility của 1 sale (KPI hôm nay) để được ưu tiên ghép."""
    sale_task_store.increment_metric(sale_id, "new_leads_added", 10)
    sale_task_store.increment_metric(sale_id, "contacts_made", 20)
    sale_task_store.increment_metric(sale_id, "hot_leads_closed", 5)


# ----- Thuật toán ghép -----

def test_pick_top_eligibility_sale():
    a, ws_a = _make_sale("SaleA")
    b, ws_b = _make_sale("SaleB")
    _boost(b["id"])  # B eligibility cao hơn → phải được chọn
    cust = _make_customer()

    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))

    assert match["status"] == "invited"
    assert match["sale_id"] == b["id"]
    assert ws_b.has("match:incoming")
    assert not ws_a.has("match:incoming")


def test_decline_moves_to_next_sale():
    a, ws_a = _make_sale("SaleA")
    b, ws_b = _make_sale("SaleB")
    _boost(a["id"])  # A được mời trước
    cust = _make_customer()

    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))
    assert match["sale_id"] == a["id"]

    after = run(match_service.decline_match(match["id"], a["id"]))
    cur = match_store.get(match["id"])
    assert cur["sale_id"] == b["id"]
    assert cur["status"] == "invited"
    assert a["id"] in cur["declined_by"]
    assert ws_b.has("match:incoming")


def test_timeout_expires_then_next_sale(monkeypatch):
    monkeypatch.setattr(settings, "match_invite_timeout_seconds", 0)
    a, ws_a = _make_sale("SaleA")
    b, ws_b = _make_sale("SaleB")
    _boost(a["id"])
    cust = _make_customer()

    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))
    assert match["sale_id"] == a["id"]

    # timeout=0 → invite_expires_at = now → quá hạn ngay → expire.
    run(match_service.expire_invite_if_needed(match["id"]))
    cur = match_store.get(match["id"])
    assert cur["sale_id"] == b["id"]
    assert a["id"] in cur["declined_by"]
    assert ws_a.has("match:expired")


def test_all_decline_fallback_no_sale():
    a, ws_a = _make_sale("SaleA")
    cust = _make_customer()

    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))
    run(match_service.decline_match(match["id"], a["id"]))

    cur = match_store.get(match["id"])
    assert cur["status"] == "declined"
    assert a["id"] in cur["declined_by"]


# ----- Tạo Google Meet -----

def test_accept_creates_meet_and_goes_live(monkeypatch):
    async def _fake_meet(**kwargs):
        return {
            "meet_link": "https://meet.google.com/abc-defg-hij",
            "event_id": "evt_123",
            "start": None,
            "end": None,
        }

    monkeypatch.setattr(google_meet, "create_meet_event", _fake_meet)
    a, ws_a = _make_sale("SaleA")
    cust = _make_customer()

    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))
    live = run(match_service.accept_match(match["id"], a["id"]))

    assert live["status"] == "live"
    assert live["meet_link"] == "https://meet.google.com/abc-defg-hij"
    assert live["meet_event_id"] == "evt_123"
    assert ws_a.has("match:meet_ready")
    p = presence.get_presence(a["id"])
    assert p["availability"] == "busy"
    assert p["active_calls"] == 1


def test_accept_meet_error_falls_back(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("Chưa cấu hình Workspace")

    monkeypatch.setattr(google_meet, "create_meet_event", _boom)
    a, ws_a = _make_sale("SaleA")
    cust = _make_customer()

    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))
    res = run(match_service.accept_match(match["id"], a["id"]))

    assert res["status"] == "accepted"
    assert res["meet_link"] is None
    assert ws_a.has("match:meet_error")


def test_complete_records_outcome_and_frees_sale(monkeypatch):
    async def _fake_meet(**kwargs):
        return {"meet_link": "https://meet.google.com/x", "event_id": "e", "start": None, "end": None}

    monkeypatch.setattr(google_meet, "create_meet_event", _fake_meet)
    a, ws_a = _make_sale("SaleA")
    cust = _make_customer()
    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))
    run(match_service.accept_match(match["id"], a["id"]))

    done = run(match_service.complete_match(match["id"], "booked", "Khách rất quan tâm"))
    assert done["status"] == "completed"
    assert done["outcome"] == "booked"
    assert done["outcome_note"] == "Khách rất quan tâm"
    assert done["duration_seconds"] is not None
    p = presence.get_presence(a["id"])
    assert p["availability"] == "online"
    assert p["active_calls"] == 0


# ----- Khách huỷ -----

def test_customer_cancel_sets_cancelled():
    a, ws_a = _make_sale("SaleA")
    cust = _make_customer()
    match = run(match_service.request_match(cust["id"], cust["full_name"], cust["email"]))

    res = run(match_service.cancel_match(match["id"], by_customer=True))
    assert res["status"] == "cancelled"
    assert ws_a.has("match:cancelled")


# ----- REST + phân quyền -----

def _auth(user: dict) -> dict:
    token, _ = create_access_token(user["id"], {"role": user.get("role"), "email": user["email"]})
    return {"Authorization": f"Bearer {token}"}


def test_admin_stats_endpoint():
    admin = user_store.create_user(
        email="admin@elc.test", full_name="Admin", password_hash="x", role="admin"
    )
    resp = client.get("/admin/match/stats?period=today", headers=_auth(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert body["period"] == "today"
    assert "conversion_rate" in body
    assert "online_sales" in body


def test_request_match_rest_requires_client():
    a, _ = _make_sale("SaleA")
    # sale gọi /match/request → 403 (chỉ client được tạo)
    resp = client.post("/match/request", headers=_auth(a))
    assert resp.status_code == 403
