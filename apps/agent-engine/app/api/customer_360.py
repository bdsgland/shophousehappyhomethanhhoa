"""API Hồ sơ 360° khách hàng.

  • GET /crm/leads/{lead_id}/profile-360   — hồ sơ 360 tổng hợp (sale-or-admin,
    sale chỉ xem khách của mình). Tuỳ chọn ?rescore=true để trigger AI rescore +
    sinh next_action (tái dùng ai_crm) trước khi dựng hồ sơ — "AI chấm điểm tư
    vấn tự động" khi mở hồ sơ.

Auth theo convention deps.py: require_sale (admin cũng qua được); phân tách dữ
liệu (sale chỉ thao tác lead có assigned_sale_id == mình) ở tầng endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

import logging

from app.api.deps import require_admin, require_sale
from app.core import (
    ai_crm,
    chatwoot_client,
    customer_360,
    lead_store,
    sale_task_store,
    user_store,
)
from app.schemas.crm import CareLogCreate, ContactLog

log = logging.getLogger(__name__)

router = APIRouter(prefix="/crm", tags=["crm-360"])


def _owned_lead(lead_id: str, user: dict) -> dict:
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    if user.get("role") != "admin" and lead.get("assigned_sale_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Khách hàng không thuộc về bạn")
    return lead


def _sale_name(sale_id):
    if not sale_id:
        return None
    u = user_store.find_by_id(sale_id)
    return u.get("full_name") if u else None


@router.get("/leads/{lead_id}/profile-360")
async def get_profile_360(
    lead_id: str,
    rescore: bool = Query(default=False, description="Trigger AI rescore trước khi dựng hồ sơ"),
    user: dict = Depends(require_sale),
) -> dict:
    """Hồ sơ 360° của 1 khách: cơ bản + AI + timeline đa nguồn + giao dịch + kênh."""
    lead = _owned_lead(lead_id, user)
    if rescore:
        # Tái dùng ai_crm: chấm lại điểm + sinh best_time/next_action.
        await ai_crm.rescore_leads([lead_id], force=True)
    profile = customer_360.load_profile(
        lead_id, assigned_sale_name=_sale_name(lead.get("assigned_sale_id"))
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    # Nối hội thoại Chatwoot match theo SĐT/email (thay khung placeholder). An
    # toàn: chưa cấu hình / Chatwoot down → trả [] → giữ nguyên placeholder.
    try:
        convos = await chatwoot_client.conversations_for_lead(lead)
        if convos:
            customer_360.apply_chatwoot(profile, convos)
    except Exception as exc:  # noqa: BLE001 — không để Chatwoot làm sập hồ sơ 360
        log.warning("[360] nối Chatwoot lỗi cho lead %s: %s", lead_id, exc)
    return profile


@router.get("/leads/{lead_id}/conversations")
async def get_lead_conversations(
    lead_id: str,
    user: dict = Depends(require_admin),
) -> dict:
    """TOÀN BỘ hội thoại đa kênh của 1 khách — hợp nhất 1 timeline tin nhắn.

    Gộp: hội thoại Chatwoot match theo SĐT/email của lead (Zalo/FB/email/web, kèm
    tin nhắn + deep link) + log liên hệ/care nội bộ. Chỉ admin (require_admin).

    Fallback an toàn: Chatwoot CHƯA cấu hình / lỗi → vẫn trả log nội bộ, KHÔNG
    crash; `chatwoot.configured=False` để FE báo "Chatwoot chưa kết nối".
    """
    lead = lead_store.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

    contact_logs = lead_store.list_contact_logs(lead_id)

    cfg = chatwoot_client.config_status()
    threads: list[dict] = []
    cw_error = False
    if cfg.get("configured"):
        try:
            threads = await chatwoot_client.conversation_threads_for_lead(lead)
        except Exception as exc:  # noqa: BLE001 — Chatwoot không được làm sập khối hội thoại
            cw_error = True
            log.warning("[360] kéo hội thoại Chatwoot lỗi cho lead %s: %s", lead_id, exc)

    result = customer_360.build_conversations(lead, contact_logs, threads)
    result["chatwoot"] = {
        "configured": bool(cfg.get("configured")),
        "error": cw_error,
        "detail": (
            "Không gọi được Chatwoot — kiểm tra kết nối/token."
            if cw_error
            else cfg.get("detail")
        ),
    }
    return result


@router.post("/leads/{lead_id}/care", status_code=status.HTTP_201_CREATED)
def add_care_activity(
    lead_id: str,
    payload: CareLogCreate,
    user: dict = Depends(require_sale),
) -> dict:
    """ĐĂNG 1 hoạt động chăm sóc lên dòng thời gian (care feed kiểu mạng xã hội).

    Tái dùng contact log: set created_by = user hiện tại + denormalize tên người
    đăng để timeline hiện ngay "tên + thời gian". `outcome` tuỳ chọn (ghi chú thuần).
    Trả {item, log}: `item` đúng hình dạng 1 mục timeline để FE prepend NGAY lên
    đầu dòng thời gian mà không cần tải lại cả hồ sơ.
    """
    _owned_lead(lead_id, user)
    if not (payload.note or "").strip():
        raise HTTPException(status_code=400, detail="Nội dung không được để trống")
    log = lead_store.add_contact_log(
        lead_id,
        user["id"],
        channel=payload.channel.value,
        note=payload.note,
        outcome=(payload.outcome or ""),
        created_by_name=user.get("full_name"),
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    # Tính vào KPI "đã liên hệ" hôm nay (đồng bộ với ghi contact log thường).
    sale_task_store.increment_metric(user["id"], "contacts_made", 1)
    item = customer_360.contact_log_item(log)
    try:
        safe_log = ContactLog(**log).model_dump(mode="json")
    except Exception:  # noqa: BLE001 — outcome rỗng (ghi chú) không khớp Literal → trả raw
        safe_log = dict(log)
    return {"item": item, "log": safe_log}
