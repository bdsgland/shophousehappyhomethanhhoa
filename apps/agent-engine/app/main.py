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

import os
import secrets
import string
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import (
    admin,
    automation,
    auth,
    bookings,
    chat,
    client,
    health,
    inventory,
    leads,
    learning,
    me,
    webhook,
)
from app.core.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo Postgres (nếu có) + auto-seed tài khoản admin khi khởi động.

    Postgres là TUỲ CHỌN: thiếu/lỗi DATABASE_URL → app vẫn chạy trên JSON
    (graceful degradation). Giai đoạn dual-write: ghi cả JSON lẫn Postgres.
    """
    from app.core import user_store
    from app.core.security import hash_password

    # --- Persistence: thử bật Postgres, không bao giờ để DB làm chết app ---
    try:
        from app.db import session as db
        from app.db import user_mirror

        if db.db_configured():
            if db.init_db():
                backfilled = user_mirror.backfill_users()
                print(
                    f"[DB] Postgres CONNECTED — schema ensured, "
                    f"backfilled {backfilled} user(s). Dual-write BẬT."
                )
            else:
                print("[DB] Postgres cấu hình nhưng KHÔNG kết nối được "
                      "→ fallback JSON (dual-write TẮT).")
        else:
            print("[DB] Chưa cấu hình DATABASE_URL → chạy JSON thuần.")
    except Exception as e:  # noqa: BLE001
        print(f"[DB] Khởi tạo lỗi, fallback JSON: {type(e).__name__}: {e}")

    admin_email = os.getenv("ADMIN_EMAIL", "admin@eurowindowlightcity.net")
    admin_password = os.getenv("ADMIN_PASSWORD") or "".join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(16)
    )
    try:
        if not user_store.find_by_email(admin_email):
            user_store.create_user(
                email=admin_email,
                full_name="Admin",
                password_hash=hash_password(admin_password),
                role="admin",
            )
            print(f"[SEED] Admin created: {admin_email} / {admin_password}")
        else:
            print(f"[SEED] Admin already exists: {admin_email}")
    except Exception as e:  # noqa: BLE001 — không để seed làm chết app
        print(f"[SEED] Error: {type(e).__name__}: {e}")
        traceback.print_exc()
    yield


app = FastAPI(
    title="Agent Proptech — Agent Engine",
    description=(
        "Backend AI agent cho hệ thống bán BĐS cao cấp tự động. "
        "Cung cấp endpoint cho web dashboard và chat widget."
    ),
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(client.router)
app.include_router(chat.router)
app.include_router(leads.router)
app.include_router(inventory.router)
app.include_router(admin.router)
app.include_router(learning.router)
app.include_router(automation.router)
app.include_router(bookings.router)
app.include_router(bookings.me_router)
app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "name": "Agent Proptech — Agent Engine",
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
    }
