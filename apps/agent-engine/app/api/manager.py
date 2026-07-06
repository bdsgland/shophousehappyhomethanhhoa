"""Manager / Trung tâm điều hành — báo cáo tổng hợp + ra lệnh (prefix /admin/manager).

Khác OpenClaw bridge (/openclaw/*, dùng God token cho bot CEO bên ngoài): router
này dành cho ADMIN ĐÃ ĐĂNG NHẬP (require_admin), gọi TRỰC TIẾP các store/hàm nội
bộ — KHÔNG đi vòng qua HTTP OpenClaw, KHÔNG yêu cầu God token.

Cung cấp:
  - GET  /overview                 — gộp KPI điều hành (read-only).
  - POST /broadcast                — gửi thông báo Telegram + in-app (side-effect).
  - POST /assign-hot-leads         — phân bổ hot lead đang chờ (side-effect).
  - POST /platforms/{service}/restart — redeploy qua Railway nếu cấu hình (side-effect).
  - POST /command                  — ô lệnh ngôn ngữ tự nhiên → Claude diễn giải →
                                     MAP whitelist hành động an toàn. Hành động có
                                     side-effect TRẢ đề xuất + requires_confirmation,
                                     KHÔNG tự thực thi. Lệnh nguy hiểm → từ chối.

AN TOÀN: whitelist cứng; KHÔNG xóa user / đổi quyền / chuyển tiền / sửa cấu hình
hoa hồng / chạy SQL ghi qua ô lệnh. Mọi hành động side-effect ghi audit
(audit_store.record_admin). Bắt lỗi gọn — không để 500 trần.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.api import inventory as inventory_module
from app.api.deps import require_admin
from app.core import (
    announcement_store,
    audit_store,
    commission_store,
    inventory_store,
    lead_store,
    sale_task_store,
    settings_store,
    user_store,
)
from app.core.settings import settings
from app.schemas.manager import (
    ManagerAssignHotLeads,
    ManagerBroadcast,
    ManagerCommand,
    ManagerDecisionAct,
    ManagerImprovementsRequest,
)

log = logging.getLogger("admin.manager")

router = APIRouter(prefix="/admin/manager", tags=["admin-manager"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ===========================================================================
# Báo cáo — tổng hợp KPI điều hành (read-only)
# ===========================================================================
def _commission_summary() -> Dict[str, Any]:
    """Tổng hợp hoa hồng từ commission_store (flatten theo bậc, gộp theo trạng thái)."""
    records = commission_store.list_records(limit=1000)
    total = 0.0
    by_status: Dict[str, Dict[str, Any]] = {}
    for rec in records:
        st = rec.get("status", "pending")
        bucket = by_status.setdefault(st, {"count": 0, "amount": 0.0})
        bucket["count"] += 1
        for tier in rec.get("tiers", []):
            amt = float(tier.get("amount", 0) or 0)
            total += amt
            bucket["amount"] += amt
    return {
        "deals": len(records),
        "total_amount": round(total),
        "by_status": {k: {"count": v["count"], "amount": round(v["amount"])}
                      for k, v in by_status.items()},
    }


def _sales_kpi() -> Dict[str, Any]:
    """KPI doanh số / quỹ căn (tái dùng đúng logic admin dashboard, không bịa từ mock)."""
    inventory_is_demo = inventory_store.is_empty()
    units = inventory_module.get_units()
    reserved = sum(1 for u in units if u["trang_thai"] == "Đặt cọc")
    sold = sum(1 for u in units if u["trang_thai"] == "Đã bán")
    available = sum(1 for u in units if u["trang_thai"] == "Còn hàng")
    commission_rate = settings_store.commission_rate()
    if inventory_is_demo:
        orders = 0
        revenue_projection = 0.0
    else:
        booked_value = sum(
            u["gia_tri"] for u in units if u["trang_thai"] in ("Đặt cọc", "Đã bán")
        )
        orders = reserved
        revenue_projection = round(booked_value * commission_rate, 2)
    return {
        "orders_reserved": orders,
        "revenue_projection_ty": revenue_projection,
        "commission_rate": commission_rate,
        "inventory": {
            "total": len(units),
            "available": available,
            "sold": sold,
            "reserved": reserved,
            "is_demo": inventory_is_demo,
        },
    }


async def _automation_overview() -> Dict[str, Any]:
    """Tổng quan automation n8n (active/lỗi). Lỗi/chưa cấu hình → trả gọn, không raise."""
    try:
        from app.core import n8n_admin

        if not n8n_admin.is_configured():
            return {"configured": False}
        workflows = await n8n_admin.list_workflows()
        executions = await n8n_admin.list_executions(limit=100)
        active = sum(1 for w in workflows if w.get("active"))
        today = datetime.now(timezone.utc).date()
        runs_today = 0
        errors_recent = 0
        for e in executions:
            started = e.get("startedAt")
            try:
                if started and datetime.fromisoformat(
                    str(started).replace("Z", "+00:00")
                ).astimezone(timezone.utc).date() == today:
                    runs_today += 1
            except Exception:  # noqa: BLE001
                pass
            if e.get("status") == "error":
                errors_recent += 1
        return {
            "configured": True,
            "total": len(workflows),
            "active": active,
            "inactive": len(workflows) - active,
            "runs_today": runs_today,
            "errors_recent": errors_recent,
        }
    except Exception as exc:  # noqa: BLE001 — automation phụ, không làm hỏng overview
        log.warning("manager overview: automation lỗi: %s", exc)
        return {"configured": False, "error": "Không lấy được trạng thái automation."}


def _platforms_config() -> List[Dict[str, Any]]:
    return [
        {"key": "api", "name": "Agent Engine (API)", "url": "self"},
        {"key": "n8n", "name": "n8n Automation", "url": settings.platform_n8n_url},
        {"key": "dify", "name": "Dify", "url": settings.platform_dify_url},
        {"key": "bot", "name": "OpenClaw", "url": settings.platform_bot_url},
        {"key": "chat", "name": "Chatwoot", "url": settings.platform_chat_url},
    ]


async def _platforms_health() -> List[Dict[str, Any]]:
    """Ping sức khoẻ nền tảng từ server (tránh CORS). up nếu HTTP < 500."""
    results: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=False) as client:
            for p in _platforms_config():
                entry = {"key": p["key"], "name": p["name"], "url": p["url"]}
                if p["url"] == "self":
                    entry.update({"url": "https://api-happyhomethanhhoa.bdsg.land",
                                  "status": "up", "code": 200})
                    results.append(entry)
                    continue
                try:
                    r = await client.get(
                        p["url"], headers={"User-Agent": "HH-Manager-HealthCheck/1.0"}
                    )
                    entry["code"] = r.status_code
                    entry["status"] = "up" if r.status_code < 500 else "down"
                except Exception as e:  # noqa: BLE001
                    entry["code"] = None
                    entry["status"] = "down"
                    entry["error"] = type(e).__name__
                results.append(entry)
    except Exception as exc:  # noqa: BLE001
        log.warning("manager overview: platforms health lỗi: %s", exc)
    return results


def _top_sales(limit: int = 5) -> List[Dict[str, Any]]:
    sales = [u for u in user_store.list_users() if u.get("role") == "sale"]
    try:
        ranking = sale_task_store.rank_sales_by_eligibility(sales)
    except Exception as exc:  # noqa: BLE001
        log.warning("manager overview: top sales lỗi: %s", exc)
        return []
    return ranking[:limit]


def _openclaw_status() -> Dict[str, Any]:
    return {
        "configured": bool(settings.openclaw_god_token),
        "telegram_configured": bool(
            settings.openclaw_telegram_bot_token or settings.telegram_bot_token
        ),
        "bot_url": settings.platform_bot_url,
    }


async def _build_overview() -> Dict[str, Any]:
    """Gộp toàn bộ KPI điều hành. Mỗi mảng tự bắt lỗi để 1 phần hỏng không sập cả."""
    try:
        leads = lead_store.compute_stats()
    except Exception as exc:  # noqa: BLE001
        log.warning("manager overview: lead stats lỗi: %s", exc)
        leads = {}
    return {
        "generated_at": _now_iso(),
        "sales": _sales_kpi(),
        "leads": leads,
        "top_sales": _top_sales(),
        "commission": _commission_summary(),
        "automation": await _automation_overview(),
        "platforms": await _platforms_health(),
        "openclaw": _openclaw_status(),
    }


@router.get("/overview")
async def overview(_admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    """Tổng hợp KPI điều hành cho trang Manager (doanh số · lead funnel · hoa hồng
    · automation · sức khoẻ nền tảng)."""
    return await _build_overview()


# ===========================================================================
# Báo cáo HỆ THỐNG — số thật tổng hợp cho mục "Giới thiệu hệ thống" (read-only)
# ===========================================================================
# Mỗi mảng tự bắt lỗi và trả null khi store chưa có dữ liệu — KHÔNG để 1 phần
# hỏng làm sập cả báo cáo. FE hiển thị "—" cho mọi giá trị null.

def _leads_section() -> Dict[str, Any]:
    """Tổng lead + phân bố Nóng/Ấm/Lạnh (số thật từ lead_store)."""
    try:
        stats = lead_store.compute_stats()
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: lead stats lỗi: %s", exc)
        return {"available": False}
    return {
        "available": True,
        "total": stats.get("total_leads", 0),
        "hot": stats.get("hot_leads", 0),
        "warm": stats.get("warm_leads", 0),
        "cold": stats.get("cold_leads", 0),
        "customers": stats.get("customers", 0),
        "lost": stats.get("lost_leads", 0),
        "conversion_rate": stats.get("conversion_rate", 0.0),
        "top_sources": stats.get("top_sources", []),
    }


def _funnel_section(leads: Dict[str, Any], sales: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Phễu chuyển đổi lead → hẹn (meet) → cọc → ký. Chặng thiếu dữ liệu → count=None."""
    inv = sales.get("inventory", {}) if isinstance(sales, dict) else {}
    is_demo = bool(inv.get("is_demo", True))

    # Số lịch hẹn (Google Meet / booking) — best-effort.
    meet_count: Optional[int] = None
    try:
        from app.core import booking_store

        bookings = booking_store.list_all()
        meet_count = len(bookings) if bookings else None
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: booking count lỗi: %s", exc)

    total = leads.get("total") if leads.get("available") else None
    customers = leads.get("customers") if leads.get("available") else None
    deposit = inv.get("reserved") if not is_demo else None
    signed = inv.get("sold") if not is_demo else None

    return [
        {"key": "lead", "label": "Lead", "count": total},
        {"key": "meet", "label": "Hẹn gặp / Meet", "count": meet_count},
        {"key": "deposit", "label": "Đặt cọc", "count": deposit},
        {"key": "sign", "label": "Ký HĐ", "count": signed},
        {"key": "customer", "label": "Khách chốt", "count": customers},
    ]


def _ai_care_section() -> Dict[str, Any]:
    """Hàng đợi chăm sóc của Đội Sale AI (số nháp chờ duyệt...)."""
    try:
        from app.core import ai_care_queue_store

        return {"available": True, **ai_care_queue_store.compute_stats()}
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: ai_care queue lỗi: %s", exc)
        return {"available": False}


def _ai_sales_section() -> Dict[str, Any]:
    """Đội Sale AI — số lượng + tải (load_ratio = assigned / capacity)."""
    try:
        from app.core import ai_salesman_store

        stats = ai_salesman_store.compute_stats()
        cap = stats.get("total_capacity", 0) or 0
        assigned = stats.get("total_assigned", 0) or 0
        stats["load_ratio"] = round(assigned / cap, 3) if cap > 0 else 0.0
        return {"available": True, **stats}
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: ai_salesman lỗi: %s", exc)
        return {"available": False}


def _finance_section() -> Dict[str, Any]:
    """Doanh thu / chi phí / lợi nhuận kỳ hiện tại + tổng hoa hồng đã ghi."""
    out: Dict[str, Any] = {"available": False}
    try:
        from app.core import finance_service

        summary = finance_service.period_summary("month")
        out = {
            "available": True,
            "period_label": summary.get("period_label"),
            "revenue": summary.get("revenue", 0.0),
            "cost": summary.get("cost", 0.0),
            "profit": summary.get("profit", 0.0),
            "margin": summary.get("margin", 0.0),
            "deal_count": summary.get("deal_count", 0),
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: finance lỗi: %s", exc)
    try:
        out["commission"] = _commission_summary()
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: commission lỗi: %s", exc)
    return out


def _marketing_section() -> Dict[str, Any]:
    """Tổng quan marketing: chi tiêu, CPL trung bình, CPL theo kênh (best-effort)."""
    try:
        from app.api.admin_marketing import _build_overview as _mkt_overview

        ov = _mkt_overview()
        return {
            "available": True,
            "total_spent": ov.get("total_spent", 0.0),
            "total_leads": ov.get("total_leads", 0),
            "avg_cpl": ov.get("avg_cpl", 0.0),
            "roi": ov.get("roi", 0.0),
            "by_channel": [
                {"channel": c.get("channel"), "leads": c.get("leads", 0),
                 "spent": c.get("spent", 0.0), "cpl": c.get("cpl", 0.0)}
                for c in ov.get("by_channel", [])
            ],
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("system-report: marketing lỗi: %s", exc)
        return {"available": False}


async def build_system_report() -> Dict[str, Any]:
    """Gộp TOÀN BỘ số thật cho mục "Giới thiệu hệ thống".

    Read-only. Mỗi section tự bắt lỗi → available=false / null khi thiếu dữ liệu.
    Dùng chung cho endpoint admin (/system-report) và MCP OpenClaw.
    """
    sales = _sales_kpi()
    leads = _leads_section()
    return {
        "generated_at": _now_iso(),
        "leads": leads,
        "funnel": _funnel_section(leads, sales),
        "sales": sales,
        "finance": _finance_section(),
        "ai_care": _ai_care_section(),
        "ai_sales": _ai_sales_section(),
        "marketing": _marketing_section(),
        "platforms": await _platforms_health(),
        "automation": await _automation_overview(),
        "openclaw": _openclaw_status(),
    }


@router.get("/system-report")
async def system_report(_admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    """Báo cáo dữ liệu trực tuyến (SỐ THẬT) cho mục "Giới thiệu hệ thống":
    lead + phân bố nhiệt, phễu chuyển đổi, tài chính/hoa hồng, hàng đợi chăm sóc
    AI, đội Sale AI + tải, marketing, sức khoẻ nền tảng. Khối thiếu dữ liệu → null."""
    return await build_system_report()


# ===========================================================================
# Ra lệnh — Broadcast (Telegram + in-app announce)
# ===========================================================================
def _resolve_recipients(audience: str, user_ids: List[str]) -> List[dict]:
    users = user_store.list_users()
    if audience == "all_sales":
        return [u for u in users if u.get("role") == "sale" and u.get("is_active", True)]
    if audience == "all_admins":
        return [u for u in users if u.get("role") == "admin" and u.get("is_active", True)]
    ids = set(user_ids)
    return [u for u in users if u["id"] in ids]


def _do_broadcast(body: ManagerBroadcast, admin: dict) -> Dict[str, Any]:
    recipients = _resolve_recipients(body.audience, body.user_ids)
    results: Dict[str, Any] = {
        "inapp": {"created": False},
        "telegram": {"sent": 0, "skipped": 0, "errors": 0},
    }

    # In-app announce — luôn lưu 1 bản ghi nếu chọn kênh inapp.
    if "inapp" in body.channels:
        try:
            announcement_store.create(
                message=body.message,
                audience=body.audience,
                user_ids=body.user_ids,
                title=body.title,
                created_by=admin.get("email", ""),
            )
            results["inapp"]["created"] = True
        except Exception as exc:  # noqa: BLE001
            results["inapp"]["error"] = "Không lưu được thông báo in-app."
            log.warning("broadcast inapp lỗi: %s", exc)

    # Telegram — tái dùng helper của bridge (không cần God token; chỉ là hàm gửi).
    if "telegram" in body.channels:
        try:
            from app.api.openclaw_bridge import _send_telegram, _telegram_token

            token = _telegram_token()
            if not token:
                results["telegram"]["skipped"] = len(recipients)
                results["telegram"]["error"] = "Chưa cấu hình Telegram bot token."
            else:
                text = (f"📢 {body.title}\n\n{body.message}"
                        if body.title else body.message)
                for u in recipients:
                    cid = u.get("telegram_chat_id")
                    if not cid:
                        results["telegram"]["skipped"] += 1
                        continue
                    try:
                        _send_telegram(token, str(cid), text, None)
                        results["telegram"]["sent"] += 1
                    except Exception:  # noqa: BLE001 — 1 người lỗi không chặn cả lô
                        results["telegram"]["errors"] += 1
        except Exception as exc:  # noqa: BLE001
            results["telegram"]["error"] = "Gửi Telegram lỗi hệ thống."
            log.warning("broadcast telegram lỗi: %s", exc)

    audit_store.record_admin(
        "manager.broadcast", admin,
        target=body.audience,
        new_value={"recipients": len(recipients), "channels": body.channels},
        detail=f"broadcast tới {len(recipients)} người",
    )
    return {
        "ok": True,
        "audience": body.audience,
        "recipients": len(recipients),
        "channels": body.channels,
        "results": results,
    }


@router.post("/broadcast")
def broadcast(body: ManagerBroadcast, admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    """Gửi thông báo điều hành (Telegram và/hoặc in-app)."""
    if not body.channels:
        raise HTTPException(400, "Cần chọn ít nhất một kênh (telegram/inapp).")
    if body.audience == "selected" and not body.user_ids:
        raise HTTPException(400, "audience=selected cần ít nhất một user_id.")
    return _do_broadcast(body, admin)


# ===========================================================================
# Ra lệnh — Phân bổ hot lead
# ===========================================================================
def _count_pending_hot() -> int:
    try:
        stats = lead_store.list_all_leads(status="hot", page=1, page_size=1000)
        items = stats.get("items") or stats.get("leads") or []
        return sum(1 for l in items if not l.get("assigned_sale_id"))
    except Exception:  # noqa: BLE001
        return 0


def _do_assign_hot_leads(body: ManagerAssignHotLeads, admin: dict) -> Dict[str, Any]:
    if body.dry_run:
        return {"ok": True, "dry_run": True, "pending": _count_pending_hot()}
    try:
        result = lead_store.distribute_pending_hot_leads()
    except Exception as exc:  # noqa: BLE001
        log.warning("assign-hot-leads lỗi: %s", exc)
        raise HTTPException(502, "Không phân bổ được hot lead (lỗi nội bộ).")
    audit_store.record_admin(
        "manager.assign_hot_leads", admin,
        new_value={"distributed": result.get("distributed", 0)},
        detail=f"phân bổ {result.get('distributed', 0)} hot lead",
    )
    return {"ok": True, **result}


@router.post("/assign-hot-leads")
def assign_hot_leads(
    body: Optional[ManagerAssignHotLeads] = None,
    admin: dict = Depends(require_admin),
) -> Dict[str, Any]:
    """Tự phân bổ toàn bộ hot lead đang chờ cho sale theo eligibility."""
    return _do_assign_hot_leads(body or ManagerAssignHotLeads(), admin)


# ===========================================================================
# Ra lệnh — Restart nền tảng (Railway redeploy) — chỉ khi cấu hình
# ===========================================================================
@router.post("/platforms/{service}/restart")
def restart_platform(service: str, admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    """Redeploy 1 service qua Railway API. Chưa cấu hình → 503 (KHÔNG giả lập)."""
    token = settings.railway_api_token or os.environ.get("RAILWAY_API_TOKEN", "")
    if not token:
        raise HTTPException(503, "Chưa cấu hình RAILWAY_API_TOKEN — không restart được.")
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
        log.warning("restart %s lỗi: %s", service, exc)
        raise HTTPException(502, "Railway API lỗi — không restart được.")
    audit_store.record_admin("manager.platform_restart", admin, target=service)
    return {"ok": True, "service": service, "railway_response": data}


# ===========================================================================
# Ra lệnh — Ô lệnh ngôn ngữ tự nhiên (/command)
# ===========================================================================
# Whitelist hành động an toàn. READ → thực thi ngay; WRITE → cần xác nhận.
_READ_ACTIONS = {"get_overview", "platform_health"}
_WRITE_ACTIONS = {"broadcast", "assign_hot_leads"}
_ALL_ACTIONS = _READ_ACTIONS | _WRITE_ACTIONS

_COMMAND_SYSTEM = (
    "Bạn là bộ điều phối an toàn cho trung tâm điều hành admin của một công ty "
    "bất động sản. Nhiệm vụ: đọc câu lệnh tiếng Việt của quản lý rồi ánh xạ sang "
    "ĐÚNG MỘT hành động trong danh sách whitelist, KÈM tham số. Chỉ được chọn "
    "trong các action sau:\n"
    "- get_overview: xem báo cáo/KPI tổng quan (doanh số, lead, hoa hồng...).\n"
    "- platform_health: kiểm tra sức khoẻ các nền tảng.\n"
    "- broadcast: gửi thông báo. params: {message, audience(all_sales|all_admins), "
    "channels([inapp]|[telegram]|[inapp,telegram])}.\n"
    "- assign_hot_leads: phân bổ hot lead đang chờ cho sale.\n"
    "TUYỆT ĐỐI KHÔNG bịa action khác. Nếu lệnh là xóa dữ liệu, đổi quyền, chuyển "
    "tiền/đổi hoa hồng, chạy SQL, hoặc không rõ ràng → đặt action=null.\n"
    'CHỈ trả JSON: {"action": <str|null>, "params": <obj>, '
    '"summary": <mô tả ngắn ý định bằng tiếng Việt>, '
    '"reason": <nếu action=null, giải thích ngắn>}'
)


def _do_get_overview_sync() -> Dict[str, Any]:
    # Bản đồng bộ rút gọn cho /command (không await automation/platform để nhanh).
    try:
        leads = lead_store.compute_stats()
    except Exception:  # noqa: BLE001
        leads = {}
    return {
        "sales": _sales_kpi(),
        "leads": leads,
        "commission": _commission_summary(),
        "top_sales": _top_sales(),
    }


def _execute_action(action: str, params: Dict[str, Any], admin: dict) -> Dict[str, Any]:
    """Thực thi 1 hành động whitelist đã được xác nhận. Raise 400 nếu ngoài whitelist."""
    if action == "get_overview":
        return {"type": "report", "data": _do_get_overview_sync()}
    if action == "platform_health":
        # platform_health cần async → để FE gọi /overview; ở đây trả gợi ý nhẹ.
        return {"type": "info", "message": "Xem mục Nền tảng trong báo cáo /overview."}
    if action == "broadcast":
        try:
            body = ManagerBroadcast.model_validate(params)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"Tham số broadcast không hợp lệ: {exc}")
        if not body.channels:
            body.channels = ["inapp"]
        return {"type": "action_result", "data": _do_broadcast(body, admin)}
    if action == "assign_hot_leads":
        return {"type": "action_result",
                "data": _do_assign_hot_leads(ManagerAssignHotLeads(), admin)}
    raise HTTPException(400, "Hành động không nằm trong whitelist.")


@router.post("/command")
async def command(body: ManagerCommand, admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    """Ô lệnh ngôn ngữ tự nhiên.

    Luồng 2 bước an toàn:
      1) confirm=False → diễn giải ý định bằng Claude → MAP whitelist. READ thực thi
         ngay; WRITE trả requires_confirmation=True + đề xuất (action/params), KHÔNG
         tự chạy.
      2) confirm=True + action + params → thực thi đúng hành động đã đề xuất.
    """
    # --- Bước 2: xác nhận thực thi hành động đã đề xuất ---
    if body.confirm:
        if body.action not in _ALL_ACTIONS:
            raise HTTPException(400, "Hành động xác nhận không hợp lệ hoặc đã bị chặn.")
        result = _execute_action(body.action, body.params or {}, admin)
        audit_store.record_admin(
            "manager.command_execute", admin,
            target=body.action,
            detail=f"thực thi lệnh: {body.action}",
        )
        return {"ok": True, "executed": True, "action": body.action, "result": result}

    # --- Bước 1: diễn giải ý định ---
    interpreted: Optional[dict] = None
    try:
        from app.core import ai_crm

        interpreted = await ai_crm._call_claude_json(
            _COMMAND_SYSTEM, body.text, max_tokens=400
        )
    except Exception as exc:  # noqa: BLE001 — AI lỗi → fallback an toàn bên dưới
        log.warning("command interpret lỗi: %s", exc)

    if not interpreted or not isinstance(interpreted, dict):
        return {
            "ok": True,
            "executed": False,
            "action": None,
            "requires_confirmation": False,
            "summary": "Chưa hiểu rõ yêu cầu (AI chưa cấu hình hoặc lỗi).",
            "message": "Vui lòng dùng các nút thao tác, hoặc diễn đạt lại lệnh rõ hơn.",
        }

    action = interpreted.get("action")
    params = interpreted.get("params") or {}
    summary = interpreted.get("summary") or ""

    # Lệnh nguy hiểm / không rõ → KHÔNG thực thi, trả lý do.
    if action not in _ALL_ACTIONS:
        return {
            "ok": True,
            "executed": False,
            "action": None,
            "requires_confirmation": False,
            "summary": summary,
            "message": interpreted.get("reason")
            or "Lệnh không thuộc nhóm hành động an toàn được phép. Đã từ chối.",
        }

    # READ → thực thi ngay (không side-effect).
    if action in _READ_ACTIONS:
        result = _execute_action(action, params, admin)
        audit_store.record_admin(
            "manager.command_execute", admin, target=action,
            detail=f"thực thi lệnh đọc: {action}",
        )
        return {
            "ok": True,
            "executed": True,
            "action": action,
            "requires_confirmation": False,
            "summary": summary,
            "result": result,
        }

    # WRITE → trả đề xuất, chờ xác nhận (KHÔNG tự chạy).
    return {
        "ok": True,
        "executed": False,
        "action": action,
        "params": params,
        "requires_confirmation": True,
        "summary": summary,
        "message": "Hành động có ảnh hưởng hệ thống — vui lòng xác nhận để thực thi.",
    }


# ===========================================================================
# Đề xuất cải tiến vận hành (AI) — CHỈ GỢI Ý, KHÔNG tự thực thi
# ===========================================================================
# OpenClaw có thể gọi qua MCP (manager_generate_improvements) để tự lấy báo cáo
# + tạo đề xuất rồi (tuỳ chọn) đẩy qua Telegram. Endpoint admin dưới đây chỉ sinh
# danh sách gợi ý — KHÔNG kèm bất kỳ side-effect nào.

_IMPROVEMENTS_SYSTEM = (
    "Bạn là cố vấn vận hành cho trung tâm điều hành của một công ty bất động sản "
    "dùng nhiều AI & tự động hoá. Bạn nhận một bản BÁO CÁO SỐ THẬT (JSON) về lead, "
    "phễu chuyển đổi, tài chính/hoa hồng, hàng đợi chăm sóc AI, đội Sale AI + tải, "
    "marketing (chi phí/lead theo kênh), sức khoẻ nền tảng. Nhiệm vụ: phân tích số "
    "liệu và đề xuất các CẢI TIẾN VẬN HÀNH cụ thể, có căn cứ từ số liệu (vd 'kênh X "
    "có chi phí/lead cao hơn trung bình → cân nhắc giảm ngân sách', 'SLA nhận khách "
    "nóng đang chậm', 'nhiều nháp chăm sóc AI tồn chờ duyệt', 'tải đội Sale AI cao "
    "→ tăng năng lực'). Mỗi đề xuất KÈM lý do dựa trên số. TUYỆT ĐỐI KHÔNG bịa số "
    "không có trong báo cáo; nếu thiếu dữ liệu thì nói rõ là 'chưa đủ dữ liệu'. "
    "Đây CHỈ là gợi ý cho con người quyết định — KHÔNG ra lệnh thực thi.\n"
    'CHỈ trả JSON đúng dạng: {"improvements": [{"title": <ngắn gọn>, '
    '"area": <lead|marketing|sales_ai|care|finance|platform|automation|other>, '
    '"severity": <high|medium|low>, "detail": <giải thích kèm số liệu>, '
    '"suggested_action": <hành động đề xuất cho người điều hành>}]}'
)


def _heuristic_improvements(report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Fallback KHÔNG cần LLM: suy luận đề xuất trực tiếp từ số liệu báo cáo.

    Dùng khi thiếu ANTHROPIC_API_KEY hoặc gọi Claude lỗi. An toàn, không bịa số.
    """
    out: List[Dict[str, Any]] = []

    leads = report.get("leads") or {}
    if leads.get("available"):
        hot = leads.get("hot", 0) or 0
        if hot > 0:
            out.append({
                "title": "Có hot lead cần nhận nhanh",
                "area": "lead", "severity": "high",
                "detail": f"Đang có {hot} hot lead. Khách nóng nguội nhanh nếu chậm liên hệ.",
                "suggested_action": "Phân bổ hot lead cho sale ngay và bảo đảm SLA tiếp cận <15 phút.",
            })
        conv = leads.get("conversion_rate", 0) or 0
        if (leads.get("total", 0) or 0) >= 20 and conv < 5:
            out.append({
                "title": "Tỉ lệ chuyển đổi lead thấp",
                "area": "lead", "severity": "medium",
                "detail": f"Tỉ lệ chuyển đổi đang ở {conv}% trên tổng {leads.get('total')} lead.",
                "suggested_action": "Rà kịch bản chăm sóc & chất lượng nguồn lead; bổ sung tri thức Dify cho bot.",
            })

    care = report.get("ai_care") or {}
    if care.get("available") and (care.get("pending", 0) or 0) >= 10:
        out.append({
            "title": "Nhiều nháp chăm sóc AI tồn chờ duyệt",
            "area": "care", "severity": "medium",
            "detail": f"Hàng đợi đang có {care.get('pending')} nháp ở trạng thái chờ duyệt.",
            "suggested_action": "Duyệt/lọc bớt hàng đợi để đội AI tiếp tục chăm khách, tránh ùn tắc.",
        })

    ai_sales = report.get("ai_sales") or {}
    if ai_sales.get("available"):
        load = ai_sales.get("load_ratio", 0) or 0
        if load >= 0.85:
            out.append({
                "title": "Tải đội Sale AI cao",
                "area": "sales_ai", "severity": "high",
                "detail": f"Tỉ lệ tải đội Sale AI ~{round(load * 100)}% sức chứa.",
                "suggested_action": "Tăng năng lực (capacity) hoặc thêm sale AI để tránh nghẽn chăm sóc.",
            })

    mkt = report.get("marketing") or {}
    if mkt.get("available"):
        channels = mkt.get("by_channel") or []
        avg = mkt.get("avg_cpl", 0) or 0
        for ch in channels:
            cpl = ch.get("cpl", 0) or 0
            if avg > 0 and cpl > avg * 1.5 and (ch.get("leads", 0) or 0) > 0:
                out.append({
                    "title": f"Chi phí/lead kênh {ch.get('channel')} cao",
                    "area": "marketing", "severity": "medium",
                    "detail": (f"CPL kênh {ch.get('channel')} ≈ {cpl} so với trung bình {avg}. "
                               f"Kênh thu {ch.get('leads')} lead."),
                    "suggested_action": "Cân nhắc giảm ngân sách kênh này hoặc tối ưu nhắm mục tiêu/nội dung.",
                })

    automation = report.get("automation") or {}
    if automation.get("configured") and (automation.get("errors_recent", 0) or 0) > 0:
        out.append({
            "title": "Automation có lỗi gần đây",
            "area": "automation", "severity": "high",
            "detail": f"{automation.get('errors_recent')} lần chạy lỗi trong lịch sử gần đây.",
            "suggested_action": "Kiểm tra workflow n8n đang lỗi để tránh gián đoạn phân bổ/chăm sóc.",
        })

    for p in report.get("platforms") or []:
        if p.get("status") == "down":
            out.append({
                "title": f"Nền tảng '{p.get('name')}' không phản hồi",
                "area": "platform", "severity": "high",
                "detail": f"Health check tới {p.get('name')} trả trạng thái down.",
                "suggested_action": "Kiểm tra dịch vụ và redeploy nếu cần (mục Nền tảng).",
            })

    if not out:
        out.append({
            "title": "Hệ thống đang ổn định",
            "area": "other", "severity": "low",
            "detail": "Chưa phát hiện chỉ số bất thường rõ rệt từ số liệu hiện tại.",
            "suggested_action": "Tiếp tục theo dõi phễu chuyển đổi và chi phí/lead theo kênh.",
        })
    return out


async def generate_improvements(
    report: Optional[Dict[str, Any]] = None, *, focus: Optional[str] = None
) -> Dict[str, Any]:
    """Sinh danh sách đề xuất cải tiến từ báo cáo hệ thống.

    - Tự build báo cáo nếu chưa truyền vào.
    - Ưu tiên Claude; thiếu key / lỗi / output sai dạng → fallback heuristic.
    - KHÔNG side-effect. Trả {generated_by, generated_at, improvements, report}.
    """
    if report is None:
        report = await build_system_report()

    generated_by = "fallback"
    improvements: List[Dict[str, Any]] = []
    try:
        import json as _json

        from app.core import ai_crm

        user = "BÁO CÁO SỐ THẬT (JSON):\n" + _json.dumps(report, ensure_ascii=False, default=str)
        if focus:
            user += f"\n\nƯU TIÊN PHÂN TÍCH: {focus}"
        parsed = await ai_crm._call_claude_json(_IMPROVEMENTS_SYSTEM, user, max_tokens=1200)
        if isinstance(parsed, dict) and isinstance(parsed.get("improvements"), list):
            cleaned = [i for i in parsed["improvements"] if isinstance(i, dict) and i.get("title")]
            if cleaned:
                improvements = cleaned
                generated_by = "ai"
    except Exception as exc:  # noqa: BLE001 — luôn fallback an toàn
        log.warning("improvements: gọi Claude lỗi: %s", exc)

    if not improvements:
        improvements = _heuristic_improvements(report)

    return {
        "generated_by": generated_by,
        "generated_at": _now_iso(),
        "focus": focus,
        "improvements": improvements,
        "report": report,
    }


@router.post("/improvements")
async def improvements(
    body: Optional[ManagerImprovementsRequest] = None,
    admin: dict = Depends(require_admin),
) -> Dict[str, Any]:
    """Tạo đề xuất cải tiến vận hành (do AI/OpenClaw tạo) từ số liệu hiện tại.

    CHỈ GỢI Ý — KHÔNG thực thi bất kỳ hành động nào. Thiếu ANTHROPIC_API_KEY →
    tự rơi về phân tích heuristic dựa trên số liệu (không vỡ)."""
    focus = body.focus if body else None
    result = await generate_improvements(focus=focus)
    audit_store.record_admin(
        "manager.generate_improvements", admin,
        new_value={"count": len(result["improvements"]), "by": result["generated_by"]},
        detail="sinh đề xuất cải tiến vận hành (gợi ý)",
    )
    return result


# ===========================================================================
# TRUNG TÂM QUYẾT ĐỊNH — gom mọi việc cần NGƯỜI ĐIỀU HÀNH ra quyết định
# ===========================================================================
# Mỗi NGUỒN việc tự bắt lỗi → trả [] nếu store chưa có / lỗi (KHÔNG để 1 nguồn
# hỏng làm sập cả danh sách). Mỗi item gồm: id · type · title · context · priority
# · created_at · actions (approve/execute/reject) · meta. Endpoint hành động
# (/decisions/act) định tuyến tới store tương ứng + ghi audit.
#
# AN TOÀN: "execute"/"approve" CHỈ đổi trạng thái NỘI BỘ (gán sale, đánh dấu
# duyệt). KHÔNG gửi tin / không giao dịch thật khi kênh chưa kết nối.

# Ngưỡng SLA tiếp cận khách NÓNG (phút) — quá hạn mà chưa liên hệ → sla_breach.
_HOT_SLA_MINUTES = 15

# Loại việc + nhãn hiển thị (thứ tự nhóm trên FE).
_DECISION_LABELS: Dict[str, str] = {
    "hot_lead_unassigned": "Khách NÓNG chưa gán sale",
    "sla_breach": "Quá SLA tiếp cận khách nóng",
    "care_draft": "Nháp chăm sóc chờ duyệt",
    "pipeline_publish": "Nội dung marketing chờ đăng",
    "commission_approval": "Hoa hồng chờ duyệt",
    "automation_error": "Automation n8n có lỗi",
}
_DECISION_TYPES = set(_DECISION_LABELS)
_DECISION_ACTIONS = {"approve", "execute", "reject"}
_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _parse_iso(value: Any) -> Optional[datetime]:
    """Parse ISO (kèm 'Z' hoặc naive) → datetime aware UTC. None nếu lỗi."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


# ----------------------------- Nguồn việc -----------------------------
def _dec_care_drafts() -> List[Dict[str, Any]]:
    """Nháp chăm sóc của Đội Sale AI đang chờ duyệt (ai_care_queue_store)."""
    out: List[Dict[str, Any]] = []
    try:
        from app.core import ai_care_queue_store

        res = ai_care_queue_store.list_items(status="pending", page=1, page_size=50)
        for it in res.get("items", []):
            atype = it.get("action_type") or "nurture"
            draft = (it.get("draft") or "").strip()
            lead_name = it.get("lead_name") or it.get("lead_id") or "khách"
            out.append({
                "id": it.get("id"),
                "type": "care_draft",
                "title": f"Nháp chăm sóc: {lead_name}",
                "context": it.get("summary") or draft[:200] or "Đề xuất chăm sóc khách.",
                "priority": "high" if atype == "hot_follow_up" else "medium",
                "created_at": it.get("created_at"),
                "actions": ["approve", "reject"],
                "meta": {
                    "lead_id": it.get("lead_id"),
                    "channel": it.get("channel"),
                    "ai_salesman_name": it.get("ai_salesman_name"),
                    "draft": draft,
                    "action_type": atype,
                },
            })
    except Exception as exc:  # noqa: BLE001
        log.warning("decisions: care drafts lỗi: %s", exc)
    return out


def _dec_hot_leads() -> List[Dict[str, Any]]:
    """Khách NÓNG: (a) chưa gán sale → hot_lead_unassigned; (b) đã gán nhưng quá
    SLA tiếp cận mà chưa liên hệ → sla_breach. Đọc từ lead_store."""
    out: List[Dict[str, Any]] = []
    try:
        res = lead_store.list_all_leads(status="hot", page=1, page_size=500)
        leads = res.get("items") or res.get("leads") or []
        now = datetime.now(timezone.utc)
        for l in leads:
            lid = l.get("id")
            name = l.get("name") or lid or "khách"
            assigned = l.get("assigned_sale_id")
            marker = _parse_iso(l.get("hot_marker_at"))
            if not assigned:
                out.append({
                    "id": lid,
                    "type": "hot_lead_unassigned",
                    "title": f"Khách nóng chưa gán: {name}",
                    "context": (f"SĐT {l.get('phone') or '—'} · nguồn {l.get('source') or '—'}. "
                                "Cần gán sale phụ trách ngay."),
                    "priority": "high",
                    "created_at": l.get("hot_marker_at") or l.get("updated_at"),
                    "actions": ["execute", "reject"],
                    "meta": {"phone": l.get("phone"), "source": l.get("source"),
                             "ai_score": l.get("ai_score")},
                })
                continue
            # Đã gán → kiểm tra SLA tiếp cận.
            last = _parse_iso(l.get("last_contact_at"))
            contacted_after = bool(last and marker and last >= marker)
            overdue = bool(marker and (now - marker).total_seconds() > _HOT_SLA_MINUTES * 60)
            if overdue and not contacted_after:
                mins = int((now - marker).total_seconds() // 60) if marker else 0
                out.append({
                    "id": lid,
                    "type": "sla_breach",
                    "title": f"Quá SLA: {name}",
                    "context": (f"Đã đánh dấu nóng ~{mins} phút trước nhưng chưa được liên hệ "
                                f"(SLA {_HOT_SLA_MINUTES} phút). Cân nhắc chuyển sale khác / nhắc."),
                    "priority": "high",
                    "created_at": l.get("hot_marker_at"),
                    "actions": ["execute", "reject"],
                    "meta": {"phone": l.get("phone"), "assigned_sale_id": assigned,
                             "overdue_minutes": mins},
                })
    except Exception as exc:  # noqa: BLE001
        log.warning("decisions: hot leads lỗi: %s", exc)
    return out


def _dec_pipeline_publish() -> List[Dict[str, Any]]:
    """Pipeline marketing đã có nội dung (content done) nhưng CHƯA đăng & chưa được
    duyệt nội bộ → cần xác nhận đăng. Đọc từ marketing_pipeline_store."""
    out: List[Dict[str, Any]] = []
    try:
        from app.core import marketing_pipeline_store

        for p in marketing_pipeline_store.list_pipelines():
            stages = p.get("stages") or {}
            content = stages.get("content") or {}
            publish = stages.get("publish") or {}
            if content.get("status") != "done":
                continue
            if publish.get("status") == "done":
                continue
            res = publish.get("result") or {}
            if isinstance(res, dict) and (res.get("approved") or res.get("rejected")):
                continue
            out.append({
                "id": p.get("id"),
                "type": "pipeline_publish",
                "title": f"Chờ duyệt đăng: {p.get('name') or p.get('topic') or 'nội dung'}",
                "context": (f"Kênh {p.get('channel') or '—'} · chủ đề “{p.get('topic') or '—'}”. "
                            "Nội dung đã tạo, chờ xác nhận đăng."),
                "priority": "medium",
                "created_at": p.get("updated_at") or p.get("created_at"),
                "actions": ["approve", "reject"],
                "meta": {"channel": p.get("channel"), "topic": p.get("topic"),
                         "preview": (content.get("output") or "")[:300]},
            })
    except Exception as exc:  # noqa: BLE001
        log.warning("decisions: pipeline publish lỗi: %s", exc)
    return out


def _dec_commissions() -> List[Dict[str, Any]]:
    """Bản ghi hoa hồng đang ở trạng thái pending → chờ người điều hành duyệt."""
    out: List[Dict[str, Any]] = []
    try:
        for rec in commission_store.list_records(limit=500):
            if rec.get("status") != "pending":
                continue
            total = sum(float(t.get("amount", 0) or 0) for t in rec.get("tiers", []))
            deal_id = rec.get("deal_id")
            if not deal_id:
                continue
            out.append({
                "id": str(deal_id),
                "type": "commission_approval",
                "title": f"Hoa hồng deal {deal_id}",
                "context": f"Tổng hoa hồng ~{round(total):,} VNĐ ({len(rec.get('tiers', []))} bậc). Chờ duyệt.",
                "priority": "medium",
                "created_at": rec.get("saved_at"),
                "actions": ["approve", "reject"],
                "meta": {"total_amount": round(total), "sale_id": rec.get("sale_id")},
            })
    except Exception as exc:  # noqa: BLE001
        log.warning("decisions: commissions lỗi: %s", exc)
    return out


async def _dec_automation() -> List[Dict[str, Any]]:
    """Tổng hợp lỗi automation n8n gần đây (1 việc gộp). reject = ghi nhận đã xem
    (không đổi n8n; việc còn cho tới khi workflow hết lỗi)."""
    out: List[Dict[str, Any]] = []
    try:
        auto = await _automation_overview()
        errs = int(auto.get("errors_recent", 0) or 0) if auto.get("configured") else 0
        if errs > 0:
            out.append({
                "id": "automation-errors",
                "type": "automation_error",
                "title": "Automation n8n có lỗi gần đây",
                "context": (f"{errs} lần chạy lỗi trong lịch sử gần đây. Kiểm tra workflow để "
                            "tránh gián đoạn phân bổ/chăm sóc."),
                "priority": "high",
                "created_at": _now_iso(),
                "actions": ["reject"],
                "meta": {"errors_recent": errs},
            })
    except Exception as exc:  # noqa: BLE001
        log.warning("decisions: automation lỗi: %s", exc)
    return out


async def build_decisions() -> Dict[str, Any]:
    """Gộp TOÀN BỘ việc cần quyết định từ mọi nguồn (mỗi nguồn tự bắt lỗi).

    Read-only. Trả {generated_at, total, counts(theo type), groups(theo type với
    nhãn + đếm + ưu tiên nhóm), items}. Dùng chung cho endpoint admin + MCP OpenClaw.
    """
    items: List[Dict[str, Any]] = []
    items += _dec_hot_leads()
    items += _dec_care_drafts()
    items += _dec_pipeline_publish()
    items += _dec_commissions()
    items += await _dec_automation()

    # Sắp xếp trong mỗi item theo ưu tiên rồi thời điểm (mới hơn trước trong cùng mức).
    items.sort(key=lambda x: (_PRIORITY_RANK.get(x.get("priority"), 3),
                              x.get("created_at") or ""))

    counts: Dict[str, int] = {}
    for it in items:
        counts[it["type"]] = counts.get(it["type"], 0) + 1

    groups: List[Dict[str, Any]] = []
    for t, label in _DECISION_LABELS.items():
        g_items = [i for i in items if i["type"] == t]
        if not g_items:
            continue
        top_priority = min((_PRIORITY_RANK.get(i.get("priority"), 3) for i in g_items),
                           default=3)
        priority = next((k for k, v in _PRIORITY_RANK.items() if v == top_priority), "low")
        groups.append({
            "type": t,
            "label": label,
            "count": len(g_items),
            "priority": priority,
            "items": g_items,
        })

    return {
        "generated_at": _now_iso(),
        "total": len(items),
        "counts": counts,
        "groups": groups,
        "items": items,
    }


@router.get("/decisions")
async def decisions(_admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    """Trung tâm quyết định: DANH SÁCH việc cần người điều hành duyệt/thực hiện/bỏ
    qua — gom từ khách nóng chưa gán / quá SLA, nháp chăm sóc AI, nội dung marketing
    chờ đăng, hoa hồng chờ duyệt, lỗi automation. Đếm theo nhóm. Read-only."""
    return await build_decisions()


# ----------------------------- Định tuyến hành động -----------------------------
def _act_care_draft(did: str, action: str, admin: dict) -> Dict[str, Any]:
    from app.core import ai_care_queue_store

    by = admin.get("email") or admin.get("id")
    if action in ("approve", "execute"):
        item = ai_care_queue_store.approve(did, by=by)
        if item is None:
            raise HTTPException(404, "Không tìm thấy nháp chăm sóc.")
        return {"ok": True, "status": item.get("status"),
                "message": "Đã duyệt nháp — KHÔNG tự gửi cho khách. Nhân viên tự gửi sau khi duyệt."}
    # reject
    item = ai_care_queue_store.skip(did, by=by)
    if item is None:
        raise HTTPException(404, "Không tìm thấy nháp chăm sóc.")
    return {"ok": True, "status": item.get("status"), "message": "Đã bỏ qua nháp chăm sóc."}


def _act_pipeline_publish(did: str, action: str, admin: dict) -> Dict[str, Any]:
    from app.core import marketing_pipeline_store

    now = _now_iso()
    by = admin.get("email") or admin.get("id")
    if action in ("approve", "execute"):
        # AN TOÀN: CHỈ đánh dấu DUYỆT nội bộ — KHÔNG tự đăng (kênh có thể chưa kết
        # nối). Việc đăng thật vẫn phải qua luồng publish riêng có confirm.
        p = marketing_pipeline_store.set_stage(
            did, "publish",
            result={"approved": True, "approved_by": by, "approved_at": now,
                    "note": "Đã duyệt nội bộ — chưa đăng (giữ an toàn nếu kênh chưa kết nối)."},
        )
        if p is None:
            raise HTTPException(404, "Không tìm thấy pipeline marketing.")
        return {"ok": True, "message": "Đã duyệt nội bộ — chưa đăng. Đăng thật cần luồng publish có xác nhận."}
    # reject
    p = marketing_pipeline_store.set_stage(
        did, "publish",
        result={"rejected": True, "rejected_by": by, "rejected_at": now,
                "note": "Người điều hành từ chối đăng."},
    )
    if p is None:
        raise HTTPException(404, "Không tìm thấy pipeline marketing.")
    return {"ok": True, "message": "Đã bỏ qua — không đăng nội dung này."}


def _act_hot_lead_unassigned(did: str, action: str, admin: dict) -> Dict[str, Any]:
    if action in ("execute", "approve"):
        sale_id = lead_store.auto_distribute_hot_lead(did)
        if not sale_id:
            return {"ok": False, "message": "Chưa gán được — không có sale khả dụng."}
        return {"ok": True, "assigned_sale_id": sale_id, "message": "Đã gán khách nóng cho sale phù hợp."}
    # reject = bỏ qua (chỉ ghi nhận; khách vẫn giữ nguyên trạng thái).
    return {"ok": True, "message": "Đã bỏ qua (khách vẫn giữ nguyên, có thể xuất hiện lại)."}


def _act_sla_breach(did: str, action: str, admin: dict) -> Dict[str, Any]:
    if action in ("execute", "approve"):
        # Chuyển/nhắc: phân bổ lại cho sale top eligibility (có thể khác sale cũ).
        sale_id = lead_store.auto_distribute_hot_lead(did)
        if not sale_id:
            return {"ok": False, "message": "Không có sale khả dụng để chuyển."}
        return {"ok": True, "assigned_sale_id": sale_id,
                "message": "Đã chuyển khách cho sale phù hợp (nhắc tiếp cận ngay)."}
    return {"ok": True, "message": "Đã bỏ qua cảnh báo SLA (khách vẫn giữ nguyên)."}


def _act_commission(did: str, action: str, admin: dict) -> Dict[str, Any]:
    now = _now_iso()
    if action in ("approve", "execute"):
        rec = commission_store.set_status(did, status="approved", approved_at=now)
        if rec is None:
            raise HTTPException(404, "Không tìm thấy bản ghi hoa hồng.")
        return {"ok": True, "status": "approved", "message": "Đã duyệt hoa hồng (chưa chi trả)."}
    rec = commission_store.set_status(did, status="rejected")
    if rec is None:
        raise HTTPException(404, "Không tìm thấy bản ghi hoa hồng.")
    return {"ok": True, "status": "rejected", "message": "Đã từ chối hoa hồng."}


def _act_automation_error(did: str, action: str, admin: dict) -> Dict[str, Any]:
    # Không có store đổi trạng thái n8n từ đây — chỉ ghi nhận đã xem (audit).
    return {"ok": True, "message": "Đã ghi nhận. Việc còn cho tới khi workflow n8n hết lỗi."}


def act_on_decision(dtype: str, did: str, action: str, admin: dict) -> Dict[str, Any]:
    """Thực thi 1 quyết định trên 1 việc. Định tuyến tới store tương ứng + ghi audit.

    AN TOÀN: execute/approve CHỈ đổi trạng thái nội bộ (gán sale, đánh dấu duyệt),
    KHÔNG gửi tin / giao dịch thật. Loại/hành động ngoài whitelist → 400.
    """
    if dtype not in _DECISION_TYPES:
        raise HTTPException(400, "Loại việc không hợp lệ.")
    if action not in _DECISION_ACTIONS:
        raise HTTPException(400, "Hành động không hợp lệ.")

    routes = {
        "care_draft": _act_care_draft,
        "pipeline_publish": _act_pipeline_publish,
        "hot_lead_unassigned": _act_hot_lead_unassigned,
        "sla_breach": _act_sla_breach,
        "commission_approval": _act_commission,
        "automation_error": _act_automation_error,
    }
    try:
        result = routes[dtype](did, action, admin)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.warning("decision act lỗi (%s/%s/%s): %s", dtype, did, action, exc)
        raise HTTPException(502, "Không thực hiện được quyết định (lỗi nội bộ).")

    audit_store.record_admin(
        "manager.decision_act", admin,
        target=f"{dtype}:{did}",
        new_value={"action": action, "result_ok": result.get("ok")},
        detail=f"quyết định {action} trên {dtype} (id={did})",
    )
    return {"type": dtype, "id": did, "action": action, **result}


@router.post("/decisions/act")
def decisions_act(
    body: ManagerDecisionAct, admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """Thực thi 1 quyết định: {type, id, action}. approve=phê duyệt, execute=thực
    hiện (gán sale...), reject=bỏ qua. Định tuyến tới store tương ứng + ghi audit.

    AN TOÀN: KHÔNG gửi tin / giao dịch thật khi kênh chưa kết nối — chỉ đổi trạng
    thái nội bộ. FE phải xác nhận trước các hành động có hệ quả."""
    return act_on_decision(body.type, body.id, body.action, admin)
