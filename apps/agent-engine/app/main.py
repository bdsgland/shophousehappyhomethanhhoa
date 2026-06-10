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

# --- Đăng ký router: import + include TỪNG router, KHÔNG nuốt lỗi âm thầm. ---
# Mỗi entry = (module, attr_router, kwargs_include). Lỗi import/include của 1
# router được LOG RÕ (traceback đầy đủ ra stdout → Railway logs) nhưng KHÔNG
# làm chết cả app, để các route còn lại vẫn phục vụ và lỗi luôn hiện ra.
import importlib

_ROUTER_SPECS: list[tuple[str, str, dict]] = [
    ("health", "router", {}),
    ("auth", "router", {}),
    ("me", "router", {}),
    ("client", "router", {}),
    ("chat", "router", {}),
    ("leads", "router", {}),
    ("inventory", "router", {}),
    ("admin", "router", {}),
    ("admin_inventory", "router", {}),
    ("admin_commission", "router", {}),
    ("admin_commission", "sale_router", {}),
    ("n8n_stubs", "router", {}),
    ("admin_automation", "router", {}),
    ("manager", "router", {}),
    ("admin_conversations", "router", {}),
    ("admin_inbox", "router", {}),
    ("admin_drive_sync", "router", {}),
    ("admin_import", "router", {}),
    ("learning", "router", {}),
    ("projects", "router", {}),
    ("sales_policy", "router", {}),
    ("automation", "router", {}),
    ("bookings", "router", {}),
    ("bookings", "me_router", {}),
    ("crm", "sale_router", {}),
    ("crm", "admin_router", {}),
    ("crm", "internal_router", {}),
    ("customer_360", "router", {}),
    ("call", "router", {}),
    ("call", "webhook_router", {}),
    ("pipeline", "router", {}),
    ("ai_crm", "router", {}),
    ("match", "router", {}),
    ("ws_presence", "router", {}),
    ("ws_match", "router", {}),
    ("ws_admin", "router", {}),
    ("workspace_oauth", "router", {}),
    ("openclaw_bridge", "router", {}),
    ("webhook", "router", {"prefix": "/webhook", "tags": ["webhook"]}),
]

_router_failures: list[str] = []
for _mod_name, _attr, _kwargs in _ROUTER_SPECS:
    try:
        _mod = importlib.import_module(f"app.api.{_mod_name}")
        _router = getattr(_mod, _attr)
        app.include_router(_router, **_kwargs)
    except Exception as _exc:  # noqa: BLE001 — LOG RÕ, không nuốt im lặng
        _router_failures.append(f"{_mod_name}.{_attr}: {type(_exc).__name__}: {_exc}")
        print(f"[ROUTER][FAIL] app.api.{_mod_name}.{_attr} KHÔNG đăng ký được:")
        traceback.print_exc()

# --- Audit khởi động: in các route đã đăng ký + KIỂM 3 route 360/pipeline. ---
_registered_paths = sorted(
    {getattr(r, "path", "") for r in app.routes if getattr(r, "path", "")}
)
print(f"[ROUTER] Đã đăng ký {len(_registered_paths)} route. "
      f"Lỗi: {len(_router_failures)}.")
if _router_failures:
    for _f in _router_failures:
        print(f"[ROUTER][FAIL] {_f}")
_CRITICAL_ROUTES = [
    "/crm/leads/{lead_id}/profile-360",
    "/crm/pipeline",
    "/crm/leads/{lead_id}/stage",
]
for _cr in _CRITICAL_ROUTES:
    _ok = "✅" if _cr in _registered_paths else "❌ THIẾU"
    print(f"[ROUTER] route 360/pipeline {_cr}: {_ok}")


# --- MCP server (streamable-http) cho bot OpenClaw ---------------------------
# OpenClaw CHỈ tiêu thụ MCP server (không gọi REST thường). Module openclaw_mcp
# bọc các thao tác /openclaw thành MCP tools va expose ASGI app, mount tại /mcp.
# URL production: https://api.eurowindowlightcity.net/mcp
# Lỗi import KHÔNG làm chết app (log rõ, các route khác vẫn phục vụ).
try:
    from app.api.openclaw_mcp import mcp_asgi_app

    app.mount("/mcp", mcp_asgi_app)
    print("[MCP] OpenClaw MCP mounted tại /mcp (streamable-http, JSON-RPC).")
except Exception as _mcp_exc:  # noqa: BLE001
    print(f"[MCP][FAIL] Không mount được /mcp: {type(_mcp_exc).__name__}: {_mcp_exc}")
    traceback.print_exc()


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "name": "Agent Proptech — Agent Engine",
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
    }
