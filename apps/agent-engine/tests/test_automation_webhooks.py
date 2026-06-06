"""Test webhook automation + Telegram linking + endpoint daily-briefing.

Mọi outbound sang n8n đi qua automation.post_to_n8n → monkeypatch để ghi lại
call thay vì gọi mạng. TestClient chạy BackgroundTasks đồng bộ nên forward n8n
hoàn tất trước khi response trả về.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import automation
from app.api import leads as leads_store
from app.core import audit_store, commission_store, telegram_link, user_store
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app
from app.schemas.lead import Lead

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    """Cô lập store: users.json tạm + clear in-memory + tắt service token."""
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "internal_webhook_token", "")
    leads_store._LEADS.clear()
    audit_store.clear()
    commission_store.clear()
    telegram_link.clear()
    yield
    leads_store._LEADS.clear()


@pytest.fixture
def n8n_calls(monkeypatch):
    """Thay automation.post_to_n8n bằng recorder. Trả list (url, payload)."""
    calls: list[tuple[str, dict]] = []

    async def _fake(url, payload):
        calls.append((url, payload))
        return {"ok": True}

    monkeypatch.setattr(automation, "post_to_n8n", _fake)
    return calls


def _make_sale(email="sale@elc.net", full_name="Trần B", chat_id=None):
    user = user_store.create_user(
        email=email, full_name=full_name, password_hash="x", role="sale"
    )
    if chat_id:
        user_store.set_telegram_chat_id(user["id"], chat_id)
        user = user_store.find_by_id(user["id"])
    return user


def _auth(user_id, role="sale", email="sale@elc.net"):
    token, _ = create_access_token(user_id, {"role": role, "email": email})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Workflow 1 — booking-created → hot-lead-alert
# ---------------------------------------------------------------------------

def test_booking_created_forwards_enriched_payload(n8n_calls):
    sale = _make_sale(chat_id="999888")
    lead = Lead(
        id="lead-1", full_name="Nguyễn Văn A", phone="+84900000001",
        email="a@gmail.com", status="new", intent_score=10,
    )
    leads_store._LEADS[lead.id] = lead

    resp = client.post(
        "/webhooks/internal/booking-created",
        json={
            "lead_id": "lead-1",
            "unit_id": "ELC-A1-1205",
            "unit_summary": "Căn 2PN, 75m², view hồ, 3.2 tỷ",
            "booking_time": "2026-06-08 10:00",
            "sale_id": sale["id"],
            "ai_score": 92,
            "ai_summary": "Khách hỏi vay 70%, có ý đặt cọc",
        },
    )
    assert resp.status_code == 202
    assert resp.json()["status"] == "accepted"

    # Đã forward đúng 1 lần sang webhook hot-lead-alert.
    assert len(n8n_calls) == 1
    url, payload = n8n_calls[0]
    assert url.endswith("/webhook/hot-lead-alert")
    # Payload được bù từ store lead + sale.
    assert payload["lead_name"] == "Nguyễn Văn A"
    assert payload["lead_phone"] == "+84900000001"
    assert payload["sale_name"] == "Trần B"
    assert payload["sale_telegram_chat_id"] == "999888"
    assert payload["ai_score"] == 92

    # Lead được gắn sale + nâng trạng thái hot, contacted_at vẫn null.
    assert lead.assigned_sale_id == sale["id"]
    assert lead.status == "hot"
    assert lead.contacted_at is None

    # Audit có cả booking-created lẫn kết quả gửi n8n.
    types = {e["event_type"] for e in audit_store.list_events()}
    assert "booking-created" in types
    assert "n8n.hot-lead-alert" in types


# ---------------------------------------------------------------------------
# Workflow 2 — deal-closed → commission-calc
# ---------------------------------------------------------------------------

def test_deal_closed_forwards_to_commission_webhook(n8n_calls):
    sale = _make_sale()
    resp = client.post(
        "/webhooks/internal/deal-closed",
        json={
            "deal_id": "deal-1",
            "deal_amount": 3200000000,
            "sale_id": sale["id"],
            "sale_monthly_volume_before": 8500000000,
        },
    )
    assert resp.status_code == 202
    assert len(n8n_calls) == 1
    url, payload = n8n_calls[0]
    assert url.endswith("/webhook/commission-calc")
    assert payload["deal_amount"] == 3200000000
    assert payload["sale_name"] == "Trần B"


def test_deal_closed_rejects_invalid_amount(n8n_calls):
    resp = client.post(
        "/webhooks/internal/deal-closed",
        json={"deal_id": "d", "deal_amount": 0, "sale_id": "s"},
    )
    assert resp.status_code == 422
    assert n8n_calls == []


# ---------------------------------------------------------------------------
# /commissions/distribute — lưu record từ n8n
# ---------------------------------------------------------------------------

def test_commission_distribute_saves_record():
    body = {
        "deal_id": "deal-9",
        "deal_amount": 3200000000,
        "commission_pool": 128000000,
        "sale_id": "sale-x",
        "sale_monthly_volume_after": 11700000000,
        "frontline_tier_pct": 60,
        "tiers": [
            {"role": "company", "pct": 20, "amount": 25600000},
            {"role": "frontline", "user_id": "sale-x", "pct": 60, "amount": 76800000},
        ],
    }
    resp = client.post("/commissions/distribute", json=body)
    assert resp.status_code == 201
    assert resp.json()["deal_id"] == "deal-9"

    saved = commission_store.get("deal-9")
    assert saved is not None
    assert saved["frontline_tier_pct"] == 60
    assert len(saved["tiers"]) == 2

    # Idempotent: gửi lại cùng deal_id không nhân đôi.
    client.post("/commissions/distribute", json=body)
    assert len(commission_store.list_records()) == 1


# ---------------------------------------------------------------------------
# Telegram linking
# ---------------------------------------------------------------------------

def test_telegram_link_flow_sets_chat_id():
    sale = _make_sale()
    headers = _auth(sale["id"])

    # 1) Sale xin token.
    r1 = client.post("/me/telegram/link-token", headers=headers)
    assert r1.status_code == 200
    token = r1.json()["verification_token"]
    assert r1.json()["deep_link"].startswith("https://t.me/")

    # 2) Bot/n8n finalize với chat_id.
    r2 = client.post(
        "/me/telegram/link",
        json={"verification_token": token, "chat_id": "543210"},
    )
    assert r2.status_code == 200
    assert r2.json()["user_id"] == sale["id"]

    # 3) chat_id đã lưu, trạng thái linked.
    assert user_store.find_by_id(sale["id"])["telegram_chat_id"] == "543210"
    r3 = client.get("/me/telegram", headers=headers)
    assert r3.json()["linked"] is True
    assert r3.json()["chat_id"] == "543210"


def test_telegram_link_rejects_bad_token():
    resp = client.post(
        "/me/telegram/link",
        json={"verification_token": "invalid-token-xyz", "chat_id": "1"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Leads contacted_at (n8n escalate check)
# ---------------------------------------------------------------------------

def test_contacted_at_lifecycle():
    sale = _make_sale()
    headers = _auth(sale["id"])
    lead = Lead(id="lead-c", full_name="X", status="hot", intent_score=80)
    leads_store._LEADS[lead.id] = lead

    # Ban đầu null.
    r1 = client.get("/leads/lead-c/contacted_at", headers=headers)
    assert r1.status_code == 200
    assert r1.json()["contacted_at"] is None

    # Sale đánh dấu đã liên hệ.
    r2 = client.post("/leads/lead-c/contacted", headers=headers)
    assert r2.status_code == 200

    r3 = client.get("/leads/lead-c/contacted_at", headers=headers)
    assert r3.json()["contacted_at"] is not None


# ---------------------------------------------------------------------------
# Daily briefing endpoints (service token)
# ---------------------------------------------------------------------------

def test_sales_active_and_needs_followup_via_service_token(monkeypatch):
    monkeypatch.setattr(settings, "internal_webhook_token", "svc-secret")
    svc = {"X-Internal-Token": "svc-secret"}

    sale = _make_sale(chat_id="111")
    # Lead hot chưa liên hệ, gán cho sale này.
    lead = Lead(
        id="lead-f", full_name="Y", status="hot", intent_score=90,
        assigned_sale_id=sale["id"],
    )
    leads_store._LEADS[lead.id] = lead

    # /admin/sales/active
    r1 = client.get("/admin/sales/active", headers=svc)
    assert r1.status_code == 200
    ids = [s["id"] for s in r1.json()["sales"]]
    assert sale["id"] in ids

    # /admin/leads/needs-followup
    r2 = client.get(
        "/admin/leads/needs-followup", params={"sale_id": sale["id"]}, headers=svc
    )
    assert r2.status_code == 200
    assert r2.json()["counts"]["hot_uncontacted"] == 1


def test_admin_endpoints_reject_without_auth():
    # Không có JWT, không có service token → 401.
    assert client.get("/admin/sales/active").status_code == 401
