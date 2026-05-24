"""Test cơ bản — đảm bảo app khởi động và endpoint sống."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "agent-proptech-engine"


def test_chat_returns_reply():
    resp = client.post(
        "/agent/chat",
        json={
            "project_slug": "the-grand-tower",
            "messages": [
                {"role": "user", "content": "Cho tôi xin bảng giá và nhà mẫu nhé"}
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "reply" in body
    assert 0 <= body["intent_score"] <= 100


def test_lead_crud():
    create = client.post("/leads", json={"full_name": "Nguyễn Văn A", "phone": "0900000000"})
    assert create.status_code == 201
    lead_id = create.json()["id"]

    got = client.get(f"/leads/{lead_id}")
    assert got.status_code == 200
    assert got.json()["full_name"] == "Nguyễn Văn A"
