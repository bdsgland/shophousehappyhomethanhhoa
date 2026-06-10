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
    admin_commission,
    admin_conversations,
    admin_drive_sync,
    admin_import,
    admin_inventory,
    automation,
    auth,
    bookings,
    chat,
    client,
    crm,
    health,
    inventory,
    leads,
    learning,
    match,
    me,
    n8n_stubs,
    openclaw_bridge,
    projects,
    sales_policy,
    webhook,
    workspace_oauth,
    ws_admin,
    ws_match,
    ws_presence,
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

    # --- Seed TẠM 5 căn độc quyền có giá chi tiết (sẽ thay bằng sync sheet) ---
    try:
        from app.core.seed_exclusive import seed_exclusive_units

        res = seed_exclusive_units()
        print(f"[SEED] Exclusive units: {res}")
    except Exception as e:  # noqa: BLE001 — seed không bao giờ làm chết app
        print(f"[SEED] Exclusive units error: {type(e).__name__}: {e}")

    # --- Live Match: dọn presence "ma" (sale mất kết nối không heartbeat) ---
    import asyncio

    from app.core import presence

    async def _presence_janitor():
        while True:
            try:
                await asyncio.sleep(30)
                presence.cleanup_stale()
            except asyncio.CancelledError:  # pragma: no cover
                break
            except Exception as exc:  # noqa: BLE001
                print(f"[PRESENCE] janitor error: {type(exc).__name__}: {exc}")

    janitor = asyncio.create_task(_presence_janitor())
    yield
    janitor.cancel()


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


@app.middleware("http")
async def openclaw_audit_middleware(request, call_next):
    """Audit MỌI request đến /openclaw/* (tag OPENCLAW_GOD_MODE).

    Ghi method/path/status/thời gian + body (đã mask password/token) + query.
    Không bao giờ làm hỏng request nếu audit lỗi (best-effort).
    """
    if not request.url.path.startswith("/openclaw"):
        return await call_next(request)

    import time

    from app.api.openclaw_bridge import parse_and_mask_body
    from app.core import audit_store

    start = time.perf_counter()
    body_bytes = await request.body()

    # Cho phép downstream đọc lại body (middleware đã "tiêu thụ" stream).
    async def _receive():
        return {"type": "http.request", "body": body_bytes, "more_body": False}

    request._receive = _receive

    response = await call_next(request)
    duration_ms = int((time.perf_counter() - start) * 1000)
    try:
        masked = parse_and_mask_body(
            body_bytes, request.headers.get("content-type", "")
        )
        audit_store.record_openclaw(
            request.method,
            request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            body=masked,
            query=dict(request.query_params),
        )
    except Exception:  # noqa: BLE001 — audit không được làm hỏng response
        pass
    return response

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(client.router)
app.include_router(chat.router)
app.include_router(leads.router)
app.include_router(inventory.router)
app.include_router(admin.router)
app.include_router(admin_inventory.router)
app.include_router(admin_commission.router)
app.include_router(admin_commission.sale_router)
app.include_router(n8n_stubs.router)
app.include_router(admin_conversations.router)
app.include_router(admin_drive_sync.router)
app.include_router(admin_import.router)
app.include_router(learning.router)
app.include_router(projects.router)
app.include_router(sales_policy.router)
app.include_router(automation.router)
app.include_router(bookings.router)
app.include_router(bookings.me_router)
app.include_router(crm.sale_router)
app.include_router(crm.admin_router)
app.include_router(crm.internal_router)
app.include_router(match.router)
app.include_router(ws_presence.router)
app.include_router(ws_match.router)
app.include_router(ws_admin.router)
app.include_router(workspace_oauth.router)
app.include_router(openclaw_bridge.router)
app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "name": "Agent Proptech — Agent Engine",
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
    }
