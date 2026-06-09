"""Test CRM: lead CRUD + bulk import + ai_score + daily task + hot distribution.

Cô lập store: users.json + leads.json + contact_logs.json + sale_tasks.json tạm
(monkeypatch settings paths). Tắt service token. Mỗi test bắt đầu store sạch.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import booking_store, lead_store, sale_task_store, user_store
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "leads_file", str(tmp_path / "leads.json"))
    monkeypatch.setattr(settings, "contact_logs_file", str(tmp_path / "logs.json"))
    monkeypatch.setattr(settings, "sale_tasks_file", str(tmp_path / "tasks.json"))
    monkeypatch.setattr(settings, "bookings_file", str(tmp_path / "bookings.json"))
    monkeypatch.setattr(settings, "internal_webhook_token", "")
    lead_store.clear()
    sale_task_store.clear()
    booking_store.clear()
    yield
    lead_store.clear()
    sale_task_store.clear()
    booking_store.clear()


def _make_user(email, role="sale", full_name="Trần Sale"):
    u = user_store.create_user(
        email=email, full_name=full_name, password_hash="x", role=role
    )
    return user_store.find_by_id(u["id"])


def _auth(user):
    token, _ = create_access_token(
        user["id"], {"role": user.get("role"), "email": user["email"]}
    )
    return {"Authorization": f"Bearer {token}"}


def _contacts(n, start=0):
    return [
        {"name": f"KH {i}", "phone": f"09000000{i:02d}", "source": "imported"}
        for i in range(start, start + n)
    ]


# ---------------------------------------------------------------------------
# Bulk import
# ---------------------------------------------------------------------------

def test_bulk_import_success_and_increments_task():
    sale = _make_user("s1@elc.net")
    body = {"leads": _contacts(5), "skip_duplicates": True}
    r = client.post("/sale/leads/bulk-import", json=body, headers=_auth(sale))
    assert r.status_code == 200
    data = r.json()
    assert data["imported"] == 5
    assert data["skipped"] == 0

    # KPI new_leads_added tăng theo số đã import.
    t = client.get("/sale/tasks/today", headers=_auth(sale)).json()
    assert t["new_leads_added"] == 5


def test_bulk_import_skips_duplicates():
    sale = _make_user("s2@elc.net")
    contacts = _contacts(3)
    client.post(
        "/sale/leads/bulk-import",
        json={"leads": contacts, "skip_duplicates": True},
        headers=_auth(sale),
    )
    # Import lại 3 trùng + 2 mới.
    again = contacts + _contacts(2, start=10)
    r = client.post(
        "/sale/leads/bulk-import",
        json={"leads": again, "skip_duplicates": True},
        headers=_auth(sale),
    )
    data = r.json()
    assert data["imported"] == 2
    assert data["skipped"] == 3
    assert len(data["duplicates"]) == 3


def test_phone_dedupe_normalizes_prefix():
    sale = _make_user("s3@elc.net")
    client.post(
        "/sale/leads",
        json={"name": "A", "phone": "0901234567"},
        headers=_auth(sale),
    )
    # +84 prefix coi là trùng.
    r = client.post(
        "/sale/leads/bulk-import",
        json={"leads": [{"name": "A2", "phone": "+84901234567"}]},
        headers=_auth(sale),
    )
    assert r.json()["skipped"] == 1


# ---------------------------------------------------------------------------
# AI score
# ---------------------------------------------------------------------------

def test_ai_score_computation():
    # registered(+20) + booking(+30) + note>50(+5) = 55, chưa có contact gần.
    long_note = "x" * 60
    lead = lead_store.create_lead(
        {"name": "Rich", "phone": "0911111111", "note": long_note},
        imported_by_sale_id="sale-x",
        registered=True,
    )
    lead = lead_store.update_lead(lead["id"], booking_count=1)
    assert lead["ai_score"] == 55  # 20 + 30 + 5


def test_ai_score_contact_logs_and_recency():
    sale = _make_user("s4@elc.net")
    created = lead_store.create_lead(
        {"name": "B", "phone": "0912222222"}, imported_by_sale_id=sale["id"]
    )
    lid = created["id"]
    # 5 contact log "interested" (effective) → +10; last_contact <3d → +5.
    for _ in range(5):
        lead_store.add_contact_log(lid, sale["id"], "call", "ok", "interested")
    lead = lead_store.get_lead(lid)
    assert lead["ai_score"] == 15  # 10 (>=5 effective) + 5 (recent)


# ---------------------------------------------------------------------------
# Phân quyền: sale chỉ thấy lead của mình; admin thấy hết
# ---------------------------------------------------------------------------

def test_sale_cannot_see_other_sales_leads():
    sale_a = _make_user("a@elc.net")
    sale_b = _make_user("b@elc.net")
    client.post("/sale/leads", json={"name": "A", "phone": "0900000001"}, headers=_auth(sale_a))
    client.post("/sale/leads", json={"name": "B", "phone": "0900000002"}, headers=_auth(sale_b))

    la = client.get("/sale/leads", headers=_auth(sale_a)).json()
    lb = client.get("/sale/leads", headers=_auth(sale_b)).json()
    assert la["total"] == 1
    assert lb["total"] == 1
    assert la["items"][0]["name"] == "A"


def test_sale_cannot_access_other_lead_detail():
    sale_a = _make_user("a2@elc.net")
    sale_b = _make_user("b2@elc.net")
    r = client.post(
        "/sale/leads", json={"name": "A", "phone": "0900000003"}, headers=_auth(sale_a)
    )
    lead_id = r.json()["id"]
    # Sale B cố xem lead của A → 403.
    resp = client.get(f"/sale/leads/{lead_id}", headers=_auth(sale_b))
    assert resp.status_code == 403


def test_admin_sees_all_leads():
    sale_a = _make_user("a3@elc.net")
    sale_b = _make_user("b3@elc.net")
    admin = _make_user("admin@elc.net", role="admin")
    client.post("/sale/leads", json={"name": "A", "phone": "0900000004"}, headers=_auth(sale_a))
    client.post("/sale/leads", json={"name": "B", "phone": "0900000005"}, headers=_auth(sale_b))

    r = client.get("/admin/crm/leads", headers=_auth(admin))
    assert r.status_code == 200
    assert r.json()["total"] == 2


def test_sale_endpoint_forbidden_for_client():
    cli = _make_user("client@elc.net", role="client")
    r = client.get("/sale/leads", headers=_auth(cli))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Daily task check-in
# ---------------------------------------------------------------------------

def test_daily_task_check_in_and_score():
    sale = _make_user("s5@elc.net")
    # Import 10 lead → đạt 100% target new_leads (40% trọng số).
    client.post(
        "/sale/leads/bulk-import",
        json={"leads": _contacts(10)},
        headers=_auth(sale),
    )
    r = client.post("/sale/tasks/check-in", headers=_auth(sale))
    assert r.status_code == 200
    task = r.json()
    assert task["checked_in"] is True
    # leads 100% (40 điểm), contacts 0, meetings 0 → score 40.
    assert task["score"] == 40


# ---------------------------------------------------------------------------
# Hot lead auto-distribute → top sale theo eligibility
# ---------------------------------------------------------------------------

def test_auto_distribute_to_top_sale():
    top = _make_user("top@elc.net", full_name="Top Sale")
    weak = _make_user("weak@elc.net", full_name="Weak Sale")
    admin = _make_user("admin2@elc.net", role="admin")

    # Top sale hoàn thành nhiều task → score cao hơn.
    client.post(
        "/sale/leads/bulk-import",
        json={"leads": _contacts(10)},
        headers=_auth(top),
    )
    for i in range(20):
        # tạo lead rồi log contact để đẩy contacts_made.
        cr = client.post(
            "/sale/leads",
            json={"name": f"C{i}", "phone": f"09111111{i:02d}"},
            headers=_auth(top),
        )
        client.post(
            f"/sale/leads/{cr.json()['id']}/contact-log",
            json={"channel": "call", "note": "ok", "outcome": "interested"},
            headers=_auth(top),
        )

    # Admin tạo 1 hot lead chưa gán + auto distribute.
    lead = lead_store.create_lead(
        {"name": "Hot KH", "phone": "0999999999"},
        imported_by_sale_id=None,
        assigned_sale_id=None,
        status="hot",
    )
    r = client.post("/admin/crm/hot-leads/auto-distribute", headers=_auth(admin))
    assert r.status_code == 200
    assert r.json()["distributed"] == 1
    # Lead phải về tay top sale.
    detail = client.get(f"/admin/crm/leads/{lead['id']}", headers=_auth(admin)).json()
    assert detail["assigned_sale_id"] == top["id"]


# ---------------------------------------------------------------------------
# lead-engaged webhook: register + book → mark hot + distribute
# ---------------------------------------------------------------------------

def test_lead_engaged_marks_hot_and_distributes():
    sale = _make_user("s6@elc.net")
    # Có 1 lead imported sẵn (chính là khách sẽ register + book).
    lead = lead_store.create_lead(
        {"name": "KH Nét", "phone": "0988888888", "email": "net@gmail.com"},
        imported_by_sale_id=sale["id"],
    )
    # Webhook: đã register + đã book → đủ nét.
    r = client.post(
        "/webhooks/internal/lead-engaged",
        json={"email": "net@gmail.com", "registered": True, "booked": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["matched"] is True
    assert body["marked_hot"] is True

    updated = lead_store.get_lead(lead["id"])
    assert updated["status"] == "hot"
    assert updated["registered"] is True
    assert updated["booking_count"] == 1
    # ai_score: registered(20) + booking(30) = 50.
    assert updated["ai_score"] >= 50


def test_lead_engaged_no_match():
    r = client.post(
        "/webhooks/internal/lead-engaged",
        json={"phone": "0000000000", "registered": True},
    )
    assert r.status_code == 200
    assert r.json()["matched"] is False


# ---------------------------------------------------------------------------
# Stats + soft delete
# ---------------------------------------------------------------------------

def test_admin_stats_and_soft_delete():
    sale = _make_user("s7@elc.net")
    admin = _make_user("admin3@elc.net", role="admin")
    r = client.post(
        "/sale/leads", json={"name": "X", "phone": "0900000099"}, headers=_auth(sale)
    )
    lid = r.json()["id"]

    # Soft delete → status lost, không hard-delete.
    d = client.delete(f"/admin/crm/leads/{lid}", headers=_auth(admin))
    assert d.status_code == 200
    assert d.json()["status"] == "lost"

    stats = client.get("/admin/crm/stats", headers=_auth(admin)).json()
    assert stats["total_leads"] == 1
    assert stats["lost_leads"] == 1


def test_contact_log_requires_ownership():
    sale_a = _make_user("a8@elc.net")
    sale_b = _make_user("b8@elc.net")
    r = client.post(
        "/sale/leads", json={"name": "A", "phone": "0900000077"}, headers=_auth(sale_a)
    )
    lid = r.json()["id"]
    resp = client.post(
        f"/sale/leads/{lid}/contact-log",
        json={"channel": "call", "note": "x", "outcome": "interested"},
        headers=_auth(sale_b),
    )
    assert resp.status_code == 403
