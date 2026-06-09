"""OpenClaw God-Mode Bridge — CEO assistant admin endpoints.

File destination in repo:
    apps/agent-engine/app/api/openclaw_bridge.py

Auth: header `Authorization: Bearer {OPENCLAW_GOD_TOKEN}` (env var, 64-char hex).

Register in app/main.py:
    from app.api import openclaw_bridge
    app.include_router(openclaw_bridge.router)
    # NOTE: do NOT pass prefix="/openclaw" here — the router already declares it.

Owner: PHẠM VĂN THƯ (CEO). Highest privilege. Logged on every call.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Path as FPath, status
from pydantic import BaseModel, Field

log = logging.getLogger("openclaw.bridge")

router = APIRouter(prefix="/openclaw", tags=["openclaw"])

# ---------------------------------------------------------------------------
# Persistence — Railway Volume mount stays at /app/data (memory: feedback-post-deploy-persistence)
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.environ.get("ELC_DATA_DIR", "/app/data"))
USERS_FILE = DATA_DIR / "users.json"
LEADS_FILE = DATA_DIR / "leads.json"
INVENTORY_FILE = DATA_DIR / "inventory.json"
BOOKINGS_FILE = DATA_DIR / "bookings.json"
SALES_FILE = DATA_DIR / "sales.json"
AUDIT_LOG = DATA_DIR / "openclaw_audit.log"


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive
        log.error("openclaw: failed to load %s: %s", path, exc)
        return default


def _save_json_atomic(path: Path, data: Any) -> None:
    """Atomic write — never truncate the live file (memory: feedback-no-data-loss)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _audit(actor: str, action: str, target: str, payload: Dict[str, Any] | None = None) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "actor": actor,
            "action": action,
            "target": target,
            "payload": payload or {},
        },
        ensure_ascii=False,
    )
    with AUDIT_LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def _expected_token() -> str:
    tok = os.environ.get("OPENCLAW_GOD_TOKEN", "")
    if not tok:
        # Never fall back to a real default — refuse if not configured.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENCLAW_GOD_TOKEN not configured on server",
        )
    return tok


def require_god(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    presented = authorization.split(None, 1)[1].strip()
    expected = _expected_token()
    # Constant-time compare
    if not secrets.compare_digest(presented, expected):
        raise HTTPException(status_code=403, detail="Invalid token")
    return "openclaw"


GodActor = Depends(require_god)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ResetPasswordRequest(BaseModel):
    new_password: Optional[str] = Field(
        default=None,
        description="If omitted, server generates a random 16-char temp password.",
    )


class AssignLeadRequest(BaseModel):
    sale_id: str = Field(..., description="User id of the sale to assign this lead to")


class InventoryStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(available|locked|sold|reserved|maintenance)$")
    reason: Optional[str] = None


class CommissionTierRequest(BaseModel):
    tier: str = Field(..., description="e.g. 'standard'|'silver'|'gold'|'platinum'")
    effective_from: Optional[str] = None  # ISO date


class RedeployRequest(BaseModel):
    environment_id: Optional[str] = None
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
@router.get("/users")
def list_users(actor: str = GodActor) -> List[Dict[str, Any]]:
    users = _load_json(USERS_FILE, [])
    _audit(actor, "users.list", "ALL", {"count": len(users)})
    return users


@router.post("/users/{user_id}/reset_password")
def reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    actor: str = GodActor,
) -> Dict[str, Any]:
    users = _load_json(USERS_FILE, [])
    if not isinstance(users, list):
        raise HTTPException(500, "users store malformed")

    new_pw = body.new_password or secrets.token_urlsafe(12)
    found = False
    for u in users:
        if str(u.get("id")) == str(user_id) or u.get("email") == user_id:
            u["password_reset_required"] = True
            u["temp_password"] = new_pw  # downstream auth layer hashes on next login
            u["password_reset_at"] = datetime.now(timezone.utc).isoformat()
            found = True
            break
    if not found:
        raise HTTPException(404, "user not found")

    _save_json_atomic(USERS_FILE, users)
    _audit(actor, "users.reset_password", user_id, {})
    return {"ok": True, "user_id": user_id, "temp_password": new_pw}


# ---------------------------------------------------------------------------
# Leads (CRM)
# ---------------------------------------------------------------------------
@router.get("/leads")
def list_leads(actor: str = GodActor) -> List[Dict[str, Any]]:
    leads = _load_json(LEADS_FILE, [])
    _audit(actor, "leads.list", "ALL", {"count": len(leads)})
    return leads


@router.post("/leads/{lead_id}/assign")
def assign_lead(
    lead_id: str,
    body: AssignLeadRequest,
    actor: str = GodActor,
) -> Dict[str, Any]:
    leads = _load_json(LEADS_FILE, [])
    for l in leads:
        if str(l.get("id")) == str(lead_id):
            l["assigned_sale"] = body.sale_id
            l["assigned_at"] = datetime.now(timezone.utc).isoformat()
            _save_json_atomic(LEADS_FILE, leads)
            _audit(actor, "leads.assign", lead_id, {"sale_id": body.sale_id})
            return {"ok": True, "lead_id": lead_id, "sale_id": body.sale_id}
    raise HTTPException(404, "lead not found")


# ---------------------------------------------------------------------------
# Inventory (bảng hàng)
# ---------------------------------------------------------------------------
@router.get("/inventory")
def list_inventory(actor: str = GodActor) -> List[Dict[str, Any]]:
    inv = _load_json(INVENTORY_FILE, [])
    _audit(actor, "inventory.list", "ALL", {"count": len(inv)})
    return inv


@router.post("/inventory/{unit_id}/status")
def set_inventory_status(
    unit_id: str,
    body: InventoryStatusRequest,
    actor: str = GodActor,
) -> Dict[str, Any]:
    inv = _load_json(INVENTORY_FILE, [])
    for u in inv:
        if str(u.get("id")) == str(unit_id) or u.get("code") == unit_id:
            prev = u.get("status")
            u["status"] = body.status
            u["status_changed_at"] = datetime.now(timezone.utc).isoformat()
            u["status_change_reason"] = body.reason or ""
            _save_json_atomic(INVENTORY_FILE, inv)
            _audit(
                actor,
                "inventory.status",
                unit_id,
                {"from": prev, "to": body.status, "reason": body.reason},
            )
            return {"ok": True, "unit_id": unit_id, "previous": prev, "current": body.status}
    raise HTTPException(404, "unit not found")


# ---------------------------------------------------------------------------
# Sales performance
# ---------------------------------------------------------------------------
@router.get("/sales/performance")
def sales_performance(actor: str = GodActor) -> List[Dict[str, Any]]:
    """Aggregate KPI per sale: leads_won, units_sold, revenue, commission."""
    sales = _load_json(SALES_FILE, [])
    leads = _load_json(LEADS_FILE, [])
    inv = _load_json(INVENTORY_FILE, [])

    by_sale: Dict[str, Dict[str, Any]] = {}
    for s in sales:
        sid = str(s.get("id"))
        by_sale[sid] = {
            "sale_id": sid,
            "name": s.get("name", ""),
            "tier": s.get("commission_tier", "standard"),
            "leads_total": 0,
            "leads_won": 0,
            "units_sold": 0,
            "revenue": 0,
            "commission": 0,
        }

    for l in leads:
        sid = str(l.get("assigned_sale", ""))
        if sid in by_sale:
            by_sale[sid]["leads_total"] += 1
            if l.get("status") == "won":
                by_sale[sid]["leads_won"] += 1

    tier_rate = {"standard": 0.005, "silver": 0.007, "gold": 0.01, "platinum": 0.013}
    for u in inv:
        if u.get("status") != "sold":
            continue
        sid = str(u.get("sold_by", ""))
        if sid in by_sale:
            price = int(u.get("price_final") or u.get("price_list") or 0)
            by_sale[sid]["units_sold"] += 1
            by_sale[sid]["revenue"] += price
            rate = tier_rate.get(by_sale[sid]["tier"], 0.005)
            by_sale[sid]["commission"] += int(price * rate)

    ranked = sorted(by_sale.values(), key=lambda r: r["revenue"], reverse=True)
    _audit(actor, "sales.performance", "ALL", {"count": len(ranked)})
    return ranked


@router.post("/sales/{sale_id}/commission_tier")
def set_commission_tier(
    sale_id: str,
    body: CommissionTierRequest,
    actor: str = GodActor,
) -> Dict[str, Any]:
    sales = _load_json(SALES_FILE, [])
    for s in sales:
        if str(s.get("id")) == str(sale_id):
            prev = s.get("commission_tier")
            s["commission_tier"] = body.tier
            s["commission_tier_effective_from"] = body.effective_from or datetime.now(timezone.utc).date().isoformat()
            _save_json_atomic(SALES_FILE, sales)
            _audit(actor, "sales.commission_tier", sale_id, {"from": prev, "to": body.tier})
            return {"ok": True, "sale_id": sale_id, "previous": prev, "current": body.tier}
    raise HTTPException(404, "sale not found")


# ---------------------------------------------------------------------------
# System health & redeploy
# ---------------------------------------------------------------------------
def _check_http(name: str, url: str, headers: Dict[str, str] | None = None) -> Dict[str, Any]:
    out = {"name": name, "url": url, "ok": False, "status": None, "error": None}
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get(url, headers=headers or {})
            out["status"] = r.status_code
            out["ok"] = 200 <= r.status_code < 400
    except Exception as exc:
        out["error"] = str(exc)
    return out


@router.get("/system/health")
def system_health(actor: str = GodActor) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    # n8n
    n8n_url = os.environ.get("N8N_HEALTHCHECK_URL") or os.environ.get("N8N_BASE_URL", "").rstrip("/") + "/healthz"
    if n8n_url:
        checks.append(_check_http("n8n", n8n_url))

    # Chatwoot
    cw_url = os.environ.get("CHATWOOT_BASE_URL", "").rstrip("/")
    if cw_url:
        checks.append(_check_http("chatwoot", cw_url + "/api"))

    # Postgres (best-effort: only attempt if psycopg2 / SQLAlchemy URL set)
    pg_status = {"name": "postgres", "ok": False, "error": None}
    pg_url = os.environ.get("DATABASE_URL")
    if pg_url:
        try:
            import psycopg2  # type: ignore
            conn = psycopg2.connect(pg_url, connect_timeout=5)
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            conn.close()
            pg_status["ok"] = True
        except Exception as exc:
            pg_status["error"] = str(exc)
    else:
        pg_status["error"] = "DATABASE_URL not set"
    checks.append(pg_status)

    # Data volume
    vol_status = {
        "name": "volume",
        "path": str(DATA_DIR),
        "ok": DATA_DIR.exists() and os.access(DATA_DIR, os.W_OK),
        "users_count": len(_load_json(USERS_FILE, [])),
        "leads_count": len(_load_json(LEADS_FILE, [])),
        "inventory_count": len(_load_json(INVENTORY_FILE, [])),
    }
    checks.append(vol_status)

    overall_ok = all(c.get("ok") for c in checks)
    payload = {
        "ok": overall_ok,
        "ts": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }
    _audit(actor, "system.health", "ALL", {"ok": overall_ok})
    return payload


@router.post("/system/redeploy/{service}")
def redeploy(
    service: str,
    body: RedeployRequest | None = None,
    actor: str = GodActor,
) -> Dict[str, Any]:
    """Trigger Railway redeploy via Railway GraphQL API.

    Requires env vars:
        RAILWAY_API_TOKEN           — personal/project token
        RAILWAY_PROJECT_ID          — project UUID
        RAILWAY_SERVICE_<NAME>_ID   — service UUID per service name (uppercased)
        RAILWAY_ENV_ID              — default environment id (optional)
    """
    body = body or RedeployRequest()
    token = os.environ.get("RAILWAY_API_TOKEN")
    project = os.environ.get("RAILWAY_PROJECT_ID")
    svc_env_key = f"RAILWAY_SERVICE_{service.upper()}_ID"
    svc_id = os.environ.get(svc_env_key)
    env_id = body.environment_id or os.environ.get("RAILWAY_ENV_ID")
    if not token or not project or not svc_id:
        raise HTTPException(
            424,
            f"Railway not configured: need RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, {svc_env_key}",
        )

    query = """
    mutation Redeploy($serviceId: String!, $environmentId: String) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
    """
    variables: Dict[str, Any] = {"serviceId": svc_id}
    if env_id:
        variables["environmentId"] = env_id

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                "https://backboard.railway.app/graphql/v2",
                headers={"Authorization": f"Bearer {token}"},
                json={"query": query, "variables": variables},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        _audit(actor, "system.redeploy.error", service, {"error": str(exc)})
        raise HTTPException(502, f"Railway API error: {exc}") from exc

    _audit(actor, "system.redeploy", service, {"reason": body.reason, "response": data})
    return {"ok": True, "service": service, "railway_response": data}
