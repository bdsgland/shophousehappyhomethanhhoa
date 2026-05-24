"""Endpoint kiểm tra sức khoẻ — dùng cho monitoring và verify lúc dev."""

from datetime import datetime
from fastapi import APIRouter
from app import __version__
from app.core.settings import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "agent-proptech-engine",
        "version": __version__,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "llm_mode": "mock" if settings.use_mock_llm else "real",
        "llm_model": settings.llm_model,
    }
