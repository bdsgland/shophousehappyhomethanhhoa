"""Test luồng Google Sign-in (/auth/google/*).

Mock Google API (exchange_code_for_userinfo) để không gọi mạng. Cô lập user
store bằng users.json tạm. Bật cấu hình OAuth giả qua monkeypatch settings.
"""

from __future__ import annotations

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import google_oauth, user_store
from app.core.settings import settings
from app.main import app

# follow_redirects=False để kiểm tra Location của 302.
client = TestClient(app, follow_redirects=False)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "users_file", str(tmp_path / "users.json"))
    monkeypatch.setattr(settings, "google_oauth_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "test-secret")
    monkeypatch.setattr(
        settings, "google_oauth_redirect_uri", "http://localhost:8000/auth/google/callback"
    )
    monkeypatch.setattr(settings, "frontend_url", "https://web.test")
    monkeypatch.setattr(settings, "admin_url", "https://admin.test")
    monkeypatch.setattr(settings, "google_workspace_domain", "happyhomethanhhoa.bdsg.land")
    yield


def _mock_userinfo(monkeypatch, *, email, sub="google-sub-123", name="Nguyen Van A"):
    def fake(code: str) -> dict:
        return {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "name": name,
            "picture": "https://lh3.google.com/a/pic.png",
        }

    monkeypatch.setattr(google_oauth, "exchange_code_for_userinfo", fake)


# ----- state JWT -----

def test_state_sign_and_verify_roundtrip():
    state = google_oauth.make_state(role="sale", ref="RAI-THU-1234", redirect_to="/agent")
    payload = google_oauth.verify_state(state)
    assert payload["role"] == "sale"
    assert payload["ref"] == "RAI-THU-1234"
    assert payload["next"] == "/agent"
    assert payload["purpose"] == "google_oauth_state"


def test_state_rejects_open_redirect():
    # redirect_to là URL tuyệt đối → bị loại, chỉ giữ path nội bộ.
    state = google_oauth.make_state(redirect_to="https://evil.com/steal")
    assert google_oauth.verify_state(state)["next"] is None


def test_verify_state_rejects_tampered():
    with pytest.raises(jwt.InvalidTokenError):
        google_oauth.verify_state("not.a.jwt")


# ----- /auth/google/login -----

def test_login_redirects_to_google():
    res = client.get("/auth/google/login?role=client")
    assert res.status_code == 302
    assert res.headers["location"].startswith(
        "https://accounts.google.com/o/oauth2/v2/auth"
    )
    assert "client_id=test-client-id" in res.headers["location"]


def test_login_503_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_oauth_client_id", "")
    res = client.get("/auth/google/login?role=client")
    assert res.status_code == 503


# ----- /auth/google/callback -----

def test_callback_creates_new_client_and_redirects(monkeypatch):
    _mock_userinfo(monkeypatch, email="newkhach@gmail.com")
    state = google_oauth.make_state(role="client")
    res = client.get(f"/auth/google/callback?code=abc&state={state}")
    assert res.status_code == 302
    loc = res.headers["location"]
    assert loc.startswith("https://web.test/auth/callback#")
    assert "token=" in loc
    assert "new_user=true" in loc
    # User đã được tạo trong store với role client + google_id.
    u = user_store.find_by_email("newkhach@gmail.com")
    assert u is not None
    assert u["role"] == "client"
    assert u["google_id"] == "google-sub-123"
    assert u["picture"]


def test_callback_reuses_existing_user(monkeypatch):
    from app.core.security import hash_password

    user_store.create_user(
        email="oldsale@gmail.com",
        full_name="Cũ",
        password_hash=hash_password("Passw0rd123"),
        role="sale",
    )
    _mock_userinfo(monkeypatch, email="oldsale@gmail.com", sub="g-sub-999")
    state = google_oauth.make_state(role="sale")
    res = client.get(f"/auth/google/callback?code=abc&state={state}")
    assert res.status_code == 302
    assert "new_user=false" in res.headers["location"]
    u = user_store.find_by_email("oldsale@gmail.com")
    assert u["google_id"] == "g-sub-999"  # đã được liên kết


def test_callback_admin_rejects_non_workspace(monkeypatch):
    _mock_userinfo(monkeypatch, email="someone@gmail.com")
    state = google_oauth.make_state(role="admin")
    res = client.get(f"/auth/google/callback?code=abc&state={state}")
    assert res.status_code == 302
    loc = res.headers["location"]
    assert loc.startswith("https://admin.test/auth/callback#error=not_workspace")
    # Không tạo user.
    assert user_store.find_by_email("someone@gmail.com") is None


def test_callback_admin_accepts_workspace(monkeypatch):
    _mock_userinfo(monkeypatch, email="boss@bdsg.land", sub="g-admin")
    state = google_oauth.make_state(role="admin")
    res = client.get(f"/auth/google/callback?code=abc&state={state}")
    assert res.status_code == 302
    loc = res.headers["location"]
    assert loc.startswith("https://admin.test/auth/callback#")
    assert "token=" in loc
    u = user_store.find_by_email("boss@bdsg.land")
    assert u["role"] == "admin"


def test_callback_admin_blocks_privilege_escalation(monkeypatch):
    # User client sẵn có, dù domain workspace, không được thành admin qua nút admin.
    from app.core.security import hash_password

    user_store.create_user(
        email="staff@bdsg.land",
        full_name="Nhân viên",
        password_hash=hash_password("Passw0rd123"),
        role="client",
    )
    _mock_userinfo(monkeypatch, email="staff@bdsg.land")
    state = google_oauth.make_state(role="admin")
    res = client.get(f"/auth/google/callback?code=abc&state={state}")
    assert "error=not_admin" in res.headers["location"]


def test_callback_invalid_state(monkeypatch):
    res = client.get("/auth/google/callback?code=abc&state=garbage")
    assert res.status_code == 302
    assert "error=invalid_state" in res.headers["location"]


def test_callback_propagates_google_error():
    res = client.get("/auth/google/callback?error=access_denied")
    assert res.status_code == 302
    assert "error=access_denied" in res.headers["location"]
