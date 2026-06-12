"""Phát hiện khả dụng của Sales Crew — crewai cài chưa, key có chưa, bật/tắt.

Tách riêng để endpoint + service + MCP tool đều dùng chung 1 nguồn sự thật về
"crew có chạy LLM thật được không, hay phải fallback heuristic".
"""
from __future__ import annotations

import importlib.util
from typing import Dict

from app.core.settings import settings


def crewai_installed() -> bool:
    """True nếu thư viện crewai import được (KHÔNG thực sự import — chỉ kiểm tra).

    Dùng importlib.util.find_spec để tránh nuốt thời gian/khởi tạo nặng của crewai
    và để an toàn trên Python 3.9 (nơi crewai chưa cài)."""
    try:
        return importlib.util.find_spec("crewai") is not None
    except Exception:  # noqa: BLE001 — bất kỳ lỗi nào coi như chưa khả dụng
        return False


def anthropic_key_present() -> bool:
    return bool((settings.anthropic_api_key or "").strip())


def llm_live_possible() -> bool:
    """Có thể gọi LLM thật cho crew không? (key có + không ở chế độ mock)."""
    return anthropic_key_present() and not settings.use_mock_llm


def crew_mode() -> str:
    """Chế độ hiệu lực của crew:

    - "disabled": crew_enabled=false → không chạy.
    - "live":     đủ điều kiện chạy CrewAI thật (crewai cài + key + không mock).
    - "claude":   crewai CHƯA cài (build nhẹ) nhưng CÓ key + không mock → gọi
                  thẳng Claude (AsyncAnthropic/Anthropic) sinh phân tích THẬT,
                  KHÔNG cần thư viện crewai nặng.
    - "fallback": bật nhưng thiếu cả crewai lẫn key (hoặc mock) → heuristic (không LLM).
    """
    if not settings.crew_enabled:
        return "disabled"
    if crewai_installed() and llm_live_possible():
        return "live"
    if llm_live_possible():
        return "claude"
    return "fallback"


def crew_runtime_status() -> Dict[str, object]:
    """Trạng thái runtime đầy đủ — phơi cho endpoint /admin/crew/status + MCP."""
    from app.core import dify_client  # lazy: tránh phụ thuộc vòng

    mode = crew_mode()
    reasons = []
    if not settings.crew_enabled:
        reasons.append("crew_enabled=false (đặt env CREW_ENABLED=true để bật)")
    if not crewai_installed():
        if mode == "claude":
            reasons.append(
                "crewai CHƯA cài → chạy fallback bằng Claude THẬT (engine=claude-direct). "
                "Cài crewai (requirements-crew.txt) nếu muốn multi-agent đầy đủ."
            )
        else:
            reasons.append("crewai CHƯA cài (pip install -r requirements-crew.txt)")
    if not anthropic_key_present():
        reasons.append("thiếu ANTHROPIC_API_KEY")
    if settings.use_mock_llm:
        reasons.append("use_mock_llm=true (đang ở chế độ mock LLM → crew chỉ heuristic)")

    return {
        "enabled": settings.crew_enabled,
        "mode": mode,
        "crewai_installed": crewai_installed(),
        "anthropic_key_present": anthropic_key_present(),
        "use_mock_llm": settings.use_mock_llm,
        "dify_configured": dify_client.is_configured(),
        "dify_dataset_configured": dify_client.is_dataset_configured(),
        "model": settings.crew_model_resolved(),
        "max_agents": settings.crew_max_agents,
        "max_tokens": settings.crew_max_tokens,
        # Crew gọi LLM thật khi mode là "live" (CrewAI) HOẶC "claude" (Claude trực tiếp).
        # Chỉ mode "fallback" mới là heuristic thuần (không LLM).
        "will_use_llm": mode in ("live", "claude"),
        "notes": reasons,
    }
