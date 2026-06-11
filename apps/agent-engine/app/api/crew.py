"""Sales Crew API — /admin/crew/* (require_admin).

Lớp "đội sale ảo" (CrewAI) — TÍNH NĂNG CỘNG THÊM, mặc định TẮT (CREW_ENABLED=false).
Mọi endpoint chỉ ĐỌC + TRẢ NHÁP. Crew KHÔNG tự gửi tin / không tự ghi CRM: kết quả
luôn kèm requires_confirmation=true, auto_executed=false. Admin tự thực hiện hành
động (gửi tin / cập nhật lead) qua các endpoint CRM sẵn có sau khi duyệt.

Endpoint:
  • GET  /admin/crew/status              — trạng thái runtime (live/fallback/disabled)
  • GET  /admin/crew/agents              — template các agent vai trò
  • POST /admin/crew/leads/{lead_id}/run — chạy crew cho 1 lead → phân tích + nháp
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import require_admin
from app.crew import availability, service

router = APIRouter(prefix="/admin/crew", tags=["admin-crew"])


class CrewRunRequest(BaseModel):
    channel: str = Field(default="zalo", description="Kênh đề xuất cho tin nhắn nháp (zalo/sms/email).")


@router.get("/status")
def crew_status(_admin: dict = Depends(require_admin)) -> dict:
    """Trạng thái Sales Crew: bật/tắt, có chạy LLM thật không, lý do fallback."""
    return availability.crew_runtime_status()


@router.get("/agents")
def crew_agents(_admin: dict = Depends(require_admin)) -> dict:
    """Danh sách template agent vai trò (Tư vấn viên · Chăm sóc · Chốt deal)."""
    return {"agents": service.list_agent_templates()}


@router.post("/leads/{lead_id}/run")
def crew_run_for_lead(
    lead_id: str,
    body: Optional[CrewRunRequest] = None,
    admin: dict = Depends(require_admin),
) -> dict:
    """Chạy Sales Crew cho 1 lead → phân tích + đề xuất hành động + tin nhắn NHÁP.

    KHÔNG tự gửi / không tự ghi CRM. Trả requires_confirmation=true."""
    channel = (body.channel if body else "zalo") or "zalo"
    result = service.run_for_lead(
        lead_id, channel=channel, requested_by=admin.get("id")
    )
    # Lead không tồn tại / crew tắt → ok=False nhưng vẫn 200 kèm notes (để UI hiển
    # thị lý do). Chỉ 404 khi rõ ràng không tìm thấy lead.
    if not result.get("ok") and result.get("mode") != "disabled" and result.get("lead_name") is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy lead id={lead_id}")
    return result
