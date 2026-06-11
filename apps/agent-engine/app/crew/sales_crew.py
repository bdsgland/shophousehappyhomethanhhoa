"""Định nghĩa "Sales Crew" — đội sale ảo gồm 3 agent vai trò + runner CrewAI live.

3 AGENT (vai trò):
  1. Tư vấn viên (Advisor)   — hiểu nhu cầu, khớp sản phẩm/tri thức dự án.
  2. Chăm sóc (Nurturer)     — giữ tương tác, soạn tin chăm sóc phù hợp giai đoạn.
  3. Chốt deal (Closer)      — đề xuất bước hành động đẩy lead tiến gần chốt.

Mỗi agent dùng Claude (settings.anthropic_api_key) làm LLM qua CrewAI (LiteLLM).
KHÔNG import crewai ở mức module — mọi import LAZY trong hàm để app boot được trên
Python 3.9 (crewai chưa cài).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.core.settings import settings

log = logging.getLogger("crew.sales")


# ---------------------------------------------------------------------------
# Template agent — phơi cho endpoint /admin/crew/agents (không cần crewai).
# ---------------------------------------------------------------------------
AGENT_TEMPLATES: List[Dict[str, str]] = [
    {
        "key": "advisor",
        "name": "Tư vấn viên",
        "role": "Chuyên viên tư vấn BĐS cao cấp",
        "goal": (
            "Hiểu nhu cầu thực của khách (ngân sách, mục đích, khu vực, loại căn) và "
            "khớp với quỹ căn + tri thức dự án từ Knowledge Base nội bộ."
        ),
        "backstory": (
            "Bạn là chuyên viên tư vấn dày dạn của Eurowindow Light City, nắm chắc "
            "sản phẩm, pháp lý và chính sách bán hàng. Luôn dựa trên dữ liệu nội bộ, "
            "không bịa thông tin."
        ),
    },
    {
        "key": "nurturer",
        "name": "Chăm sóc",
        "role": "Chuyên viên chăm sóc khách hàng",
        "goal": (
            "Giữ tương tác và xây dựng niềm tin với lead theo đúng giai đoạn, soạn tin "
            "nhắn chăm sóc NHÁP phù hợp (không spam, đúng ngữ cảnh)."
        ),
        "backstory": (
            "Bạn tinh tế trong giao tiếp, biết chọn thời điểm và thông điệp để khách "
            "không cảm thấy bị làm phiền. Mọi tin nhắn chỉ là bản nháp để sale duyệt."
        ),
    },
    {
        "key": "closer",
        "name": "Chốt deal",
        "role": "Chuyên viên chốt giao dịch",
        "goal": (
            "Đề xuất bước hành động cụ thể, khả thi để đẩy lead tiến gần quyết định "
            "(đặt lịch xem nhà, gửi bảng tính giá, ưu đãi có thời hạn...)."
        ),
        "backstory": (
            "Bạn quyết đoán nhưng tôn trọng khách, luôn đề xuất next-step rõ ràng dựa "
            "trên mức độ quan tâm (ai_score) và lịch sử tương tác."
        ),
    },
]


def agent_templates(max_agents: int | None = None) -> List[Dict[str, str]]:
    """Danh sách template, cắt theo crew_max_agents (bảo vệ chi phí)."""
    n = max_agents if max_agents is not None else settings.crew_max_agents
    n = max(1, min(int(n), len(AGENT_TEMPLATES)))
    return AGENT_TEMPLATES[:n]


# ---------------------------------------------------------------------------
# Runner LIVE — chỉ gọi khi mode='live' (đã kiểm tra crewai + key ở lớp trên).
# ---------------------------------------------------------------------------
def _build_llm():
    """Tạo crewai.LLM trỏ Claude qua LiteLLM. LAZY import crewai."""
    from crewai import LLM  # type: ignore

    model = settings.crew_model_resolved()
    # CrewAI dùng LiteLLM → cần tiền tố provider. Tự thêm "anthropic/" nếu thiếu.
    if "/" not in model:
        model = f"anthropic/{model}"
    return LLM(
        model=model,
        api_key=settings.anthropic_api_key,
        max_tokens=settings.crew_max_tokens,
    )


def run_crew_live(lead_ctx: Dict[str, Any], knowledge_text: str) -> Dict[str, Any]:
    """Chạy CrewAI thật trên 1 lead. Trả {"engine":"crewai", "output":..., ...}.

    NÉM exception nếu crewai lỗi — caller (service) bắt và fallback heuristic."""
    from crewai import Agent, Crew, Process, Task  # type: ignore

    from app.crew.tools import build_crew_tools

    llm = _build_llm()
    tools = build_crew_tools(lead_ctx.get("id", ""))
    templates = agent_templates()

    agents = []
    for t in templates:
        agents.append(
            Agent(
                role=t["role"],
                goal=t["goal"],
                backstory=t["backstory"],
                llm=llm,
                tools=tools,
                allow_delegation=False,
                verbose=False,
                max_iter=3,  # chặn vòng lặp dài → chi phí
            )
        )

    # Context gói gọn để nhồi vào task (tránh phụ thuộc tool call vòng vo).
    import json

    ctx_json = json.dumps(lead_ctx, ensure_ascii=False, default=str)
    kb = knowledge_text.strip() or "(không có tri thức Dify khả dụng)"

    tasks = [
        Task(
            description=(
                "Phân tích nhu cầu & mức độ quan tâm của lead dựa trên hồ sơ sau:\n"
                f"{ctx_json}\n\nTri thức dự án tham khảo:\n{kb}\n\n"
                "Tóm tắt: chân dung khách, nhu cầu suy đoán, mức độ sẵn sàng (thang 1-5)."
            ),
            expected_output="Bản phân tích ngắn gọn (tiếng Việt), tối đa 8 dòng.",
            agent=agents[0],
        )
    ]
    if len(agents) >= 2:
        tasks.append(
            Task(
                description=(
                    "Dựa trên phân tích, soạn 1 TIN NHẮN CHĂM SÓC NHÁP (tiếng Việt) phù "
                    "hợp giai đoạn của lead. ĐÂY LÀ BẢN NHÁP — không gửi. Ghi rõ kênh "
                    "đề xuất (zalo/sms/email) và thời điểm gửi gợi ý."
                ),
                expected_output="1 tin nhắn nháp + kênh + thời điểm gợi ý.",
                agent=agents[1],
            )
        )
    if len(agents) >= 3:
        tasks.append(
            Task(
                description=(
                    "Đề xuất 1-3 BƯỚC HÀNH ĐỘNG cụ thể, khả thi để đẩy lead tiến gần "
                    "chốt (đặt lịch xem nhà, gửi bảng tính giá, ưu đãi có thời hạn...). "
                    "Mỗi bước nêu rõ vì sao và mức ưu tiên."
                ),
                expected_output="Danh sách 1-3 hành động + lý do + ưu tiên.",
                agent=agents[2],
            )
        )

    crew = Crew(
        agents=agents,
        tasks=tasks,
        process=Process.sequential,
        verbose=False,
    )
    result = crew.kickoff()

    # Gom output từng task (CrewAI >=0.1xx: result.tasks_output).
    per_task = []
    try:
        for to in getattr(result, "tasks_output", []) or []:
            per_task.append(str(getattr(to, "raw", to)))
    except Exception:  # noqa: BLE001
        pass

    return {
        "engine": "crewai",
        "model": settings.crew_model_resolved(),
        "summary": str(result),
        "task_outputs": per_task,
        "agents": [t["name"] for t in templates],
    }
