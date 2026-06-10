"""Test Hồ sơ 360° + Luồng chuyển đổi (pipeline) — logic THUẦN, không gọi mạng.

Trọng tâm: gộp timeline đa nguồn, sort theo thời gian AN TOÀN với field None,
nối booking/quote theo SĐT/email, và suy luận giai đoạn pipeline.
"""

from __future__ import annotations

from app.core import customer_360, pipeline


# ---------------------------------------------------------------------------
# Nối nguồn booking/quote theo SĐT/email
# ---------------------------------------------------------------------------

def test_find_deals_match_by_phone_and_email():
    lead = {"id": "L1", "phone": "0901234567", "email": "A@Mail.com"}
    bookings = [
        {"id": "b1", "customer_phone": "+84901234567"},  # khớp phone (chuẩn hoá)
        {"id": "b2", "customer_phone": "0999999999"},     # không khớp
        {"id": "b3", "customer_email": "a@mail.com"},      # khớp email (lowercase)
    ]
    quotes = [
        {"quote_id": "q1", "customer_phone": "0901234567"},
        {"quote_id": "q2", "customer_phone": "0000000000"},
    ]
    my_bk, my_qt = customer_360.find_deals_for_lead(lead, bookings, quotes)
    assert {b["id"] for b in my_bk} == {"b1", "b3"}
    assert {q["quote_id"] for q in my_qt} == {"q1"}


def test_find_deals_safe_when_lead_missing_contacts():
    lead = {"id": "L1"}  # thiếu cả phone/email
    bk, qt = customer_360.find_deals_for_lead(lead, [{"customer_phone": "0901"}], [])
    assert bk == [] and qt == []


# ---------------------------------------------------------------------------
# Timeline — gộp + sort an toàn với None
# ---------------------------------------------------------------------------

def _lead_full():
    return {
        "id": "L1", "name": "Anh A", "phone": "0901234567", "email": "a@mail.com",
        "source": "fb_ads", "status": "warm", "note": "Quan tâm 2PN",
        "created_at": "2026-01-01T08:00:00Z",
        "updated_at": "2026-02-01T08:00:00Z",
        "ai_score": 72, "ai_tier": "warm", "ai_reason": "Tương tác tốt",
        "ai_scored_at": "2026-01-20T10:00:00Z",
        "hot_marker_at": None,
        "contact_count": 2, "effective_contact_count": 2,
        "stage_history": [
            {"from": "new", "to": "contacted", "at": "2026-01-05T09:00:00Z", "by": "s1"}
        ],
    }


def test_build_timeline_aggregates_all_sources_sorted_desc():
    lead = _lead_full()
    logs = [
        {"id": "c1", "channel": "call", "outcome": "interested",
         "note": "gọi lần 1", "created_at": "2026-01-10T09:00:00Z", "sale_id": "s1"},
        {"id": "c2", "channel": "zalo", "outcome": "callback",
         "note": "", "created_at": "2026-01-15T09:00:00Z", "sale_id": "s1"},
    ]
    bookings = [{"id": "b1", "unit_id": "A-12-08", "status": "pending",
                 "scheduled_at": "2026-01-25T03:00:00Z"}]
    quotes = [{"quote_id": "q1", "unit_id": "A-12-08", "total_price": 3500000000,
               "created_at": "2026-01-22T07:00:00Z"}]

    tl = customer_360.build_timeline(lead, logs, bookings, quotes)
    types = {i["type"] for i in tl}
    assert {"created", "note", "contact", "booking", "quote", "ai", "stage"} <= types

    # Sort GIẢM DẦN theo thời gian: booking (01-25) đứng trước contact (01-10).
    times = [customer_360._parse_dt(i["time"]) for i in tl if i["time"]]
    assert times == sorted(times, reverse=True)
    # Mỗi mục đủ khoá hợp đồng.
    for it in tl:
        assert set(it.keys()) == {"type", "channel", "time", "summary", "ref"}


def test_build_timeline_handles_none_time_safely():
    lead = {"id": "L1", "source": "manual", "created_at": None}
    logs = [
        {"id": "c1", "channel": "call", "outcome": "interested", "created_at": None},
        {"id": "c2", "channel": "sms", "outcome": "no_answer",
         "created_at": "2026-01-10T09:00:00Z"},
    ]
    tl = customer_360.build_timeline(lead, logs, [], [])  # không raise
    # Mục có thời gian thật phải nổi lên trên mục time None.
    assert tl[0]["time"] == "2026-01-10T09:00:00Z"
    assert tl[-1]["time"] is None


# ---------------------------------------------------------------------------
# Kênh đa kênh + lần gần nhất
# ---------------------------------------------------------------------------

def test_build_channels_last_per_channel_and_framework():
    logs = [
        {"channel": "call", "created_at": "2026-01-10T09:00:00Z"},
        {"channel": "call", "created_at": "2026-01-20T09:00:00Z"},  # gần hơn
        {"channel": "zalo", "created_at": "2026-01-15T09:00:00Z"},
    ]
    chans = {c["channel"]: c for c in customer_360.build_channels(logs, [])}
    assert chans["call"]["count"] == 2
    assert chans["call"]["last_at"] == "2026-01-20T09:00:00Z"
    assert chans["call"]["linked"] is True
    # Khung sẵn cho nguồn chưa nối.
    assert chans["chatwoot"]["linked"] is False
    assert chans["call_center"]["count"] == 0


# ---------------------------------------------------------------------------
# Pipeline — suy luận giai đoạn
# ---------------------------------------------------------------------------

def test_derive_stage_from_status_and_behavior():
    assert pipeline.derive_stage({"status": "cold", "contact_count": 0}) == "new"
    assert pipeline.derive_stage({"status": "cold", "contact_count": 3}) == "contacted"
    assert pipeline.derive_stage({"status": "warm"}) == "warm"
    assert pipeline.derive_stage({"status": "hot"}) == "hot"
    assert pipeline.derive_stage({"status": "lost"}) == "lost"
    assert pipeline.derive_stage({"status": "customer"}) == "customer"
    # Có booking → tối thiểu 'booked' dù status mới warm.
    assert pipeline.derive_stage({"status": "warm"}, bookings=[{"id": "b1"}]) == "booked"


def test_derive_stage_manual_override_wins():
    lead = {"status": "cold", "contact_count": 0, "pipeline_stage": "deposit"}
    assert pipeline.derive_stage(lead) == "deposit"


def test_auto_pipeline_stage_only_promotes():
    # Giai đoạn lưu đang thấp (warm) nhưng AI=90 + có booking → nâng lên 'booked'.
    lead = {"status": "warm", "pipeline_stage": "warm", "ai_score": 90,
            "registered": True, "booking_count": 1}
    suggested = pipeline.auto_pipeline_stage(lead, bookings=[{"id": "b1"}], quotes=[])
    assert suggested == "booked"
    # Đã ở đúng giai đoạn suy luận → không có gì để nâng (None).
    lead_at_target = {"status": "hot", "ai_score": 90, "registered": True,
                      "booking_count": 1}
    assert pipeline.auto_pipeline_stage(
        lead_at_target, bookings=[{"id": "b1"}]) is None
    # Đã ở giai đoạn giao dịch đặt tay → không tự đổi.
    lead2 = {"status": "hot", "pipeline_stage": "contract"}
    assert pipeline.auto_pipeline_stage(lead2) is None
    # Không bao giờ tự đẩy vào 'lost'.
    lead3 = {"status": "cold", "contact_count": 0, "ai_score": 0}
    assert pipeline.auto_pipeline_stage(lead3) in (None, "contacted", "new")


def test_validate_stage():
    assert pipeline.validate_stage("hot")
    assert not pipeline.validate_stage("khong_ton_tai")
    assert len(pipeline.stages_meta()) == len(pipeline.STAGE_KEYS)


# ---------------------------------------------------------------------------
# build_profile end-to-end (thuần)
# ---------------------------------------------------------------------------

def test_build_profile_shape():
    lead = _lead_full()
    logs = [{"id": "c1", "channel": "call", "outcome": "interested",
             "created_at": "2026-01-10T09:00:00Z"}]
    bookings = [{"id": "b1", "customer_phone": "0901234567", "unit_id": "A1",
                 "status": "pending", "scheduled_at": "2026-01-25T03:00:00Z"}]
    quotes = [{"quote_id": "q1", "customer_phone": "0901234567", "unit_id": "A1",
               "total_price": 3000000000, "created_at": "2026-01-22T07:00:00Z"}]
    prof = customer_360.build_profile(lead, logs, bookings, quotes,
                                      assigned_sale_name="Sale 1")
    assert prof["lead_id"] == "L1"
    assert prof["basic"]["assigned_sale_name"] == "Sale 1"
    assert prof["ai"]["score"] == 72
    assert prof["stats"]["booking_count"] == 1
    assert prof["stats"]["quote_count"] == 1
    assert prof["pipeline"]["stage"] == "booked"  # warm + có booking
    assert len(prof["deals"]["bookings"]) == 1
    assert any(c["channel"] == "call" for c in prof["channels"])
