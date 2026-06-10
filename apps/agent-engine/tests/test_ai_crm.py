"""Test AI CRM (Phần B) — logic thuần: parse JSON, fallback, auto_pipeline.

KHÔNG gọi mạng: ép fallback bằng use_mock_llm=True (mặc định) + không API key.
Async chạy qua asyncio.run để khỏi phụ thuộc pytest-asyncio.
"""

from __future__ import annotations

import asyncio

import pytest

from app.core import ai_crm, lead_store
from app.core.settings import settings


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "leads_file", str(tmp_path / "leads.json"))
    monkeypatch.setattr(settings, "contact_logs_file", str(tmp_path / "logs.json"))
    # Ép fallback (không gọi Claude thật).
    monkeypatch.setattr(settings, "use_mock_llm", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    lead_store.clear()
    yield
    lead_store.clear()


# ---------------------------------------------------------------------------
# Parse JSON output
# ---------------------------------------------------------------------------

def test_parse_json_plain():
    assert ai_crm._parse_json_block('{"score": 70, "tier": "warm"}') == {
        "score": 70,
        "tier": "warm",
    }


def test_parse_json_codefence():
    text = '```json\n{"score": 85, "tier": "hot", "reason": "x"}\n```'
    obj = ai_crm._parse_json_block(text)
    assert obj["score"] == 85 and obj["tier"] == "hot"


def test_parse_json_with_surrounding_text():
    text = 'Đây là kết quả: {"score": 40, "tier": "cold"} hết.'
    assert ai_crm._parse_json_block(text)["score"] == 40


def test_parse_json_garbage_returns_none():
    assert ai_crm._parse_json_block("không phải json") is None
    assert ai_crm._parse_json_block("") is None
    assert ai_crm._parse_json_block("[1,2,3]") is None  # không phải object


# ---------------------------------------------------------------------------
# Coerce score (chuẩn hoá output LLM)
# ---------------------------------------------------------------------------

def test_coerce_score_clamps_and_derives_tier():
    out = ai_crm._coerce_score({"score": 150, "tier": "bogus", "reason": "r"})
    assert out["score"] == 100
    assert out["tier"] == "hot"  # derive từ score


def test_coerce_score_invalid_returns_none():
    assert ai_crm._coerce_score({"tier": "hot"}) is None
    assert ai_crm._coerce_score(None) is None
    assert ai_crm._coerce_score({"score": "abc"}) is None


def test_tier_thresholds():
    assert ai_crm._tier_for(80) == "hot"
    assert ai_crm._tier_for(50) == "warm"
    assert ai_crm._tier_for(49) == "cold"


# ---------------------------------------------------------------------------
# auto_pipeline — chỉ nâng, không hạ; không đụng status cuối
# ---------------------------------------------------------------------------

def test_auto_pipeline_promotes_hot():
    assert ai_crm.auto_pipeline({"status": "cold", "ai_score": 90}) == "hot"


def test_auto_pipeline_promotes_warm():
    assert ai_crm.auto_pipeline({"status": "cold", "ai_score": 55}) == "warm"


def test_auto_pipeline_no_downgrade():
    # đang hot, score thấp → giữ nguyên (None)
    assert ai_crm.auto_pipeline({"status": "hot", "ai_score": 10}) is None


def test_auto_pipeline_keeps_terminal():
    assert ai_crm.auto_pipeline({"status": "customer", "ai_score": 5}) is None
    assert ai_crm.auto_pipeline({"status": "lost", "ai_score": 95}) is None


def test_auto_pipeline_behavior_hot():
    lead = {"status": "warm", "ai_score": 0, "registered": True, "booking_count": 1}
    assert ai_crm.auto_pipeline(lead) == "hot"


# ---------------------------------------------------------------------------
# Fallback intent (keyword)
# ---------------------------------------------------------------------------

def test_fallback_intent_close():
    out = ai_crm._fallback_intent("Em muốn đặt cọc căn này luôn")
    assert out["intent"] == "ready_to_close"
    assert out["heat"] > 0


def test_fallback_intent_general():
    out = ai_crm._fallback_intent("xin chào")
    assert out["intent"] == "general"
    assert out["heat"] == 0


# ---------------------------------------------------------------------------
# Async fallback path (không mạng)
# ---------------------------------------------------------------------------

def test_score_lead_fallback():
    lead = {"registered": True, "booking_count": 1, "note": "x" * 60}
    out = asyncio.run(ai_crm.score_lead(lead, []))
    assert 0 <= out["score"] <= 100
    assert out["tier"] in {"cold", "warm", "hot"}
    assert out["reason"]


def test_classify_intent_fallback_no_llm():
    out = asyncio.run(ai_crm.classify_intent("cho em xem nhà mẫu với"))
    assert out["intent"] == "schedule_visit"


def test_rescore_persists_and_caches():
    lead = lead_store.create_lead(
        {"name": "A", "phone": "0900000001", "source": "imported"}
    )
    lid = lead["id"]
    # Lần 1: chấm mới.
    n = asyncio.run(ai_crm.rescore_leads([lid]))
    assert n == 1
    stored = lead_store.get_lead(lid)
    assert stored["ai_scored_at"]
    assert stored["ai_tier"] in {"cold", "warm", "hot"}
    assert stored["ai_best_time"]
    assert isinstance(stored["ai_next_action"], dict)
    # Lần 2: đã chấm & chưa update → cache, không chấm lại.
    n2 = asyncio.run(ai_crm.rescore_leads([lid]))
    assert n2 == 0
    # force=True → chấm lại.
    n3 = asyncio.run(ai_crm.rescore_leads([lid], force=True))
    assert n3 == 1


def test_rescore_batch_limit(monkeypatch):
    monkeypatch.setattr(settings, "ai_crm_batch_limit", 2)
    for i in range(5):
        lead_store.create_lead(
            {"name": f"K{i}", "phone": f"09000010{i}", "source": "imported"}
        )
    n = asyncio.run(ai_crm.rescore_leads("all"))
    assert n == 2  # giới hạn batch


def test_rescore_all_skips_lost():
    a = lead_store.create_lead({"name": "A", "phone": "0900000201"})
    b = lead_store.create_lead({"name": "B", "phone": "0900000202"})
    lead_store.soft_delete(b["id"])  # status=lost
    ids = ai_crm._resolve_ids("all")
    assert a["id"] in ids
    assert b["id"] not in ids
