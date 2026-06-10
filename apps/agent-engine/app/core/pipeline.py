"""Luồng chuyển đổi (sales pipeline) — định nghĩa GIAI ĐOẠN + suy luận tự động.

Pipeline là lớp PHÁI SINH nằm TRÊN `status` lõi của lead (cold/warm/hot/customer/
lost) — KHÔNG phá enum status hiện có (CRM list vẫn chạy như cũ). Một lead có:
  • `status`         — vòng đời lõi (lead_store).
  • `pipeline_stage` — giai đoạn pipeline (tuỳ chọn; do sale/admin đặt tay hoặc
                       auto-advance ghi vào). Nếu trống → suy ra từ status + hành vi.

GIAI ĐOẠN (theo thứ tự đường đi):
    new (Mới) → contacted (Tiếp cận) → warm (Quan tâm) → hot (Nóng)
    → booked (Đặt lịch) → deposit (Đặt cọc) → contract (Hợp đồng)
    → customer (Khách hàng)            [đường thắng]
    lost (Mất)                          [đường mất — terminal riêng]

Suy luận tự động (`auto_pipeline_stage`) TÁI DÙNG `ai_crm.auto_pipeline` cho phần
status (cold/warm/hot) rồi MỞ RỘNG sang giai đoạn giao dịch dựa trên booking/quote.
Chỉ NÂNG cấp (không tự hạ bậc), không tự đẩy vào "lost".

Hàm thuần (không IO) để test dễ: derive_stage / auto_pipeline_stage / validate_stage.
"""

from __future__ import annotations

from typing import Optional

from app.core import ai_crm

# (key, nhãn tiếng Việt) — thứ tự = thứ tự hiển thị cột kanban.
STAGES: list[tuple[str, str]] = [
    ("new", "Mới"),
    ("contacted", "Tiếp cận"),
    ("warm", "Quan tâm"),
    ("hot", "Nóng"),
    ("booked", "Đặt lịch"),
    ("deposit", "Đặt cọc"),
    ("contract", "Hợp đồng"),
    ("customer", "Khách hàng"),
    ("lost", "Mất"),
]

STAGE_LABELS: dict[str, str] = {k: v for k, v in STAGES}
STAGE_KEYS: list[str] = [k for k, _ in STAGES]

# Thứ hạng trên ĐƯỜNG ĐI thắng (để so sánh "nâng cấp"). "lost" = -1 → auto-advance
# không bao giờ tự đẩy khách vào "mất".
_RANK: dict[str, int] = {
    "new": 0,
    "contacted": 1,
    "warm": 2,
    "hot": 3,
    "booked": 4,
    "deposit": 5,
    "contract": 6,
    "customer": 7,
    "lost": -1,
}

# Giai đoạn giao dịch chỉ đặt bằng tay (không suy ra tự động từ status).
_MANUAL_DEAL_STAGES = {"deposit", "contract"}


def stage_label(stage: Optional[str]) -> str:
    return STAGE_LABELS.get(stage or "", "Mới")


def stage_rank(stage: Optional[str]) -> int:
    return _RANK.get(stage or "", 0)


def validate_stage(stage: Optional[str]) -> bool:
    return stage in STAGE_LABELS


def stages_meta() -> list[dict]:
    """Danh sách giai đoạn (cấu hình) cho FE dựng cột kanban."""
    return [{"key": k, "label": v, "rank": _RANK.get(k, 0)} for k, v in STAGES]


def _derive_from_signals(lead: dict, has_booking: bool, has_deal: bool) -> str:
    """Suy giai đoạn từ status lõi + hành vi (booking/quote) khi chưa đặt tay."""
    status = lead.get("status")
    if status == "lost":
        return "lost"
    if status == "customer":
        return "customer"

    if status == "hot":
        base = "hot"
    elif status == "warm":
        base = "warm"
    elif status == "cold":
        base = "contacted" if (lead.get("contact_count", 0) or 0) > 0 else "new"
    else:
        base = "new"

    # Có booking → tối thiểu giai đoạn "Đặt lịch" (nếu chưa vượt qua).
    if has_booking and _RANK["booked"] > _RANK.get(base, 0):
        base = "booked"
    return base


def derive_stage(
    lead: dict,
    bookings: Optional[list] = None,
    quotes: Optional[list] = None,
) -> str:
    """Giai đoạn hiện tại của lead.

    Ưu tiên `pipeline_stage` đã lưu (đặt tay / auto-advance); nếu trống hoặc không
    hợp lệ thì suy từ status + hành vi (có booking/quote). An toàn với field thiếu.
    """
    saved = lead.get("pipeline_stage")
    if validate_stage(saved):
        return saved  # type: ignore[return-value]
    has_booking = bool(bookings)
    has_deal = bool(quotes) or has_booking
    return _derive_from_signals(lead, has_booking, has_deal)


def auto_pipeline_stage(
    lead: dict,
    bookings: Optional[list] = None,
    quotes: Optional[list] = None,
) -> Optional[str]:
    """Giai đoạn MỚI gợi ý theo điểm AI + hành vi. None = giữ nguyên.

    Tái dùng `ai_crm.auto_pipeline` cho nâng status (cold→warm→hot) rồi map sang
    giai đoạn pipeline + chèn "booked" nếu có booking. CHỈ NÂNG (so với giai đoạn
    hiện tại), không tự hạ bậc, không tự đẩy vào "lost", không đụng giai đoạn giao
    dịch đặt tay (deposit/contract).
    """
    current = derive_stage(lead, bookings, quotes)
    if current in _MANUAL_DEAL_STAGES or current in ("customer", "lost"):
        return None  # giữ giai đoạn cuối / đặt tay

    # Nâng status theo AI rồi suy lại giai đoạn từ signals (bỏ qua pipeline_stage cũ).
    promoted_status = ai_crm.auto_pipeline(lead)
    effective = dict(lead)
    if promoted_status:
        effective["status"] = promoted_status
    effective.pop("pipeline_stage", None)
    target = _derive_from_signals(effective, bool(bookings), bool(quotes) or bool(bookings))

    if stage_rank(target) > stage_rank(current):
        return target
    return None
