"""Test cấu hình hoa hồng: config CRUD + validate + history + calculator + KPI tier.

Cô lập store: commission_config.json + users.json tạm (monkeypatch settings paths).
Mỗi test bắt đầu store sạch.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import commission_calc, commission_config_store, user_store
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app

client = TestClient(app)

BIL = 1_000_000_000  # 1 tỷ


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(
        settings, "commission_config_file", str(tmp_path / "commission_config.json")
    )
    monkeypatch.setattr(settings, "internal_webhook_token", "")
    commission_config_store.clear()
    yield
    commission_config_store.clear()


def _make_user(email, role="admin", full_name="Quản trị"):
    u = user_store.create_user(
        email=email, full_name=full_name, password_hash="x", role=role
    )
    return user_store.find_by_id(u["id"])


def _auth(user):
    token, _ = create_access_token(
        user["id"], {"role": user.get("role"), "email": user["email"]}
    )
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Config CRUD + permission
# ---------------------------------------------------------------------------

def test_get_default_config():
    admin = _make_user("a1@hhth.net")
    r = client.get("/admin/commission/config", headers=_auth(admin))
    assert r.status_code == 200
    cfg = r.json()
    assert cfg["total_pool_percentage"] == 4.0
    assert len(cfg["tiers"]) == 5
    assert len(cfg["frontline_kpi_tiers"]) == 5
    assert cfg["version"] == 1
    # tổng 5 bậc = 100
    assert sum(t["percentage"] for t in cfg["tiers"]) == 100.0


def test_non_admin_cannot_read_config():
    sale = _make_user("s1@hhth.net", role="sale")
    r = client.get("/admin/commission/config", headers=_auth(sale))
    assert r.status_code == 403


def test_update_valid_bumps_version():
    admin = _make_user("a1@hhth.net")
    cfg = client.get("/admin/commission/config", headers=_auth(admin)).json()
    cfg["total_pool_percentage"] = 5.0
    r = client.patch("/admin/commission/config", json=cfg, headers=_auth(admin))
    assert r.status_code == 200
    out = r.json()
    assert out["total_pool_percentage"] == 5.0
    assert out["version"] == 2
    assert out["last_updated_by"] == admin["id"]


def test_reject_when_tiers_not_100():
    admin = _make_user("a1@hhth.net")
    cfg = client.get("/admin/commission/config", headers=_auth(admin)).json()
    cfg["tiers"][0]["percentage"] = 30.0  # 20→30 ⇒ tổng = 110
    r = client.patch("/admin/commission/config", json=cfg, headers=_auth(admin))
    assert r.status_code == 400
    assert "100%" in r.json()["detail"]


def test_reject_when_kpi_tiers_gap():
    admin = _make_user("a1@hhth.net")
    cfg = client.get("/admin/commission/config", headers=_auth(admin)).json()
    # tạo khoảng trống: max bậc 2 != min bậc 3
    cfg["frontline_kpi_tiers"][1]["max_monthly_volume"] = 9 * BIL  # nhưng bậc 3 min = 10 tỷ
    r = client.patch("/admin/commission/config", json=cfg, headers=_auth(admin))
    assert r.status_code == 400
    assert "liên tục" in r.json()["detail"]


def test_reject_when_last_tier_has_max():
    admin = _make_user("a1@hhth.net")
    cfg = client.get("/admin/commission/config", headers=_auth(admin)).json()
    cfg["frontline_kpi_tiers"][-1]["max_monthly_volume"] = 99 * BIL
    r = client.patch("/admin/commission/config", json=cfg, headers=_auth(admin))
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# History + restore
# ---------------------------------------------------------------------------

def test_history_and_restore():
    admin = _make_user("a1@hhth.net")
    h = _auth(admin)
    # tạo version 1 (đọc) rồi update lên 2, 3
    base = client.get("/admin/commission/config", headers=h).json()
    base["total_pool_percentage"] = 4.5
    client.patch("/admin/commission/config", json=base, headers=h)  # v2
    base["total_pool_percentage"] = 6.0
    client.patch("/admin/commission/config", json=base, headers=h)  # v3

    hist = client.get("/admin/commission/config/history", headers=h).json()["versions"]
    assert hist[0]["is_current"] is True
    assert hist[0]["version"] == 3
    # có ít nhất 1 backup
    assert any(v["backup_file"] for v in hist)

    # restore version 2 (pool 4.5) → tạo version mới
    r = client.post("/admin/commission/config/restore/2", headers=h)
    assert r.status_code == 200
    restored = r.json()
    assert restored["total_pool_percentage"] == 4.5
    assert restored["version"] == 4


def test_reset_to_default():
    admin = _make_user("a1@hhth.net")
    h = _auth(admin)
    cfg = client.get("/admin/commission/config", headers=h).json()
    cfg["total_pool_percentage"] = 9.0
    client.patch("/admin/commission/config", json=cfg, headers=h)
    r = client.post("/admin/commission/config/reset", headers=h)
    assert r.status_code == 200
    assert r.json()["total_pool_percentage"] == 4.0


# ---------------------------------------------------------------------------
# Calculator — bậc KPI + phân chia
# ---------------------------------------------------------------------------

def test_find_tier_by_volume():
    cfg = commission_config_store.get_current()
    # 7 tỷ ⇒ bậc 2 (5-10 tỷ)
    assert commission_calc.find_frontline_tier(7 * BIL, cfg).tier_id == 2
    # 0 ⇒ bậc 1
    assert commission_calc.find_frontline_tier(0, cfg).tier_id == 1
    # 25 tỷ ⇒ bậc 5 (cao nhất)
    assert commission_calc.find_frontline_tier(25 * BIL, cfg).tier_id == 5


def test_calculator_tier2_frontline_55pct():
    cfg = commission_config_store.get_current()
    # deal 5 tỷ, doanh số trước 3 tỷ ⇒ sau = 8 tỷ ⇒ bậc 2 (55%)
    bd = commission_calc.calculate_commission_breakdown(
        deal_amount=5 * BIL,
        sale_frontline_id="sale-1",
        sale_monthly_volume_before_deal=3 * BIL,
        config=cfg,
    )
    assert bd.total_pool == 200_000_000  # 4% của 5 tỷ
    assert bd.frontline_tier_id == 2
    frontline = next(r for r in bd.recipients if r.role == "frontline")
    assert frontline.percentage == 55.0
    assert frontline.amount == 110_000_000  # 55% của 200tr
    ekip = next(r for r in bd.recipients if r.role == "ekip")
    assert ekip.percentage == 24.0  # 20 + bonus 4 (bậc 2)


def test_calculator_referral_carved_from_frontline():
    cfg = commission_config_store.get_current()
    bd = commission_calc.calculate_commission_breakdown(
        deal_amount=5 * BIL,
        sale_frontline_id="sale-1",
        sale_monthly_volume_before_deal=3 * BIL,
        referrer_id="ref-1",
        config=cfg,
    )
    referrer = next(r for r in bd.recipients if r.role == "referrer")
    assert referrer.amount == 10_000_000  # 5% của 200tr
    frontline = next(r for r in bd.recipients if r.role == "frontline")
    # 110tr - 10tr referral = 100tr
    assert frontline.amount == 100_000_000


def test_preview_endpoint():
    admin = _make_user("a1@hhth.net")
    r = client.post(
        "/admin/commission/preview",
        json={"deal_amount": 5 * BIL, "sale_monthly_volume_before_deal": 3 * BIL},
        headers=_auth(admin),
    )
    assert r.status_code == 200
    bd = r.json()
    assert bd["frontline_tier_id"] == 2
    assert bd["total_pool"] == 200_000_000


def test_preview_rejects_bad_amount():
    admin = _make_user("a1@hhth.net")
    r = client.post(
        "/admin/commission/preview", json={"deal_amount": 0}, headers=_auth(admin)
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Sale — current tier
# ---------------------------------------------------------------------------

def test_sale_current_tier():
    sale = _make_user("s1@hhth.net", role="sale")
    r = client.get("/sale/commission/me/current-tier", headers=_auth(sale))
    assert r.status_code == 200
    data = r.json()
    assert data["current_tier"]["tier_id"] == 1  # doanh số 0 ⇒ bậc khởi đầu
    assert data["next_tier"]["tier_id"] == 2
    assert len(data["all_tiers"]) == 5
    assert data["referral_bonus"]["percentage_of_commission"] == 5.0
