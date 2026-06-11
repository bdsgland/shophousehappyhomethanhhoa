"""OpenClaw God-Mode Bridge — endpoint /openclaw/* cho trợ lý AI CEO.

Bot Telegram CEO (@elc_ceo_bot, chạy ở service OpenClaw bot.eurowindowlightcity.net)
gọi vào đây để điều khiển toàn platform: users · leads · inventory · commission ·
KPI · DB read-only · telegram · email · health.

Auth (thống nhất với docs/openclaw-ceo-setup.md + app/api/deps.verify_openclaw_token):
  - Header ưu tiên: `X-Openclaw-Token: <GOD_TOKEN>`
  - Fallback: `Authorization: Bearer <GOD_TOKEN>` (tương thích cấu hình cũ)
  - So khớp `settings.openclaw_god_token` (fallback env OPENCLAW_GOD_TOKEN).
  - Token chưa cấu hình / thiếu / sai → 403 (fail-closed, đúng contract doc mục H).

Mọi request được middleware (app/main.py) ghi audit (tag OPENCLAW_GOD_MODE) qua
audit_store; body đã được mask field nhạy cảm bằng parse_and_mask_body bên dưới.
KHÔNG bao giờ log/echo token hay password.
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core import (
    audit_store,
    commission_config_store,
    inventory_store,
    lead_store,
    sale_task_store,
    user_store,
)
from app.core.security import create_access_token, hash_password
from app.core.settings import settings
from app.schemas.commission_config import CommissionConfig
from app.schemas.openclaw import (
    OpenClawAnnounce,
    OpenClawAssignHot,
    OpenClawEmailSend,
    OpenClawInventoryBulkUpdate,
    OpenClawInventoryUpdate,
    OpenClawLeadBulkAction,
    OpenClawLeadCreate,
    OpenClawLeadUpdate,
    OpenClawSqlQuery,
    OpenClawTelegramSend,
    OpenClawUserCreate,
    OpenClawUserUpdate,
)

log = logging.getLogger("openclaw.bridge")

router = APIRouter(prefix="/openclaw", tags=["openclaw"])

# Audit file bổ trợ (best-effort) — nhật ký chính do audit_store/middleware lo.
_AUDIT_DIR = Path(os.environ.get("ELC_DATA_DIR", "/app/data"))


# ---------------------------------------------------------------------------
# Audit (best-effort — KHÔNG bao giờ làm hỏng request nếu ghi lỗi)
# ---------------------------------------------------------------------------
def _audit(actor: str, action: str, target: str, payload: Dict[str, Any] | None = None) -> None:
    try:
        _AUDIT_DIR.mkdir(parents=True, exist_ok=True)
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
        with (_AUDIT_DIR / "openclaw_audit.log").open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:  # noqa: BLE001 — audit phụ trợ, nuốt mọi lỗi
        pass


# ---------------------------------------------------------------------------
# Mask body cho audit log (gọi từ middleware app/main.py)
# ---------------------------------------------------------------------------
_SENSITIVE_KEYS = {
    "password", "new_password", "temp_password", "token", "authorization",
    "x-openclaw-token", "secret", "api_key", "apikey", "smtp_password",
    "access_token", "refresh_token", "client_secret", "god_token",
}


def _mask_obj(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: ("***" if str(k).lower() in _SENSITIVE_KEYS else _mask_obj(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_mask_obj(i) for i in obj]
    return obj


def parse_and_mask_body(body: bytes, content_type: str = "") -> Optional[Dict[str, Any]]:
    """Đọc body request JSON và mask field nhạy cảm (password/token…) cho audit.

    Trả dict đã mask, hoặc None nếu body rỗng / không phải JSON (không log raw để
    tránh lộ dữ liệu nhạy cảm dạng nhị phân/form).
    """
    if not body:
        return None
    if "application/json" not in (content_type or "").lower():
        return None
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None
    masked = _mask_obj(data)
    return masked if isinstance(masked, dict) else {"_value": masked}


# ---------------------------------------------------------------------------
# Auth — require_god (X-Openclaw-Token ưu tiên, Authorization Bearer fallback)
# ---------------------------------------------------------------------------
def _expected_token() -> str:
    """Token kỳ vọng: settings trước, fallback env. Trống → bridge fail-closed."""
    return settings.openclaw_god_token or os.environ.get("OPENCLAW_GOD_TOKEN", "")


def require_god(
    x_openclaw_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
) -> str:
    """Xác thực God-Mode. Trả principal 'openclaw_ceo'. 403 nếu thiếu/sai/chưa cấu hình."""
    expected = _expected_token()
    # Lấy token client gửi: ưu tiên X-Openclaw-Token, fallback Authorization Bearer.
    presented = (x_openclaw_token or "").strip()
    if not presented and authorization and authorization.lower().startswith("bearer "):
        presented = authorization.split(None, 1)[1].strip()

    if not expected or not presented:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OpenClaw token required",
        )
    if not secrets.compare_digest(presented, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid OpenClaw token",
        )
    return "openclaw_ceo"


GodActor = Depends(require_god)


# ---------------------------------------------------------------------------
# SQL read-only validation (dùng cho /db/query — test phụ thuộc hàm này)
# ---------------------------------------------------------------------------
_SQL_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|into|"
    r"merge|replace|exec|execute|call|copy|attach|pragma|vacuum)\b",
    re.IGNORECASE,
)


def validate_select_sql(sql: str) -> bool:
    """Đảm bảo `sql` là 1 câu SELECT/WITH chỉ-đọc. Raise ValueError nếu vi phạm."""
    s = (sql or "").strip()
    if not s:
        raise ValueError("SQL rỗng")
    core = s.rstrip().rstrip(";").rstrip()  # cho phép tối đa 1 dấu ; ở cuối
    if ";" in core:
        raise ValueError("Chỉ cho phép 1 câu lệnh duy nhất")
    if "--" in core or "/*" in core:
        raise ValueError("Không cho phép comment trong SQL")
    low = core.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise ValueError("Chỉ cho phép SELECT/WITH (read-only)")
    if _SQL_FORBIDDEN.search(core):
        raise ValueError("Phát hiện từ khoá ghi/DDL — chỉ cho phép đọc")
    return True


# ---------------------------------------------------------------------------
# Helpers — telegram / email
# ---------------------------------------------------------------------------
def _telegram_token() -> str:
    return settings.openclaw_telegram_bot_token or settings.telegram_bot_token or ""


def _send_telegram(token: str, chat_id: str, text: str, parse_mode: Optional[str]) -> None:
    payload: Dict[str, Any] = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    with httpx.Client(timeout=10.0) as c:
        r = c.post(f"https://api.telegram.org/bot{token}/sendMessage", json=payload)
    if r.status_code != 200 or not (r.json() or {}).get("ok"):
        raise RuntimeError(f"Telegram API {r.status_code}: {r.text[:200]}")


def _smtp_cfg() -> dict:
    """{host, port, user, password, from, use_tls} — store (integrations) → env."""
    from app.core import integrations_store

    return integrations_store.get_credential("email_smtp")


def _email_ready() -> bool:
    """Có thể gửi email không: ƯU TIÊN Gmail API (Workspace) → fallback SMTP host."""
    from app.core import gmail_sender

    return gmail_sender.is_available() or bool(_smtp_cfg().get("host"))


def _send_email_smtp(to: List[str], subject: str, body: str, html: bool = False) -> None:
    """Gửi qua SMTP (ép IPv4). Phương án phụ cho ai dùng provider SMTP riêng."""
    cfg = _smtp_cfg()
    msg = EmailMessage()
    msg["From"] = cfg.get("from") or cfg.get("user")
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    if html:
        msg.set_content("Email yêu cầu trình xem HTML.")
        msg.add_alternative(body, subtype="html")
    else:
        msg.set_content(body)
    from app.core import smtp_ipv4

    host = cfg.get("host")
    port = int(cfg.get("port") or 587)
    use_ssl = port == 465
    use_tls = bool(cfg.get("use_tls")) and not use_ssl
    # Ép IPv4 (Railway không có route IPv6) + giữ hostname gốc cho TLS.
    with smtp_ipv4.open_smtp(
        host, port, use_ssl=use_ssl, use_tls=use_tls, timeout=15
    ) as server:
        if cfg.get("user"):
            server.login(cfg.get("user"), cfg.get("password") or "")
        server.send_message(msg)


def _send_email(to: List[str], subject: str, body: str, html: bool = False) -> None:
    """Gửi email: ƯU TIÊN Gmail API (qua Google Workspace, HTTPS — không bị Railway
    chặn cổng SMTP), FALLBACK SMTP nếu Gmail API chưa sẵn sàng hoặc gặp lỗi.

    Railway chặn cổng SMTP outbound nên Gmail API là phương án chính. SMTP (đã ép
    IPv4) giữ lại cho ai cấu hình provider SMTP riêng.
    """
    from app.core import gmail_sender

    has_smtp = bool(_smtp_cfg().get("host"))

    # 1) Ưu tiên Gmail API khi Workspace đã kết nối + có scope gmail.send.
    if gmail_sender.is_available():
        try:
            gmail_sender.send_email(to, subject, body, html=html)
            return
        except gmail_sender.GmailSenderError as exc:
            if not has_smtp:
                # Không có SMTP để fallback → ném lỗi rõ ràng của Gmail API.
                raise RuntimeError(str(exc))
            log.warning("Gmail API gửi lỗi, fallback SMTP: %s", exc)

    # 2) Fallback SMTP (provider khác / chưa cấp scope gmail.send).
    if not has_smtp:
        raise RuntimeError(
            "Chưa cấu hình kênh gửi email: chưa kết nối Google Workspace với quyền "
            "gmail.send và cũng chưa cấu hình SMTP."
        )
    _send_email_smtp(to, subject, body, html=html)


# ===========================================================================
# User management
# ===========================================================================
@router.get("/users")
def list_users(actor: str = GodActor) -> Dict[str, Any]:
    users = [user_store.public_view(u) for u in user_store.list_users()]
    _audit(actor, "users.list", "ALL", {"count": len(users)})
    return {"users": users, "count": len(users)}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(body: OpenClawUserCreate, actor: str = GodActor) -> Dict[str, Any]:
    raw_pw = body.password or secrets.token_urlsafe(12)
    generated = body.password is None
    try:
        user = user_store.create_user(
            email=str(body.email),
            full_name=body.full_name,
            password_hash=hash_password(raw_pw),
            phone=body.phone,
            role=body.role if body.role in ("client", "sale", "admin") else "sale",
            region=body.region,
            upline_email=body.upline_email,
        )
    except ValueError as e:
        raise HTTPException(409, str(e))
    _audit(actor, "users.create", user["id"], {"role": user.get("role")})
    return {
        "user": user_store.public_view(user),
        "generated_password": raw_pw if generated else None,
    }


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: OpenClawUserUpdate, actor: str = GodActor) -> Dict[str, Any]:
    try:
        user = user_store.update_user(
            user_id,
            role=body.role,
            is_active=body.is_active,
            full_name=body.full_name,
            phone=body.phone,
            email=str(body.email) if body.email else None,
            region=body.region,
            upline_email=body.upline_email,
        )
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not user:
        raise HTTPException(404, "user not found")
    if body.password:
        user_store.set_password(user_id, hash_password(body.password))
    _audit(actor, "users.update", user_id, {})
    return {"ok": True, "user": user_store.public_view(user)}


@router.delete("/users/{user_id}")
def soft_delete_user(user_id: str, actor: str = GodActor) -> Dict[str, Any]:
    user = user_store.soft_delete(user_id)
    if not user:
        raise HTTPException(404, "user not found")
    _audit(actor, "users.soft_delete", user_id, {})
    return {"ok": True, "user_id": user_id, "is_active": user.get("is_active", False)}


@router.post("/users/{user_id}/impersonate")
def impersonate(user_id: str, actor: str = GodActor) -> Dict[str, Any]:
    user = user_store.find_by_id(user_id)
    if not user:
        raise HTTPException(404, "user not found")
    token, expires_in = create_access_token(
        subject=user["id"],
        extra_claims={"email": user["email"], "role": user.get("role", "sale")},
    )
    _audit(actor, "users.impersonate", user_id, {})
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in}


# ===========================================================================
# Leads (CRM)
# ===========================================================================
@router.get("/leads")
def list_leads(
    status_filter: Optional[str] = None,
    sale_id: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    actor: str = GodActor,
) -> Dict[str, Any]:
    result = lead_store.list_all_leads(
        status=status_filter, sale_id=sale_id, source=source, search=search,
        page=page, page_size=page_size,
    )
    _audit(actor, "leads.list", "ALL", {"total": result.get("total", 0)})
    return result


@router.post("/leads", status_code=status.HTTP_201_CREATED)
def create_lead(body: OpenClawLeadCreate, actor: str = GodActor) -> Dict[str, Any]:
    lead = lead_store.create_lead(
        {
            "name": body.name,
            "phone": body.phone,
            "email": str(body.email) if body.email else None,
            "note": body.note,
            "source": body.source,
        },
        assigned_sale_id=body.assigned_sale_id,
        status=body.status or "cold",
    )
    _audit(actor, "leads.create", lead["id"], {})
    return {"ok": True, "lead": lead}


@router.patch("/leads/{lead_id}")
def update_lead(lead_id: str, body: OpenClawLeadUpdate, actor: str = GodActor) -> Dict[str, Any]:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    lead = lead_store.update_lead(lead_id, **fields)
    if not lead:
        raise HTTPException(404, "lead not found")
    _audit(actor, "leads.update", lead_id, {})
    return {"ok": True, "lead": lead}


@router.post("/leads/{lead_id}/assign-hot")
def assign_hot(lead_id: str, body: OpenClawAssignHot, actor: str = GodActor) -> Dict[str, Any]:
    sale = user_store.find_by_id(body.sale_id)
    if not sale or sale.get("role") not in ("sale", "admin"):
        raise HTTPException(400, "sale_id không hợp lệ (không tìm thấy hoặc không phải sale)")
    if not lead_store.get_lead(lead_id):
        raise HTTPException(404, "lead not found")
    lead_store.mark_as_hot(lead_id)
    lead = lead_store.assign_lead(lead_id, body.sale_id)
    _audit(actor, "leads.assign_hot", lead_id, {"sale_id": body.sale_id})
    return {"ok": True, "lead": lead}


@router.post("/leads/bulk-action")
def lead_bulk_action(body: OpenClawLeadBulkAction, actor: str = GodActor) -> Dict[str, Any]:
    affected = 0
    for lid in body.lead_ids:
        ok = None
        if body.action == "assign":
            if not body.sale_id:
                raise HTTPException(400, "action=assign cần sale_id")
            ok = lead_store.assign_lead(lid, body.sale_id)
        elif body.action == "mark_hot":
            ok = lead_store.mark_as_hot(lid)
        elif body.action == "set_status":
            if not body.status:
                raise HTTPException(400, "action=set_status cần status")
            ok = lead_store.update_lead(lid, status=body.status)
        elif body.action == "soft_delete":
            ok = lead_store.soft_delete(lid)
        if ok:
            affected += 1
    _audit(actor, "leads.bulk_action", body.action, {"affected": affected})
    return {"ok": True, "action": body.action, "affected": affected}


# ===========================================================================
# Inventory
# ===========================================================================
@router.get("/inventory")
def list_inventory(actor: str = GodActor) -> Dict[str, Any]:
    units = inventory_store.get_all()
    _audit(actor, "inventory.list", "ALL", {"count": len(units)})
    return {"units": units, "count": len(units)}


@router.patch("/inventory/{unit_id}")
def update_inventory(unit_id: str, body: OpenClawInventoryUpdate, actor: str = GodActor) -> Dict[str, Any]:
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    unit = inventory_store.update(unit_id, changes)
    if not unit:
        raise HTTPException(404, "unit not found")
    _audit(actor, "inventory.update", unit_id, {"fields": list(changes)})
    return {"ok": True, "unit": unit}


@router.post("/inventory/bulk-update")
def bulk_update_inventory(body: OpenClawInventoryBulkUpdate, actor: str = GodActor) -> Dict[str, Any]:
    changes = {k: v for k, v in body.changes.model_dump().items() if v is not None}
    affected = 0
    for uid in body.unit_ids:
        if inventory_store.update(uid, changes):
            affected += 1
    _audit(actor, "inventory.bulk_update", "MANY", {"affected": affected})
    return {"ok": True, "affected": affected}


@router.post("/inventory/sync-from-sheet")
def sync_inventory_from_sheet(actor: str = GodActor) -> Dict[str, Any]:
    # Đồng bộ từ Google Sheets đã có luồng riêng ở Admin (inventory_sync) cần OAuth
    # + cấu hình sheet; chưa wire qua bridge để tránh thao tác ghi rủi ro tự động.
    raise HTTPException(
        501,
        "Đồng bộ Sheets chạy ở Admin → Inventory Sync; chưa mở qua OpenClaw bridge.",
    )


# ===========================================================================
# Commission
# ===========================================================================
@router.get("/commission/config")
def get_commission_config(actor: str = GodActor) -> Dict[str, Any]:
    cfg = commission_config_store.get_current()
    _audit(actor, "commission.config.get", "ALL", {"version": cfg.version})
    return cfg.model_dump(mode="json")


@router.patch("/commission/config")
def patch_commission_config(body: Dict[str, Any], actor: str = GodActor) -> Dict[str, Any]:
    current = commission_config_store.get_current().model_dump(mode="json")
    # Merge nông các field gửi lên (vd total_pool_percentage / tiers / kpi tiers).
    merged = {**current, **(body or {})}
    try:
        new_cfg = CommissionConfig.model_validate(merged)
        saved = commission_config_store.update(new_cfg, by_admin_id="openclaw_ceo")
    except (ValueError, Exception) as e:  # noqa: BLE001 — validate lỗi → 400 rõ ràng
        raise HTTPException(400, f"Cấu hình hoa hồng không hợp lệ: {e}")
    _audit(actor, "commission.config.patch", "ALL", {"version": saved.version})
    return saved.model_dump(mode="json")


# ===========================================================================
# Database — read-only query
# ===========================================================================
@router.post("/db/query")
def db_query(body: OpenClawSqlQuery, actor: str = GodActor) -> Dict[str, Any]:
    try:
        validate_select_sql(body.sql)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not settings.database_url:
        raise HTTPException(503, "DATABASE_URL chưa cấu hình — không chạy được query.")
    try:
        import psycopg2  # type: ignore
        import psycopg2.extras  # type: ignore

        conn = psycopg2.connect(settings.database_url, connect_timeout=10)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SET statement_timeout = 30000")
                cur.execute(body.sql)
                rows = cur.fetchmany(body.max_rows)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Query lỗi: {exc}")
    _audit(actor, "db.query", "SELECT", {"rows": len(rows)})
    return {"rows": [dict(r) for r in rows], "count": len(rows)}


# ===========================================================================
# Analytics & reports
# ===========================================================================
@router.get("/kpi/realtime")
def kpi_realtime(actor: str = GodActor) -> Dict[str, Any]:
    lead_stats = lead_store.compute_stats()
    units = inventory_store.get_all()
    by_status: Dict[str, int] = {}
    for u in units:
        s = u.get("trang_thai") or u.get("status") or "unknown"
        by_status[s] = by_status.get(s, 0) + 1
    try:
        from app.core import match_service

        live = match_service.get_match_stats("today")
    except Exception:  # noqa: BLE001 — Live Match là phụ, không làm hỏng KPI
        live = {}
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "leads": lead_stats,
        "inventory": {"total": len(units), "by_status": by_status},
        "live_match": live,
    }
    _audit(actor, "kpi.realtime", "ALL", {})
    return payload


@router.get("/kpi/period")
def kpi_period(date_from: Optional[str] = None, date_to: Optional[str] = None, actor: str = GodActor) -> Dict[str, Any]:
    # Store JSON hiện chưa có index theo ngày → trả tổng hợp toàn kỳ + ghi rõ phạm vi.
    stats = lead_store.compute_stats()
    _audit(actor, "kpi.period", f"{date_from}..{date_to}", {})
    return {"from": date_from, "to": date_to, "scope": "all_time", "leads": stats}


@router.get("/sales/performance")
def sales_performance(period: str = "week", actor: str = GodActor) -> Dict[str, Any]:
    sales = [u for u in user_store.list_users() if u.get("role") == "sale"]
    ranking = sale_task_store.rank_sales_by_eligibility(sales)
    _audit(actor, "sales.performance", period, {"count": len(ranking)})
    return {"period": period, "ranking": ranking}


@router.get("/audit-log")
def audit_log(limit: int = 100, actor: str = GodActor) -> Dict[str, Any]:
    events = audit_store.list_events(prefix=("admin.", "openclaw."), limit=limit)
    return {"events": events, "count": len(events)}


@router.get("/cost/anthropic")
def cost_anthropic(actor: str = GodActor) -> Dict[str, Any]:
    if not settings.anthropic_admin_key:
        return {"configured": False, "detail": "Thiếu ANTHROPIC_ADMIN_KEY."}
    # Anthropic Admin/usage API chưa wire chi tiết — tránh bịa số liệu.
    raise HTTPException(501, "Truy vấn chi phí Anthropic chưa được triển khai trong bản này.")


@router.get("/cost/railway")
def cost_railway(actor: str = GodActor) -> Dict[str, Any]:
    if not settings.railway_api_token:
        return {"configured": False, "detail": "Thiếu RAILWAY_API_TOKEN."}
    raise HTTPException(501, "Truy vấn billing Railway chưa được triển khai trong bản này.")


# ===========================================================================
# Communication
# ===========================================================================
@router.post("/telegram/send")
def telegram_send(body: OpenClawTelegramSend, actor: str = GodActor) -> Dict[str, Any]:
    token = _telegram_token()
    if not token:
        raise HTTPException(
            503, "Chưa cấu hình OPENCLAW_TELEGRAM_BOT_TOKEN (hoặc TELEGRAM_BOT_TOKEN)."
        )
    chat_id = body.chat_id or settings.openclaw_ceo_chat_id
    if not chat_id:
        raise HTTPException(400, "Thiếu chat_id và OPENCLAW_CEO_CHAT_ID chưa đặt.")
    try:
        _send_telegram(token, str(chat_id), body.text, body.parse_mode)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Gửi Telegram lỗi: {exc}")
    _audit(actor, "telegram.send", str(chat_id), {})  # KHÔNG log nội dung tin
    return {"ok": True, "chat_id": str(chat_id)}


@router.post("/email/send")
def email_send(body: OpenClawEmailSend, actor: str = GodActor) -> Dict[str, Any]:
    if not _email_ready():
        raise HTTPException(
            503,
            "Chưa có kênh gửi email: kết nối Google Workspace (cấp quyền gmail.send) "
            "hoặc cấu hình SMTP.",
        )
    try:
        _send_email([str(t) for t in body.to], body.subject, body.body, html=body.html)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Gửi email lỗi: {exc}")
    _audit(actor, "email.send", ",".join(str(t) for t in body.to), {"subject": body.subject})
    return {"ok": True, "sent": len(body.to)}


@router.post("/announce")
def announce(body: OpenClawAnnounce, actor: str = GodActor) -> Dict[str, Any]:
    users = user_store.list_users()
    if body.audience == "all_sales":
        recipients = [u for u in users if u.get("role") == "sale" and u.get("is_active", True)]
    elif body.audience == "all_admins":
        recipients = [u for u in users if u.get("role") == "admin" and u.get("is_active", True)]
    else:
        ids = set(body.user_ids)
        recipients = [u for u in users if u["id"] in ids]

    tg_token = _telegram_token()
    results = {
        "telegram": {"sent": 0, "skipped": 0, "errors": 0},
        "email": {"sent": 0, "skipped": 0, "errors": 0},
    }
    for u in recipients:
        if "telegram" in body.channels:
            cid = u.get("telegram_chat_id")
            if not tg_token or not cid:
                results["telegram"]["skipped"] += 1
            else:
                try:
                    _send_telegram(tg_token, str(cid), body.message, None)
                    results["telegram"]["sent"] += 1
                except Exception:  # noqa: BLE001 — 1 người lỗi không chặn cả lô
                    results["telegram"]["errors"] += 1
        if "email" in body.channels:
            email = u.get("email")
            if not _email_ready() or not email:
                results["email"]["skipped"] += 1
            else:
                try:
                    _send_email([email], body.subject, body.message, html=False)
                    results["email"]["sent"] += 1
                except Exception:  # noqa: BLE001
                    results["email"]["errors"] += 1

    _audit(actor, "announce", body.audience, {"recipients": len(recipients)})
    return {
        "ok": True,
        "audience": body.audience,
        "recipients": len(recipients),
        "channels": body.channels,
        "results": results,
    }


# ===========================================================================
# Platform health & control
# ===========================================================================
def _check_http(name: str, url: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {"name": name, "url": url, "ok": False, "status": None, "error": None}
    try:
        with httpx.Client(timeout=5.0) as c:
            r = c.get(url)
            out["status"] = r.status_code
            out["ok"] = 200 <= r.status_code < 400
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
    return out


@router.get("/platforms/health")
def platforms_health(actor: str = GodActor) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    # Postgres (best-effort).
    pg = {"name": "postgres", "ok": False, "error": None}
    if settings.database_url:
        try:
            import psycopg2  # type: ignore

            conn = psycopg2.connect(settings.database_url, connect_timeout=5)
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            conn.close()
            pg["ok"] = True
        except Exception as exc:  # noqa: BLE001
            pg["error"] = str(exc)
    else:
        pg["error"] = "DATABASE_URL chưa đặt"
    checks.append(pg)

    # Chatwoot (nếu cấu hình).
    if settings.chatwoot_base_url:
        checks.append(_check_http("chatwoot", settings.chatwoot_base_url.rstrip("/")))

    # Cấu hình kênh (không gọi mạng — chỉ báo đã cấu hình hay chưa).
    checks.append({"name": "telegram", "configured": bool(_telegram_token())})
    checks.append({"name": "smtp", "configured": bool(_smtp_cfg().get("host"))})
    # Email qua Gmail API (ưu tiên hơn SMTP vì Railway chặn cổng SMTP outbound).
    try:
        from app.core import gmail_sender

        checks.append({
            "name": "email_google",
            "configured": gmail_sender.is_available(),
            "connected": gmail_sender.is_connected(),
            "has_send_scope": gmail_sender.has_send_scope(),
        })
    except Exception as exc:  # noqa: BLE001
        checks.append({"name": "email_google", "configured": False, "error": str(exc)})
    checks.append({"name": "railway", "configured": bool(settings.railway_api_token)})

    overall = all(c.get("ok", True) for c in checks)
    _audit(actor, "platforms.health", "ALL", {"ok": overall})
    return {"ok": overall, "ts": datetime.now(timezone.utc).isoformat(), "checks": checks}


@router.post("/platforms/restart/{service}")
def restart_service(service: str, actor: str = GodActor) -> Dict[str, Any]:
    token = settings.railway_api_token or os.environ.get("RAILWAY_API_TOKEN", "")
    if not token:
        raise HTTPException(503, "RAILWAY_API_TOKEN chưa cấu hình — không restart được.")
    svc_id = os.environ.get(f"RAILWAY_SERVICE_{service.upper()}_ID")
    if not svc_id:
        raise HTTPException(424, f"Thiếu RAILWAY_SERVICE_{service.upper()}_ID để map service.")
    env_id = os.environ.get("RAILWAY_ENV_ID")
    query = (
        "mutation Redeploy($serviceId: String!, $environmentId: String) "
        "{ serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }"
    )
    variables: Dict[str, Any] = {"serviceId": svc_id}
    if env_id:
        variables["environmentId"] = env_id
    try:
        with httpx.Client(timeout=15.0) as c:
            r = c.post(
                "https://backboard.railway.app/graphql/v2",
                headers={"Authorization": f"Bearer {token}"},
                json={"query": query, "variables": variables},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Railway API lỗi: {exc}")
    _audit(actor, "platforms.restart", service, {})
    return {"ok": True, "service": service, "railway_response": data}


@router.get("/logs/{service}")
def service_logs(service: str, lines: int = 100, actor: str = GodActor) -> Dict[str, Any]:
    token = settings.railway_api_token or os.environ.get("RAILWAY_API_TOKEN", "")
    if not token:
        raise HTTPException(503, "RAILWAY_API_TOKEN chưa cấu hình — không lấy được logs.")
    # Railway logs cần deployment id + GraphQL subscription; chưa wire trong bản này.
    raise HTTPException(
        501,
        "Lấy logs Railway chưa được triển khai (cần map deployment id). Dùng Railway dashboard.",
    )
