"""Integration test webhook Chatwoot Agent Bot.

Dùng TestClient của Starlette — BackgroundTasks chạy đồng bộ trước khi response
trả về, nên có thể assert ngay các call ra Chatwoot.

Mọi outbound HTTP đi qua webhook._chatwoot_request → ta monkeypatch hàm này để
ghi lại call thay vì gọi mạng thật.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import webhook
from app.core.settings import settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
    """Reset store in-memory + ép mock LLM mặc định (độc lập với .env)."""
    webhook._HISTORY.clear()
    webhook._CONTACT_TO_LEAD.clear()
    monkeypatch.setattr(settings, "use_mock_llm", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "chatwoot_bds_team_id", 0)
    yield


@pytest.fixture
def captured(monkeypatch):
    """Thay _chatwoot_request bằng recorder. Trả list các (method, path, json)."""
    calls: list[tuple[str, str, dict | None]] = []

    async def _fake(method, path, json=None):
        calls.append((method, path, json))
        return {}

    monkeypatch.setattr(webhook, "_chatwoot_request", _fake)
    return calls


def _payload(content: str = "xin chào", **over) -> dict:
    base = {
        "event": "message_created",
        "id": 123,
        "content": content,
        "message_type": "incoming",
        "content_type": "text",
        "private": False,
        "conversation": {
            "id": 456,
            "channel": "Channel::WebWidget",
            "status": "open",
            "contact_inbox": {"contact_id": 789, "inbox_id": 1},
        },
        "sender": {
            "id": 789,
            "name": "Khách Hàng",
            "email": "khachhang@gmail.com",
            "phone_number": "+84900000001",
        },
        "account": {"id": 1},
    }
    base.update(over)
    return base


def _msg_paths(calls):
    return [path for (m, path, j) in calls if path.endswith("/messages")]


def test_incoming_message_triggers_reply_and_creates_lead(captured):
    resp = client.post("/webhook/chatwoot", json=_payload("Tôi muốn xem căn 2PN giá khoảng 3 tỷ"))
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"

    # Đã gửi đúng 1 message outgoing về Chatwoot.
    msg_calls = [(m, p, j) for (m, p, j) in captured if p.endswith("/messages")]
    assert len(msg_calls) == 1
    method, path, body = msg_calls[0]
    assert method == "POST"
    assert path == "/api/v1/accounts/1/conversations/456/messages"
    assert body["message_type"] == "outgoing"
    assert body["private"] is False
    assert body["content"]  # có nội dung

    # Lead được tạo và link với contact_id.
    assert 789 in webhook._CONTACT_TO_LEAD
    lead = webhook.leads_store._LEADS[webhook._CONTACT_TO_LEAD[789]]
    assert lead.source_channel == "chatwoot"
    assert lead.phone == "+84900000001"
    assert lead.project_slug == settings.elc_project_slug

    # Lịch sử hội thoại có cả tin khách lẫn tin AI.
    assert [m.role for m in webhook._HISTORY[456]] == ["user", "assistant"]


@pytest.mark.parametrize(
    "over",
    [
        {"message_type": "outgoing"},   # reply của agent/bot
        {"private": True},               # ghi chú nội bộ
        {"event": "conversation_updated"},  # sự kiện khác
        {"content": "   "},              # rỗng
    ],
)
def test_ignored_events_do_not_call_chatwoot(captured, over):
    body = _payload("xin chào")
    body.update(over)
    resp = client.post("/webhook/chatwoot", json=body)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"
    assert captured == []


def test_handoff_intent_assigns_team_and_labels(captured, monkeypatch):
    monkeypatch.setattr(settings, "chatwoot_bds_team_id", 7)

    resp = client.post("/webhook/chatwoot", json=_payload("Cho em đặt cọc căn 2PN, gọi lại cho tôi nhé"))
    assert resp.status_code == 200

    paths = [p for (m, p, j) in captured]
    assert any(p.endswith("/messages") for p in paths)        # vẫn trả lời khách
    assert any(p.endswith("/labels") for p in paths)          # gắn nhãn hot-lead
    assert any(p.endswith("/assignments") for p in paths)     # assign team BĐS
    assert any(p.endswith("/toggle_status") for p in paths)   # set open

    label_body = next(j for (m, p, j) in captured if p.endswith("/labels"))
    assert settings.chatwoot_hot_lead_label in label_body["labels"]
    assign_body = next(j for (m, p, j) in captured if p.endswith("/assignments"))
    assert assign_body["team_id"] == 7

    lead = webhook.leads_store._LEADS[webhook._CONTACT_TO_LEAD[789]]
    assert lead.status == "hot"
    assert lead.intent_score >= settings.lead_hot_score_threshold


def test_calls_anthropic_and_retrieval_when_enabled(captured, monkeypatch):
    """Khi có API key + tắt mock: phải gọi Claude (stream) + retrieval."""
    monkeypatch.setattr(settings, "use_mock_llm", False)
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test-xxx")

    retrieval_called = {"n": 0}
    real_retrieve = webhook._retrieve_context

    def _spy_retrieve(query):
        retrieval_called["n"] += 1
        return real_retrieve(query)

    monkeypatch.setattr(webhook, "_retrieve_context", _spy_retrieve)

    # Fake Anthropic AsyncAnthropic với streaming.
    class _StreamCtx:
        def __init__(self):
            self.text_stream = self._gen()

        async def _gen(self):
            for tok in ["Dạ ", "em ", "tư vấn ", "ngay ạ."]:
                yield tok

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    class _Messages:
        def stream(self, **kwargs):
            assert kwargs["model"]
            assert kwargs["messages"][-1]["role"] == "user"
            return _StreamCtx()

    class _FakeAnthropic:
        def __init__(self, *a, **k):
            self.messages = _Messages()

    import anthropic

    monkeypatch.setattr(anthropic, "AsyncAnthropic", _FakeAnthropic)

    resp = client.post("/webhook/chatwoot", json=_payload("Giá căn 2PN bao nhiêu?"))
    assert resp.status_code == 200

    assert retrieval_called["n"] == 1
    sent = next(j for (m, p, j) in captured if p.endswith("/messages"))
    assert sent["content"] == "Dạ em tư vấn ngay ạ."
