"""Test OpenClaw God-Mode Bridge (prefix /openclaw).

Bao phủ: auth token (thiếu/sai/đúng), CRUD user + lead, SQL validation (chặn ghi),
commission config, audit log ghi nhận, communication chưa cấu hình → 503.

Cô lập store qua monkeypatch settings paths + bật openclaw_god_token cố định.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import openclaw_bridge
from app.core import (
    audit_store,
    commission_config_store,
    inventory_store,
    lead_store,
    sale_task_store,
    user_store,
)
from app.core.settings import settings
from app.main import app

client = TestClient(app)

GOD = "test-god-token-0123456789abcdef"
HDR = {"X-Openclaw-Token": GOD}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "leads_file", str(tmp_path / "leads.json"))
    monkeypatch.setattr(settings, "contact_logs_file", str(tmp_path / "logs.json"))
    monkeypatch.setattr(settings, "sale_tasks_file", str(tmp_path / "tasks.json"))
    monkeypatch.setattr(settings, "inventory_file", str(tmp_path / "inv.json"))
    monkeypatch.setattr(settings, "commission_config_file", str(tmp_path / "comm.json"))
    monkeypatch.setattr(settings, "openclaw_god_token", GOD)
    monkeypatch.setattr(settings, "openclaw_telegram_bot_token", "")
    monkeypatch.setattr(settings, "telegram_bot_token", "")
    monkeypatch.setattr(settings, "smtp_host", "")
    lead_store.clear()
    sale_task_store.clear()
    inventory_store.clear()
    commission_config_store.clear()
    audit_store.clear()
    yield
    lead_store.clear()
    sale_task_store.clear()
    inventory_store.clear()
    commission_config_store.clear()
    audit_store.clear()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_reject_without_token():
    r = client.get("/openclaw/users")
    assert r.status_code == 403
    assert r.json()["detail"] == "OpenClaw token required"


def test_reject_with_wrong_token():
    r = client.get("/openclaw/users", headers={"X-Openclaw-Token": "wrong"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Invalid OpenClaw token"


def test_reject_when_god_token_unconfigured(monkeypatch):
    # Token chưa cấu hình → fail closed kể cả khi client gửi token.
    monkeypatch.setattr(settings, "openclaw_god_token", "")
    r = client.get("/openclaw/users", headers=HDR)
    assert r.status_code == 403


def test_accept_with_god_token():
    r = client.get("/openclaw/users", headers=HDR)
    assert r.status_code == 200
    assert "users" in r.json()


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

def test_create_user_any_role_and_list():
    r = client.post(
        "/openclaw/users",
        json={"email": "boss@elc.net", "full_name": "Sếp", "role": "admin"},
        headers=HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["role"] == "admin"
    assert body["generated_password"]  # tự sinh, trả 1 lần
    assert "password_hash" not in body["user"]

    listing = client.get("/openclaw/users", headers=HDR).json()
    assert listing["count"] == 1


def test_impersonate_returns_jwt():
    u = client.post(
        "/openclaw/users",
        json={"email": "imp@elc.net", "full_name": "X", "role": "sale", "password": "pw123456"},
        headers=HDR,
    ).json()["user"]
    r = client.post(f"/openclaw/users/{u['id']}/impersonate", headers=HDR)
    assert r.status_code == 200
    assert r.json()["access_token"]
    assert r.json()["token_type"] == "bearer"


def test_soft_delete_user():
    u = client.post(
        "/openclaw/users",
        json={"email": "del@elc.net", "full_name": "Y", "role": "sale"},
        headers=HDR,
    ).json()["user"]
    r = client.delete(f"/openclaw/users/{u['id']}", headers=HDR)
    assert r.status_code == 200
    assert r.json()["is_active"] is False
    # vẫn còn trong store (soft delete)
    assert user_store.find_by_id(u["id"]) is not None


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------

def test_create_and_list_leads():
    r = client.post(
        "/openclaw/leads",
        json={"name": "KH OpenClaw", "phone": "0901234567"},
        headers=HDR,
    )
    assert r.status_code == 201
    listing = client.get("/openclaw/leads", headers=HDR).json()
    assert listing["total"] == 1


def test_lead_bulk_action_set_status():
    ids = []
    for i in range(3):
        lead = lead_store.create_lead({"name": f"L{i}", "phone": f"090000000{i}"})
        ids.append(lead["id"])
    r = client.post(
        "/openclaw/leads/bulk-action",
        json={"lead_ids": ids, "action": "set_status", "status": "warm"},
        headers=HDR,
    )
    assert r.status_code == 200
    assert r.json()["affected"] == 3
    assert all(lead_store.get_lead(i)["status"] == "warm" for i in ids)


def test_assign_hot_requires_valid_sale():
    lead = lead_store.create_lead({"name": "Hot", "phone": "0900000111"})
    r = client.post(
        f"/openclaw/leads/{lead['id']}/assign-hot",
        json={"sale_id": "nope"},
        headers=HDR,
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# SQL validation (read-only enforcement)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "bad",
    [
        "UPDATE users SET role='admin'",
        "DELETE FROM users",
        "DROP TABLE users",
        "SELECT 1; DROP TABLE users",
        "INSERT INTO users VALUES (1)",
        "SELECT * FROM users; -- comment",
        "WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x",
        "TRUNCATE users",
        "SELECT * INTO new_t FROM users",
    ],
)
def test_sql_validation_blocks_writes(bad):
    with pytest.raises(ValueError):
        openclaw_bridge.validate_select_sql(bad)


@pytest.mark.parametrize(
    "good",
    [
        "SELECT * FROM users",
        "select id, email from users where role = 'sale'",
        "WITH t AS (SELECT 1 AS n) SELECT n FROM t",
    ],
)
def test_sql_validation_allows_select(good):
    assert openclaw_bridge.validate_select_sql(good)


def test_db_query_blocks_write_via_endpoint():
    r = client.post("/openclaw/db/query", json={"sql": "DELETE FROM users"}, headers=HDR)
    assert r.status_code == 400


def test_db_query_valid_select_passes_validation_but_no_db():
    # SELECT hợp lệ → vượt qua validate, nhưng DB chưa cấu hình → 503 (không 400).
    r = client.post("/openclaw/db/query", json={"sql": "SELECT 1"}, headers=HDR)
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# Commission config
# ---------------------------------------------------------------------------

def test_get_and_patch_commission_config():
    cfg = client.get("/openclaw/commission/config", headers=HDR).json()
    assert "tiers" in cfg
    r = client.patch(
        "/openclaw/commission/config",
        json={"total_pool_percentage": 5.0},
        headers=HDR,
    )
    assert r.status_code == 200
    assert r.json()["total_pool_percentage"] == 5.0
    assert r.json()["version"] == cfg["version"] + 1


# ---------------------------------------------------------------------------
# Communication — chưa cấu hình → 503
# ---------------------------------------------------------------------------

def test_telegram_send_unconfigured():
    r = client.post("/openclaw/telegram/send", json={"chat_id": "123", "text": "hi"}, headers=HDR)
    assert r.status_code == 503


def test_email_send_unconfigured():
    r = client.post(
        "/openclaw/email/send",
        json={"to": ["a@b.com"], "subject": "s", "body": "b"},
        headers=HDR,
    )
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

def test_requests_are_audited():
    # Mỗi request /openclaw được middleware ghi audit (tag OPENCLAW_GOD_MODE).
    client.post(
        "/openclaw/users",
        json={"email": "audit@elc.net", "full_name": "A", "role": "sale", "password": "pw123456"},
        headers=HDR,
    )
    events = audit_store.list_events(prefix="openclaw.", limit=50)
    assert any(e["event_type"] == "openclaw.POST" for e in events)
    rec = next(e for e in events if e["event_type"] == "openclaw.POST")
    assert rec["payload"]["tag"] == "OPENCLAW_GOD_MODE"
    # password trong body phải bị mask.
    assert rec["payload"]["body"]["password"] == "***"


def test_audit_log_endpoint_returns_openclaw_events():
    client.get("/openclaw/users", headers=HDR)
    r = client.get("/openclaw/audit-log", headers=HDR)
    assert r.status_code == 200
    assert any(e["event_type"].startswith("openclaw.") for e in r.json()["events"])
