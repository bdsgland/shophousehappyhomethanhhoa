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
                    entry.update({"url": "https://api.eurowindowlightcity.net",
                                  "status": "up", "code": 200})
                    results.append(entry)
                    continue
                try:
                    r = await client.get(
                        p["url"], headers={"User-Agent": "ELC-Manager-HealthCheck/1.0"}
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
