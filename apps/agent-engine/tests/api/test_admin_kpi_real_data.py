"""KPI admin phải trả DỮ LIỆU THẬT — không bịa số từ quỹ căn mock.

Quy tắc: khi inventory_store còn rỗng (chưa sync từ Sheets) hệ thống fallback
112 căn mock để bản đồ không trống. Các con số đó KHÔNG được lọt vào KPI
"đơn đặt cọc" / "doanh thu dự kiến" — phải = 0 cho tới khi có inventory thật.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import leads as leads_store
from app.core import (
    audit_store,
    booking_store,
    commission_store,
    inventory_store,
    user_store,
)
from app.core.security import create_access_token
from app.core.settings import settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "bookings_file", str(tmp_path / "bookings.json"))
    monkeypatch.setattr(settings, "inventory_file", str(tmp_path / "inventory.json"))
    monkeypatch.setattr(settings, "internal_webhook_token", "tok")
    leads_store._LEADS.clear()
    audit_store.clear()
    booking_store.clear()
    commission_store.clear()
    inventory_store.clear()
    yield
    leads_store._LEADS.clear()
    booking_store.clear()
    commission_store.clear()
    inventory_store.clear()


def _admin_headers() -> dict:
    u = user_store.create_user(
        email="admin@elc.net", full_name="Admin", password_hash="x", role="admin"
    )
    token, _ = create_access_token(u["id"], {"role": "admin", "email": u["email"]})
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_kpi_zero_when_inventory_empty():
    """Store rỗng → cọc=0, doanh thu=0, inventory.is_demo=True (KHÔNG đếm mock)."""
    resp = client.get("/admin/dashboard/kpi", headers=_admin_headers())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["orders_this_month"] == 0
    assert data["revenue_projection_ty"] == 0
    assert data["inventory"]["is_demo"] is True
    # commission_rate luôn có và là số thật từ settings (không hardcode trong code).
    assert 0 < data["commission_rate"] < 1


def test_dashboard_kpi_uses_real_inventory():
    """Có inventory thật → cọc/doanh thu tính theo dữ liệu thật, is_demo=False."""
    inventory_store.replace_all(
        [
            {"id": "A-01", "phan_khu": "Z", "loai": "Liền kề",
             "trang_thai": "Đặt cọc", "gia_tri": 10.0},
            {"id": "A-02", "phan_khu": "Z", "loai": "Liền kề",
             "trang_thai": "Đã bán", "gia_tri": 20.0},
            {"id": "A-03", "phan_khu": "Z", "loai": "Liền kề",
             "trang_thai": "Còn hàng", "gia_tri": 5.0},
        ]
    )
    resp = client.get("/admin/dashboard/kpi", headers=_admin_headers())
    data = resp.json()
    assert data["inventory"]["is_demo"] is False
    assert data["orders_this_month"] == 1  # 1 căn đặt cọc
    assert data["inventory"]["total"] == 3
    # doanh thu = (10 + 20) * rate
    assert data["revenue_projection_ty"] == pytest.approx(30.0 * data["commission_rate"])


def test_kpi_today_zero_revenue_when_inventory_empty():
    """n8n /admin/kpi/today cũng không bịa doanh thu từ mock."""
    resp = client.get("/admin/kpi/today", headers={"X-Internal-Token": "tok"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["revenue_projection_ty"] == 0
