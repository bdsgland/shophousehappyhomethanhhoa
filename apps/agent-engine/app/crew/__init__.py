"""app.crew — Lớp "đội sale ảo" multi-agent (CrewAI) cho Agent Proptech.

TÍNH NĂNG CỘNG THÊM, TẮT ĐƯỢC. Mục tiêu: chạy 1 "Sales Crew" gồm vài agent vai
trò (Tư vấn viên · Chăm sóc · Chốt deal) trên 1 lead → trả về PHÂN TÍCH + ĐỀ XUẤT
hành động + TIN NHẮN NHÁP. TUYỆT ĐỐI không tự gửi / không tự ghi CRM — mọi tác vụ
ghi đều chỉ tạo nháp, cần admin xác nhận.

NGUYÊN TẮC AN TOÀN
  - KHÔNG import crewai ở mức module (để app vẫn boot trên Python 3.9 local nơi
    crewai chưa cài). Mọi import crewai đều LAZY bên trong hàm.
  - Fallback rõ ràng: thiếu crewai / thiếu ANTHROPIC_API_KEY / use_mock_llm=true /
    crew_enabled=false → phân tích heuristic (không gọi LLM), KHÔNG crash.
  - Không phá luồng chat/CRM hiện tại: chỉ ĐỌC dữ liệu lead/CRM + tri thức Dify.
"""

from app.crew.availability import crew_runtime_status  # noqa: F401
from app.crew.service import list_agent_templates, run_for_lead  # noqa: F401

__all__ = ["crew_runtime_status", "run_for_lead", "list_agent_templates"]
