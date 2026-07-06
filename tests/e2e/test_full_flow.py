"""End-to-end test cho quy trình hoàn chỉnh Happy Home.

Chạy thẳng vào API production (api-happyhomethanhhoa.bdsg.land) để xác minh
luồng khách hàng từ đăng ký → đăng nhập → xem kho căn → yêu thích → đặt lịch.

Cách chạy:
    cd /Users/phamvanthu/Documents/Agent-Proptech
    python tests/e2e/test_full_flow.py

Tuỳ chọn (đổi API base khi test local):
    E2E_BASE_URL=http://localhost:8000 python tests/e2e/test_full_flow.py

Các bước sale/admin (xem booking, hoa hồng) chỉ chạy khi cung cấp credential
thật qua biến môi trường — KHÔNG hardcode mật khẩu của ai trong file này:
    E2E_SALE_EMAIL=...  E2E_SALE_PASSWORD=...
    E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=...
"""
from __future__ import annotations

import os
import sys
import uuid

import requests

BASE_URL = os.environ.get("E2E_BASE_URL", "https://api-happyhomethanhhoa.bdsg.land").rstrip("/")
PROJECT_SLUG = "happy-home-thanh-hoa"  # khớp inventory.SLUG
TIMEOUT = 20


def _p(msg: str) -> None:
    print(msg, flush=True)


def test_complete_flow() -> None:
    """Quy trình hoàn chỉnh phía khách hàng (đăng ký được công khai).

    1. Khách register (role=client)
    2. Khách login → JWT
    3. Khách get inventory list
    4. Khách favorite 1 căn → verify đã lưu
    5. Khách tạo booking → verify hiện trong /me/bookings
    (6-8 sale/admin: chỉ chạy nếu có credential thật qua env)
    """
    test_email = f"e2e_test_{uuid.uuid4().hex[:8]}@hhth.test"
    password = "Test123!@#"
    _p(f"\n🌐 API base: {BASE_URL}")
    _p(f"👤 Test user: {test_email}")

    # 1. Register client -----------------------------------------------------
    r = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": test_email,
            "password": password,
            "full_name": "E2E Test User",
            "phone": "0900000000",
            "role": "client",
        },
        timeout=TIMEOUT,
    )
    assert r.status_code in (200, 201), f"[1] Register fail {r.status_code}: {r.text}"
    assert r.json().get("access_token"), f"[1] Register thiếu access_token: {r.text}"
    _p("✅ [1] Register client OK")

    # 2. Login ---------------------------------------------------------------
    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": test_email, "password": password},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"[2] Login fail {r.status_code}: {r.text}"
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    _p("✅ [2] Login OK (có JWT)")

    # 3. Get inventory -------------------------------------------------------
    r = requests.get(f"{BASE_URL}/inventory/{PROJECT_SLUG}/units", timeout=TIMEOUT)
    assert r.status_code == 200, f"[3] Inventory fail {r.status_code}: {r.text}"
    units = r.json()
    assert isinstance(units, list) and units, f"[3] Inventory rỗng: {r.text}"
    unit_id = units[0]["id"]
    _p(f"✅ [3] Inventory OK ({len(units)} căn) → chọn {unit_id}")

    # 4. Favorite (POST /me/favorites/{unit_id}, cần auth) -------------------
    r = requests.post(
        f"{BASE_URL}/me/favorites/{unit_id}", headers=headers, timeout=TIMEOUT
    )
    assert r.status_code in (200, 201), f"[4] Favorite fail {r.status_code}: {r.text}"
    r = requests.get(f"{BASE_URL}/me/favorites", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"[4] List favorite fail {r.status_code}: {r.text}"
    assert unit_id in r.json().get("unit_ids", []), f"[4] Favorite chưa lưu: {r.text}"
    _p(f"✅ [4] Favorite OK ({unit_id} đã lưu)")

    # 5. Create booking (open endpoint, optional auth) -----------------------
    r = requests.post(
        f"{BASE_URL}/bookings",
        headers=headers,
        json={
            "unit_id": unit_id,
            "scheduled_at": "2026-06-15T10:00:00",
            "customer_name": "E2E Test User",
            "customer_phone": "0900000000",
            "customer_email": test_email,
            "notes": "E2E test booking",
        },
        timeout=TIMEOUT,
    )
    assert r.status_code in (200, 201), f"[5] Booking fail {r.status_code}: {r.text}"
    booking_id = r.json()["id"]
    _p(f"✅ [5] Booking OK → {booking_id}")

    # 5b. Verify booking hiện trong /me/bookings -----------------------------
    r = requests.get(f"{BASE_URL}/me/bookings", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"[5b] /me/bookings fail {r.status_code}: {r.text}"
    ids = [b["id"] for b in r.json()]
    assert booking_id in ids, f"[5b] Booking không thấy trong /me/bookings: {ids}"
    _p("✅ [5b] Booking hiện trong /me/bookings")

    # 6. Sale xem booking (chỉ khi có credential thật qua env) ---------------
    sale_email = os.environ.get("E2E_SALE_EMAIL")
    sale_pw = os.environ.get("E2E_SALE_PASSWORD")
    if sale_email and sale_pw:
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": sale_email, "password": sale_pw},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"[6] Sale login fail: {r.text}"
        sh = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = requests.get(f"{BASE_URL}/bookings", headers=sh, timeout=TIMEOUT)
        assert r.status_code == 200, f"[6] Sale list bookings fail: {r.text}"
        _p("✅ [6] Sale login + xem booking OK")
    else:
        _p("⏭️  [6] Bỏ qua bước Sale (chưa set E2E_SALE_EMAIL/PASSWORD)")

    # 7. Admin xem tổng quan (chỉ khi có credential thật qua env) ------------
    admin_email = os.environ.get("E2E_ADMIN_EMAIL")
    admin_pw = os.environ.get("E2E_ADMIN_PASSWORD")
    if admin_email and admin_pw:
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": admin_email, "password": admin_pw},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, f"[7] Admin login fail: {r.text}"
        ah = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = requests.get(f"{BASE_URL}/bookings", headers=ah, timeout=TIMEOUT)
        assert r.status_code == 200, f"[7] Admin list bookings fail: {r.text}"
        _p("✅ [7] Admin login + xem booking OK")
    else:
        _p("⏭️  [7] Bỏ qua bước Admin (chưa set E2E_ADMIN_EMAIL/PASSWORD)")

    _p("\n🎉 E2E PASS! Luồng khách hàng hoạt động đầy đủ.")
    _p(f"   Test user : {test_email}")
    _p(f"   Unit      : {unit_id}")
    _p(f"   Booking   : {booking_id}")


if __name__ == "__main__":
    try:
        test_complete_flow()
    except AssertionError as e:
        _p(f"\n❌ E2E FAIL: {e}")
        sys.exit(1)
    except requests.RequestException as e:
        _p(f"\n❌ E2E FAIL (network): {e}")
        sys.exit(2)
