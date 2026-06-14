"""Auto-Care Engine — để "Đội Sale AI" TỰ ĐỘNG CHẠY chăm khách định kỳ.

`run_cycle()` quét các khách ĐƯỢC GÁN sale AI mà CẦN CHĂM (lâu chưa liên hệ, hoặc
đang nóng), chạy BỘ NÃO AI (crew/service) cho từng khách → tạo mục hành động NHÁP
vào hàng đợi (ai_care_queue_store). Thiết kế để n8n/cron gọi định kỳ qua endpoint
POST /admin/ai-sales/run-cycle.

AN TOÀN & CHỐNG TỐN TOKEN:
  - Chỉ tạo NHÁP, KHÔNG gửi gì cho khách (requires_confirmation).
  - batch_limit giới hạn số khách xử lý mỗi lần.
  - Quét hàng loạt dùng model RẺ (haiku) qua settings.ai_care_model; khách HOT dùng
    model mạnh hơn (crew_model_resolved) để chốt tốt hơn.
  - Dedupe: bỏ qua khách đã có mục pending/approved trong hàng đợi.
  - Lỗi 1 khách KHÔNG làm hỏng cả chu kỳ (gom vào errors).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.core import ai_care_queue_store, lead_store
from app.core.settings import settings

log = logging.getLogger("ai_care_engine")

# Trạng thái lead KHÔNG cần chăm (đã mất / đã chốt).
_SKIP_STATUSES = {"lost", "won", "closed"}

# Giới hạn số lead quét tối đa 1 chu kỳ (bảo vệ bộ nhớ/thời gian với data lớn).
_MAX_SCAN = 5000


def _needs_care(lead: dict, due_days: int) -> bool:
    """Khách có cần chăm không? (lâu chưa liên hệ HOẶC đang nóng chưa xử lý)."""
    status = (lead.get("status") or "").lower()
    if status in _SKIP_STATUSES:
        return False
    if status == "hot":
        return True
    days = lead.get("days_since_contact")
    if days is None:
        return True  # chưa từng liên hệ → cần tiếp cận
    try:
        return int(days) >= int(due_days)
    except (TypeError, ValueError):
        return False


def _priority(lead: dict) -> tuple:
    """Khoá sắp xếp ưu tiên: HOT trước, rồi lâu chưa liên hệ nhất, rồi ai_score cao."""
    status = (lead.get("status") or "").lower()
    hot = 0 if status == "hot" else 1
    days = lead.get("days_since_contact")
    days_val = 10_000 if days is None else int(days) if str(days).lstrip("-").isdigit() else 0
    score = lead.get("ai_score") or 0
    return (hot, -days_val, -score)


def _action_type(lead: dict, due_days: int) -> str:
    status = (lead.get("status") or "").lower()
    if status == "hot":
        return "hot_follow_up"
    days = lead.get("days_since_contact")
    if days is None:
        return "first_touch"
    try:
        if int(days) >= int(due_days):
            return "reengage"
    except (TypeError, ValueError):
        pass
    return "nurture"


def _gather_candidates(
    due_days: int, only_lead_ids: Optional[set] = None
) -> List[dict]:
    """Quét toàn bộ lead ĐƯỢC GÁN sale AI cần chăm (chưa có mục đang chờ).

    `only_lead_ids` (tuỳ chọn): nếu truyền vào → CHỈ xét các lead có id trong tập
    này (dùng cho chu kỳ chăm sóc PHẠM VI SÀN F2 — lọc cứng theo agency). None =
    quét toàn nền tảng (hành vi cũ, tương thích ngược)."""
    candidates: List[dict] = []
    scanned = 0
    page = 1
    page_size = 500
    while scanned < _MAX_SCAN:
        res = lead_store.list_all_leads(page=page, page_size=page_size)
        items = res.get("items", [])
        for lead in items:
            scanned += 1
            if only_lead_ids is not None and lead.get("id") not in only_lead_ids:
                continue
            if not lead.get("ai_salesman_id"):
                continue
            if not _needs_care(lead, due_days):
                continue
            if ai_care_queue_store.has_active_for_lead(lead.get("id")):
                continue
            candidates.append(lead)
        if page * page_size >= res.get("total", 0) or not items:
            break
        page += 1
    candidates.sort(key=_priority)
    return candidates


def run_cycle(
    *,
    due_days: Optional[int] = None,
    batch_limit: Optional[int] = None,
    channel: str = "zalo",
    requested_by: Optional[str] = None,
    dry_run: bool = False,
    only_lead_ids: Optional[set] = None,
) -> Dict[str, Any]:
    """Chạy 1 chu kỳ chăm sóc tự động. Trả tổng kết + danh sách mục đã tạo.

    `dry_run=True`: chỉ liệt kê ứng viên, KHÔNG gọi LLM / KHÔNG tạo mục (xem trước).
    `only_lead_ids` (tuỳ chọn): giới hạn chu kỳ trong tập lead này — dùng cho khu
    QUẢN TRỊ SÀN F2 (lọc cứng theo agency_id từ token). None = toàn nền tảng.
    """
    due_days = settings.ai_care_due_days if due_days is None else int(due_days)
    batch_limit = settings.ai_care_batch_limit if batch_limit is None else int(batch_limit)
    batch_limit = max(0, min(batch_limit, 200))

    result: Dict[str, Any] = {
        "ok": True,
        "enabled": settings.ai_care_enabled,
        "auto_send": settings.ai_care_auto_send,
        "due_days": due_days,
        "batch_limit": batch_limit,
        "dry_run": dry_run,
        "scanned_candidates": 0,
        "queued": 0,
        "errors": [],
        "items": [],
        "requires_confirmation": True,
        "auto_executed": False,
    }

    if not settings.ai_care_enabled:
        result["ok"] = False
        result["note"] = "ai_care_enabled=false → không tạo nháp. Bật env AI_CARE_ENABLED=true."
        return result

    candidates = _gather_candidates(due_days, only_lead_ids=only_lead_ids)
    result["scanned_candidates"] = len(candidates)
    selected = candidates[:batch_limit]

    if dry_run:
        result["items"] = [
            {
                "lead_id": l.get("id"),
                "lead_name": l.get("name"),
                "status": l.get("status"),
                "days_since_contact": l.get("days_since_contact"),
                "ai_salesman_id": l.get("ai_salesman_id"),
                "action_type": _action_type(l, due_days),
            }
            for l in selected
        ]
        return result

    from app.crew import service as crew_service  # lazy import (tránh phụ thuộc crewai khi load)

    strong_model = settings.crew_model_resolved()
    cheap_model = settings.ai_care_model_resolved()
    salesman_cache: Dict[str, Optional[dict]] = {}

    for lead in selected:
        lead_id = lead.get("id")
        status = (lead.get("status") or "").lower()
        use_model = strong_model if status == "hot" else cheap_model
        try:
            run = crew_service.run_for_lead(
                lead_id, channel=channel, requested_by=requested_by, model=use_model
            )
            if not run.get("ok"):
                result["errors"].append({"lead_id": lead_id, "error": "; ".join(run.get("notes", [])) or "run failed"})
                continue
            analysis = run.get("analysis", {}) or {}
            drafts = analysis.get("draft_messages") or []
            first = drafts[0] if drafts else {}
            nba = analysis.get("next_best_action") or {}

            ais_id = lead.get("ai_salesman_id")
            if ais_id not in salesman_cache:
                from app.core import ai_salesman_store

                salesman_cache[ais_id] = ai_salesman_store.get(ais_id) if ais_id else None
            salesman = salesman_cache.get(ais_id)

            item = ai_care_queue_store.create_item(
                lead_id=lead_id,
                lead_name=lead.get("name"),
                ai_salesman_id=ais_id,
                ai_salesman_name=(salesman or {}).get("name") if salesman else None,
                action_type=_action_type(lead, due_days),
                channel=str(first.get("channel") or channel),
                draft=str(first.get("draft") or ""),
                suggested_time=str(first.get("suggested_time") or nba.get("timing") or ""),
                summary=str(analysis.get("summary") or ""),
                potential_score=analysis.get("potential_score"),
                readiness=analysis.get("readiness"),
                reason=str(nba.get("reason") or analysis.get("potential_reason") or ""),
                matched_units=run.get("matched_units") or analysis.get("matched_units"),
                engine=analysis.get("engine"),
                model=analysis.get("model"),
                requested_by=requested_by,
            )
            result["items"].append(item)
            result["queued"] += 1
        except Exception as exc:  # noqa: BLE001 — 1 khách lỗi không làm hỏng chu kỳ
            log.warning("run_cycle lỗi cho lead %s: %s", lead_id, exc)
            result["errors"].append({"lead_id": lead_id, "error": str(exc)})

    return result
