"""Schemas cho "Manager / Trung tâm điều hành" (prefix /admin/manager).

Khác OpenClaw bridge: KHÔNG dùng God token — Manager là admin đã đăng nhập
(require_admin). Các model dưới đây mô tả request cho hành động ra lệnh + body
của ô lệnh ngôn ngữ tự nhiên (/command). Mọi hành động side-effect đều whitelist
và FE phải xác nhận trước khi gọi.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Broadcast — gửi thông báo (Telegram + in-app announce)
# ---------------------------------------------------------------------------
class ManagerBroadcast(BaseModel):
    """Gửi thông báo tới một nhóm người nhận qua kênh Telegram và/hoặc in-app."""

    message: str = Field(..., min_length=1, max_length=4000)
    audience: Literal["all_sales", "all_admins", "selected"] = "all_sales"
    user_ids: List[str] = Field(default_factory=list)  # khi audience=selected
    channels: List[Literal["telegram", "inapp"]] = Field(
        default_factory=lambda: ["inapp"]
    )
    title: Optional[str] = Field(default=None, max_length=200)


# ---------------------------------------------------------------------------
# Assign hot leads — phân bổ hot lead chưa có sale
# ---------------------------------------------------------------------------
class ManagerAssignHotLeads(BaseModel):
    """Phân bổ toàn bộ hot lead đang chờ. Hiện không có tham số (chạy auto)."""

    dry_run: bool = False  # True → chỉ đếm, không gán (để FE xem trước)


# ---------------------------------------------------------------------------
# Natural-language command — ô lệnh điều hành
# ---------------------------------------------------------------------------
class ManagerCommand(BaseModel):
    """Một câu lệnh ngôn ngữ tự nhiên do manager nhập vào ô điều hành."""

    text: str = Field(..., min_length=1, max_length=2000)
    # Khi FE đã hiển thị đề xuất và người dùng bấm "Xác nhận", gửi lại confirm=True
    # kèm action + params đã được /command trả về ở lần trước (không diễn giải lại).
    confirm: bool = False
    action: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Improvements — đề xuất cải tiến vận hành do AI tạo (chỉ gợi ý, KHÔNG tự thực thi)
# ---------------------------------------------------------------------------
class ManagerImprovementsRequest(BaseModel):
    """Yêu cầu sinh đề xuất cải tiến từ số liệu hệ thống hiện tại.

    AN TOÀN: đề xuất CHỈ là gợi ý cho người điều hành, KHÔNG kích hoạt bất kỳ
    hành động side-effect nào. `focus` là gợi ý tuỳ chọn để AI tập trung (vd
    "chi phí marketing", "SLA nhận khách nóng").
    """

    focus: Optional[str] = Field(default=None, max_length=300)


# ---------------------------------------------------------------------------
# Decisions — Trung tâm quyết định: hành động trên 1 việc cần người điều hành duyệt
# ---------------------------------------------------------------------------
class ManagerDecisionAct(BaseModel):
    """Một quyết định của người điều hành trên 1 việc trong hàng chờ.

    `type`   : loại việc (care_draft | pipeline_publish | hot_lead_unassigned |
               sla_breach | commission_approval | automation_error).
    `id`     : id của việc trong store tương ứng.
    `action` : approve (phê duyệt) | execute (thực hiện) | reject (bỏ qua).

    AN TOÀN: "execute" CHỈ đổi trạng thái nội bộ (gán sale, đánh dấu duyệt) —
    KHÔNG gửi tin / giao dịch thật khi kênh chưa kết nối. Định tuyến + whitelist
    do tầng router (manager.act_on_decision) kiểm soát.
    """

    type: str = Field(..., min_length=1, max_length=60)
    id: str = Field(..., min_length=1, max_length=200)
    action: Literal["approve", "execute", "reject"]
