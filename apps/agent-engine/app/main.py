"""Agent Proptech — FastAPI entry point.

Chạy local:
    cd apps/agent-engine
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Sau đó mở:
    http://localhost:8000/health   — kiểm tra sức khoẻ
    http://localhost:8000/docs     — Swagger UI tự sinh
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import auth, chat, health, leads
from app.core.settings import settings

app = FastAPI(
    title="Agent Proptech — Agent Engine",
    description=(
        "Backend AI agent cho hệ thống bán BĐS cao cấp tự động. "
        "Cung cấp endpoint cho web dashboard và chat widget."
    ),
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(leads.router)


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "name": "Agent Proptech — Agent Engine",
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
    }
