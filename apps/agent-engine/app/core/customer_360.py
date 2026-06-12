"""HỒ SƠ 360° KHÁCH HÀNG — gộp MỌI nguồn tương tác nối được vào 1 hồ sơ.

Nguồn dữ liệu & cách NỐI với 1 lead CRM (lead_store):
  • Contact logs (lead_store)  → nối trực tiếp theo `lead_id` (đa kênh: call/sms/
                                 zalo/facebook/email/inperson).
  • Bookings (booking_store)   → nối theo SĐT/email chuẩn hoá (booking.lead_id là
                                 id lead-chat in-memory, KHÁC namespace CRM).
  • Quotes (learning_store)    → nối theo SĐT chuẩn hoá (record có customer_phone).
  • Sự kiện AI                  → từ chính lead (ai_scored_at, hot_marker_at) +
                                 stage_history (đổi giai đoạn pipeline).
  • Khung sẵn (chưa nối được)  → Chatwoot / tổng đài: để placeholder, KHÔNG lỗi.

Thiết kế hàm THUẦN (nhận list đã load) để test dễ + tránh IO lặp:
  index_deals / find_deals_for_lead / build_timeline / build_channels /
  build_profile. `load_profile` là lớp orchestrate có IO (đọc store).

An toàn: sort timeline chịu được `time` None/sai định dạng (đẩy xuống cuối).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.core import booking_store, learning_store, lead_store, pipeline

# Nhãn kênh tương tác (đa kênh).
_CHANNEL_LABELS: dict[str, str] = {
    "call": "Gọi điện",
    "sms": "SMS",
    "zalo": "Zalo",
    "facebook": "Facebook",
    "email": "Email",
    "inperson": "Gặp trực tiếp",
    "note": "Ghi chú",
    "booking": "Đặt lịch",
    "quote": "Báo giá",
    "web": "Chat web",
    "chatwoot": "Chatwoot",
    "call_center": "Tổng đài",
    "ai": "AI",
    "system": "Hệ thống",
}

# Kênh BIẾT TRƯỚC nhưng CHƯA nối được dữ liệu theo khách → để khung sẵn (linked
# False) cho UI hiển thị, không gây lỗi khi chưa có nguồn.
_FRAMEWORK_CHANNELS = ("chatwoot", "call_center")

_DT_MIN = datetime.min


def channel_label(channel: Optional[str]) -> str:
    return _CHANNEL_LABELS.get(channel or "", channel or "Khác")


def _parse_dt(value) -> Optional[datetime]:
    """ISO8601 (có/không hậu tố Z) → datetime naive. None nếu trống/sai."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", ""))
    except (ValueError, TypeError):
        return None


def _sort_key(item: dict) -> datetime:
    """Key sort timeline an toàn với time None/sai (đẩy xuống cuối khi desc)."""
    return _parse_dt(item.get("time")) or _DT_MIN


# ---------------------------------------------------------------------------
# Nối nguồn giao dịch (booking/quote) theo SĐT/email
# ---------------------------------------------------------------------------

def _norm(phone: Optional[str]) -> str:
    return lead_store.normalize_phone(phone or "")


def _email(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def find_deals_for_lead(
    lead: dict, bookings: list[dict], quotes: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Lọc bookings + quotes thuộc về lead theo SĐT/email chuẩn hoá.

    `bookings`/`quotes` là toàn bộ list đã load (caller load 1 lần). Trả
    (bookings_của_lead, quotes_của_lead). An toàn khi lead thiếu phone/email.
    """
    lphone = _norm(lead.get("phone"))
    lemail = _email(lead.get("email"))

    def _match(rec: dict) -> bool:
        rphone = _norm(rec.get("customer_phone") or rec.get("phone"))
        remail = _email(rec.get("customer_email") or rec.get("email"))
        if lphone and rphone and lphone == rphone:
            return True
        if lemail and remail and lemail == remail:
            return True
        return False

    my_bookings = [b for b in bookings if _match(b)]
    my_quotes = [q for q in quotes if _match(q)]
    return my_bookings, my_quotes


# ---------------------------------------------------------------------------
# Timeline — gộp mọi tương tác theo thời gian
# ---------------------------------------------------------------------------

def _item(type_: str, channel: str, time, summary: str, ref: dict) -> dict:
    return {
        "type": type_,
        "channel": channel,
        "time": time,
        "summary": summary,
        "ref": ref,
    }


# Nhãn kết quả (outcome) cho dòng chăm sóc — cho summary đẹp kiểu mạng xã hội.
_OUTCOME_LABELS: dict[str, str] = {
    "no_answer": "Không nghe máy",
    "interested": "Quan tâm",
    "not_interested": "Không quan tâm",
    "callback": "Hẹn gọi lại",
    "booked": "Đã đặt lịch",
}


def outcome_label(outcome: Optional[str]) -> str:
    return _OUTCOME_LABELS.get(outcome or "", outcome or "")


# Nhãn trạng thái cuộc gọi tổng đài (Stringee) cho dòng timeline.
_CALL_STATUS_LABELS: dict[str, str] = {
    "calling": "Đang gọi",
    "ringing": "Đang đổ chuông",
    "answered": "Đã kết nối",
    "ended": "Đã kết thúc",
    "no_answer": "Không nghe máy",
    "busy": "Máy bận",
    "failed": "Gọi thất bại",
}


def _fmt_duration(seconds) -> Optional[str]:
    """Đổi giây → 'm:ss'. None nếu trống/không hợp lệ/<=0."""
    try:
        s = int(seconds)
    except (TypeError, ValueError):
        return None
    if s <= 0:
        return None
    return f"{s // 60}:{s % 60:02d}"


def _call_summary(log: dict) -> str:
    """Tóm tắt 1 cuộc gọi tổng đài: trạng thái + thời lượng (nếu có)."""
    label = _CALL_STATUS_LABELS.get(log.get("call_status") or "", "Cuộc gọi")
    dur = _fmt_duration(log.get("duration"))
    summary = f"[{channel_label('call_center')}] {label}"
    if dur:
        summary = f"{summary} · {dur}"
    return summary


def contact_log_item(log: dict) -> dict:
    """Dựng 1 mục timeline type='contact' từ 1 contact log (đa kênh / dòng chăm sóc).

    DÙNG CHUNG giữa build_timeline và endpoint POST care để FE prepend ĐÚNG hình
    dạng. Giữ hợp đồng 5 khoá {type, channel, time, summary, ref}; thông tin người
    đăng (actor_id/actor_name) nằm TRONG `ref` (mạng xã hội: hiện tên + thời gian).

    Cuộc gọi tổng đài (channel='call_center'): summary hiện trạng thái + thời lượng;
    `ref` kèm call_status/duration/recording_url để FE render nút nghe ghi âm.
    """
    ch = log.get("channel") or "system"
    outcome = log.get("outcome") or ""
    lnote = (log.get("note") or "").strip()
    if ch == "call_center":
        summary = _call_summary(log)
        if lnote:
            summary = f"{summary} — {lnote[:160]}"
    else:
        olabel = outcome_label(outcome)
        summary = f"[{channel_label(ch)}] {olabel}".rstrip()
        if lnote:
            summary = f"{summary} — {lnote[:160]}"
    ref = {
        "kind": "contact_log", "id": log.get("id"),
        "outcome": outcome, "sale_id": log.get("sale_id"),
        "actor_id": log.get("sale_id"),
        "actor_name": log.get("created_by_name"),
        "note": lnote or None,
    }
    # Bổ sung dữ liệu cuộc gọi (cho FE: nút nghe ghi âm + thời lượng + trạng thái).
    for key in ("call_status", "duration", "recording_url", "direction", "call_id"):
        if log.get(key) is not None:
            ref[key] = log.get(key)
    return _item("contact", ch, log.get("created_at"), summary, ref)


def build_timeline(
    lead: dict,
    contact_logs: list[dict],
    bookings: list[dict],
    quotes: list[dict],
) -> list[dict]:
    """Gộp MỌI tương tác thành 1 dòng thời gian, sort thời gian GIẢM DẦN.

    Mỗi mục: {type, channel, time, summary, ref}. Nguồn:
      • created  — mốc tạo hồ sơ.
      • contact  — contact log (đa kênh).
      • booking  — phiếu đặt lịch.
      • quote    — phiếu báo giá.
      • ai       — AI chấm điểm / đánh dấu hot.
      • stage    — đổi giai đoạn pipeline.
      • note     — ghi chú trên hồ sơ.
    """
    items: list[dict] = []

    # Mốc tạo hồ sơ.
    items.append(
        _item(
            "created", "system", lead.get("created_at"),
            f"Tạo hồ sơ khách (nguồn: {lead.get('source') or '—'})",
            {"kind": "created"},
        )
    )

    # Ghi chú hồ sơ (nếu có) — gắn mốc tạo.
    note = (lead.get("note") or "").strip()
    if note:
        items.append(
            _item("note", "system", lead.get("created_at"),
                  f"Ghi chú: {note[:200]}", {"kind": "note"})
        )

    # Contact logs (đa kênh) + dòng chăm sóc kiểu mạng xã hội.
    for log in contact_logs or []:
        items.append(contact_log_item(log))

    # Nhật ký hoạt động (vd "đã cập nhật thông tin") — nguồn riêng, không phải
    # contact log nên KHÔNG ảnh hưởng contact_count.
    for act in lead.get("activity_log") or []:
        by_name = act.get("by_name")
        items.append(
            _item("update", "system", act.get("at"),
                  act.get("summary") or "Cập nhật hồ sơ",
                  {"kind": "activity", "id": act.get("id"),
                   "activity_kind": act.get("kind"),
                   "actor_id": act.get("by"), "actor_name": by_name})
        )

    # Bookings.
    for b in bookings or []:
        unit = b.get("unit_summary") or b.get("unit_id") or "căn hộ"
        when = b.get("scheduled_at") or b.get("created_at")
        items.append(
            _item("booking", "booking", when,
                  f"Đặt lịch xem {unit} — {b.get('status') or 'pending'}",
                  {"kind": "booking", "id": b.get("id"),
                   "unit_id": b.get("unit_id"), "status": b.get("status")})
        )

    # Quotes.
    for q in quotes or []:
        total = q.get("total_price")
        total_str = f" — {int(total):,} đ" if isinstance(total, (int, float)) else ""
        items.append(
            _item("quote", "quote", q.get("created_at"),
                  f"Phiếu báo giá {q.get('unit_id') or ''}{total_str}".strip(),
                  {"kind": "quote", "id": q.get("quote_id"),
                   "unit_id": q.get("unit_id"), "total_price": total})
        )

    # Sự kiện AI.
    if lead.get("ai_scored_at"):
        reason = (lead.get("ai_reason") or "").strip()
        summary = f"AI chấm điểm {lead.get('ai_score', 0)} ({lead.get('ai_tier') or '—'})"
        if reason:
            summary = f"{summary} — {reason[:160]}"
        items.append(
            _item("ai", "ai", lead.get("ai_scored_at"), summary,
                  {"kind": "ai_score", "score": lead.get("ai_score", 0),
                   "tier": lead.get("ai_tier")})
        )
    if lead.get("hot_marker_at"):
        items.append(
            _item("ai", "system", lead.get("hot_marker_at"),
                  "Đánh dấu khách HOT", {"kind": "hot_marker"})
        )

    # Đổi giai đoạn pipeline.
    for h in lead.get("stage_history") or []:
        frm = pipeline.stage_label(h.get("from")) if h.get("from") else "—"
        to = pipeline.stage_label(h.get("to"))
        extra = f" ({h['note']})" if h.get("note") else ""
        items.append(
            _item("stage", "system", h.get("at"),
                  f"Chuyển giai đoạn: {frm} → {to}{extra}",
                  {"kind": "stage_change", "from": h.get("from"),
                   "to": h.get("to"), "by": h.get("by")})
        )

    items.sort(key=_sort_key, reverse=True)
    return items


# ---------------------------------------------------------------------------
# Kênh đã tương tác (đa kênh) + lần gần nhất mỗi kênh
# ---------------------------------------------------------------------------

def build_channels(contact_logs: list[dict], bookings: list[dict]) -> list[dict]:
    """Tổng hợp các kênh đã tương tác + lần gần nhất mỗi kênh.

    Dựa trên contact logs (đa kênh) + booking (kênh 'booking'). Bổ sung KHUNG SẴN
    cho kênh biết-trước-chưa-nối (Chatwoot, tổng đài) với linked=False để UI hiển
    thị đầy đủ khung mà không lỗi khi chưa có nguồn.
    """
    agg: dict[str, dict] = {}

    def _touch(channel: str, when, linked: bool = True) -> None:
        slot = agg.setdefault(
            channel,
            {"channel": channel, "label": channel_label(channel),
             "count": 0, "last_at": None, "linked": linked},
        )
        slot["count"] += 1
        slot["linked"] = slot["linked"] or linked
        prev = _parse_dt(slot["last_at"])
        cur = _parse_dt(when)
        if cur and (prev is None or cur > prev):
            slot["last_at"] = when

    for log in contact_logs or []:
        _touch(log.get("channel") or "system", log.get("created_at"))
    for b in bookings or []:
        _touch("booking", b.get("scheduled_at") or b.get("created_at"))

    # Khung sẵn cho nguồn chưa nối được theo khách.
    for ch in _FRAMEWORK_CHANNELS:
        agg.setdefault(
            ch,
            {"channel": ch, "label": channel_label(ch),
             "count": 0, "last_at": None, "linked": False},
        )

    out = list(agg.values())
    out.sort(key=lambda c: (_parse_dt(c["last_at"]) or _DT_MIN), reverse=True)
    return out


# ---------------------------------------------------------------------------
# Nối hội thoại Chatwoot thật (thay khung placeholder)
# ---------------------------------------------------------------------------

def _to_iso(value) -> Optional[str]:
    """Chuẩn hoá thời gian về ISO.

    Chatwoot trả epoch giây (int) cho created_at/last_activity_at trong khi CRM
    dùng ISO8601. Đổi epoch → ISO để timeline/khối kênh sort nhất quán. Giá trị
    đã là ISO thì giữ nguyên.
    """
    if value is None or value == "":
        return None
    try:
        ts = float(value)
        return datetime.utcfromtimestamp(ts).isoformat() + "Z"
    except (ValueError, TypeError):
        return str(value)


def apply_chatwoot(profile: dict, convos: list[dict]) -> dict:
    """Nối các hội thoại Chatwoot (đã match theo SĐT/email) vào hồ sơ 360.

    Thay KHUNG placeholder 'chatwoot' (linked=False) bằng dữ liệu thật:
      • Khối kênh : chatwoot → linked=True + count + last_at (lần gần nhất).
      • Timeline  : thêm 1 mục cho mỗi hội thoại (tin nhắn cuối), gắn link inbox.
    Sửa `profile` tại chỗ và trả về. `convos` rỗng → giữ nguyên placeholder.
    """
    if not convos:
        return profile

    iso_dates = [d for d in (_to_iso(c.get("last_at")) for c in convos) if d]
    latest = (
        max(iso_dates, key=lambda d: _parse_dt(d) or _DT_MIN) if iso_dates else None
    )

    # 1) Khối kênh: bật linked cho slot 'chatwoot'.
    channels = profile.setdefault("channels", [])
    slot = next((c for c in channels if c.get("channel") == "chatwoot"), None)
    if slot is None:
        slot = {"channel": "chatwoot", "label": channel_label("chatwoot")}
        channels.append(slot)
    slot["label"] = channel_label("chatwoot")
    slot["linked"] = True
    slot["count"] = len(convos)
    slot["last_at"] = latest
    channels.sort(key=lambda c: (_parse_dt(c.get("last_at")) or _DT_MIN), reverse=True)

    # 2) Timeline: thêm mục cho mỗi hội thoại Chatwoot.
    timeline = profile.setdefault("timeline", [])
    for c in convos:
        when = _to_iso(c.get("last_at"))
        sub = channel_label(c.get("channel")) if c.get("channel") else ""
        prefix = f"[Chatwoot · {sub}]" if sub and sub != "Chatwoot" else "[Chatwoot]"
        last_msg = c.get("last_message") or "Hội thoại Chatwoot"
        timeline.append(
            _item(
                "message",
                "chatwoot",
                when,
                f"{prefix} {last_msg}".strip(),
                {
                    "conversation_id": c.get("id"),
                    "channel": c.get("channel"),
                    "status": c.get("status"),
                    "contact": c.get("contact"),
                },
            )
        )
    timeline.sort(key=_sort_key, reverse=True)
    return profile


# ---------------------------------------------------------------------------
# Hồ sơ tổng hợp
# ---------------------------------------------------------------------------

def build_profile(
    lead: dict,
    contact_logs: list[dict],
    all_bookings: list[dict],
    all_quotes: list[dict],
    *,
    assigned_sale_name: Optional[str] = None,
    ai_salesman: Optional[dict] = None,
) -> dict:
    """Dựng hồ sơ 360° từ dữ liệu đã load (hàm thuần — không IO).

    `ai_salesman` (tuỳ chọn): khối sale AI đang phụ trách khách (id/name/chuyên môn)
    — tính năng Đội Sale AI. None nếu chưa gán / chưa seed roster.
    """
    my_bookings, my_quotes = find_deals_for_lead(lead, all_bookings, all_quotes)
    timeline = build_timeline(lead, contact_logs, my_bookings, my_quotes)
    channels = build_channels(contact_logs, my_bookings)
    stage = pipeline.derive_stage(lead, my_bookings, my_quotes)

    nba = lead.get("ai_next_action")
    ai_block = {
        "score": lead.get("ai_score", 0),
        "tier": lead.get("ai_tier"),
        "reason": lead.get("ai_reason"),
        "best_time": lead.get("ai_best_time"),
        "next_action": nba if isinstance(nba, dict) else None,
        "scored_at": lead.get("ai_scored_at"),
    }

    return {
        "lead_id": lead.get("id"),
        "basic": {
            "name": lead.get("name"),
            "phone": lead.get("phone"),
            "email": lead.get("email"),
            "source": lead.get("source"),
            "status": lead.get("status"),
            "assigned_sale_id": lead.get("assigned_sale_id"),
            "assigned_sale_name": assigned_sale_name,
            "registered": bool(lead.get("registered")),
            "note": lead.get("note"),
            # Trường phân loại / hồ sơ mở rộng (Customer 360).
            "region": lead.get("region"),
            "customer_group": lead.get("customer_group"),
            "product_type": lead.get("product_type"),
            "budget": lead.get("budget"),
            "purpose": lead.get("purpose"),
            "project": lead.get("project"),
            "created_at": lead.get("created_at"),
            "updated_at": lead.get("updated_at"),
        },
        "ai": ai_block,
        "ai_salesman": ai_salesman,
        "pipeline": {
            "stage": stage,
            "label": pipeline.stage_label(stage),
            "rank": pipeline.stage_rank(stage),
            "stages": pipeline.stages_meta(),
        },
        "timeline": timeline,
        "deals": {"bookings": my_bookings, "quotes": my_quotes},
        "channels": channels,
        "stats": {
            "contact_count": lead.get("contact_count", 0),
            "effective_contact_count": lead.get("effective_contact_count", 0),
            "booking_count": len(my_bookings),
            "quote_count": len(my_quotes),
            "days_since_contact": lead.get("days_since_contact"),
        },
    }


# ---------------------------------------------------------------------------
# Orchestrate có IO — đọc store rồi dựng hồ sơ
# ---------------------------------------------------------------------------

def load_profile(
    lead_id: str, *, assigned_sale_name: Optional[str] = None
) -> Optional[dict]:
    """Đọc lead + mọi nguồn nối được rồi dựng hồ sơ 360°. None nếu không có lead."""
    lead = lead_store.get_lead(lead_id)
    if not lead:
        return None
    contact_logs = lead_store.list_contact_logs(lead_id)
    all_bookings = booking_store.list_all()
    try:
        all_quotes = learning_store.list_quotes()
    except Exception:  # noqa: BLE001 — thiếu nguồn quote không làm hỏng hồ sơ
        all_quotes = []
    ai_salesman = _resolve_ai_salesman(lead.get("ai_salesman_id"))
    return build_profile(
        lead, contact_logs, all_bookings, all_quotes,
        assigned_sale_name=assigned_sale_name,
        ai_salesman=ai_salesman,
    )


def _resolve_ai_salesman(ais_id: Optional[str]) -> Optional[dict]:
    """Đọc khối sale AI đang phụ trách (id/name/chuyên môn) cho hồ sơ 360.

    An toàn: chưa gán / chưa seed roster / lỗi → None (không làm hỏng hồ sơ).
    """
    if not ais_id:
        return None
    try:
        from app.core import ai_salesman_store  # lazy import tránh vòng

        rec = ai_salesman_store.get(ais_id)
        if not rec:
            return None
        return {
            "id": rec.get("id"),
            "code": rec.get("code"),
            "name": rec.get("name"),
            "specialty": rec.get("specialty"),
            "specialty_label": rec.get("specialty_label"),
            "status": rec.get("status"),
            "assigned_count": rec.get("assigned_count"),
            "capacity": rec.get("capacity"),
        }
    except Exception:  # noqa: BLE001 — sale AI không được làm hỏng hồ sơ 360
        return None
