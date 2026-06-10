"""Router admin "Automation" — đồng bộ & kiểm soát toàn bộ workflow n8n.

Prefix: /admin/automation (auth admin). Cầu nối tới `core/n8n_admin.py` (gọi
n8n REST API). PHÂN LOẠI workflow theo hạng mục (tag n8n, fallback suy từ tên).

Endpoints:
  GET  /admin/automation/overview                       — tổng quan (active/inactive, chạy hôm nay, lỗi)
  GET  /admin/automation/workflows                      — danh sách workflow + category + lần chạy gần nhất + tỉ lệ lỗi
  POST /admin/automation/workflows/{id}/activate        — bật workflow
  POST /admin/automation/workflows/{id}/deactivate      — tắt workflow
  GET  /admin/automation/workflows/{id}/executions      — lịch sử chạy của 1 workflow

Chịu lỗi: chưa cấu hình N8N_API_KEY → trả {"configured": false, ...hướng dẫn}
(HTTP 200, KHÔNG 500). n8n down/lỗi → HTTP 502 kèm thông điệp rõ.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import require_admin
from app.core import n8n_admin
from app.core.settings import settings

router = APIRouter(prefix="/admin/automation", tags=["admin-automation"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _not_configured_payload() -> dict:
    """Body trả về khi chưa đặt N8N_API_KEY — kèm hướng dẫn cho admin."""
    return {
        "configured": False,
        "n8n_url": settings.n8n_api_base(),
        "message": "Chưa cấu hình N8N_API_KEY — không thể đồng bộ workflow n8n.",
        "setup": {
            "steps": [
                "Mở n8n: " + settings.n8n_api_base(),
                "Vào Settings → n8n API → Create an API key",
                "Sao chép key và đặt biến môi trường N8N_API_KEY trên server "
                "(Railway: Variables), rồi redeploy.",
                "(Tuỳ chọn) đặt N8N_API_URL nếu n8n chạy ở domain khác.",
            ],
        },
    }


def _open_url(workflow_id: str) -> str:
    """Deep link mở workflow trong giao diện n8n."""
    return f"{settings.n8n_api_base()}/workflow/{workflow_id}"


def _parse_iso(val: Any) -> Optional[datetime]:
    if not isinstance(val, str) or not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except ValueError:
        return None


def _raise_n8n(exc: n8n_admin.N8nError) -> None:
    """Đổi N8nError → HTTP 502 (gateway lỗi) với thông điệp rõ ràng."""
    raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/overview")
async def overview(_admin: dict = Depends(require_admin)) -> dict:
    """Tổng quan automation: đếm active/inactive, số chạy hôm nay, lỗi gần đây."""
    if not n8n_admin.is_configured():
        return _not_configured_payload()
    try:
        workflows = await n8n_admin.list_workflows()
        executions = await n8n_admin.list_executions(limit=100)
    except n8n_admin.N8nNotConfigured:
        return _not_configured_payload()
    except n8n_admin.N8nError as exc:
        _raise_n8n(exc)

    active = sum(1 for w in workflows if w["active"])
    today = datetime.now(timezone.utc).date()
    runs_today = 0
    errors_window = 0
    for e in executions:
        started = _parse_iso(e.get("startedAt"))
        if started and started.astimezone(timezone.utc).date() == today:
            runs_today += 1
        if e.get("status") == "error":
            errors_window += 1

    # Đếm hạng mục riêng biệt để hiển thị nhanh.
    cat_keys = {w["category"]["key"]: w["category"]["label"] for w in workflows}
    return {
        "configured": True,
        "n8n_url": settings.n8n_api_base(),
        "total": len(workflows),
        "active": active,
        "inactive": len(workflows) - active,
        "categories_count": len(cat_keys),
        "runs_today": runs_today,
        "errors_recent": errors_window,
        "executions_window": len(executions),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/workflows")
async def list_workflows(_admin: dict = Depends(require_admin)) -> dict:
    """Danh sách workflow NHÓM THEO HẠNG MỤC, kèm lần chạy gần nhất + tỉ lệ lỗi.

    Tỉ lệ lỗi tính trên cửa sổ executions gần nhất (tối đa 100 lượt toàn hệ thống)
    — đủ để cảnh báo nhanh, không phải thống kê lịch sử đầy đủ.
    """
    if not n8n_admin.is_configured():
        return _not_configured_payload()
    try:
        workflows = await n8n_admin.list_workflows()
        executions = await n8n_admin.list_executions(limit=100)
    except n8n_admin.N8nNotConfigured:
        return _not_configured_payload()
    except n8n_admin.N8nError as exc:
        _raise_n8n(exc)

    # Gom executions theo workflowId: lần chạy mới nhất + đếm tổng/lỗi.
    by_wf: dict[str, dict] = defaultdict(lambda: {"total": 0, "errors": 0, "last": None})
    for e in executions:
        wid = e.get("workflowId")
        if not wid:
            continue
        bucket = by_wf[wid]
        bucket["total"] += 1
        if e.get("status") == "error":
            bucket["errors"] += 1
        started = _parse_iso(e.get("startedAt"))
        last = bucket["last"]
        last_started = _parse_iso(last.get("startedAt")) if last else None
        if last is None or (started and last_started and started > last_started):
            bucket["last"] = e

    enriched: list[dict] = []
    for w in workflows:
        stat = by_wf.get(w["id"], {"total": 0, "errors": 0, "last": None})
        last = stat["last"]
        total = stat["total"]
        enriched.append(
            {
                **w,
                "open_url": _open_url(w["id"]),
                "last_run": (
                    {
                        "status": last.get("status"),
                        "startedAt": last.get("startedAt"),
                        "stoppedAt": last.get("stoppedAt"),
                    }
                    if last
                    else None
                ),
                "runs_window": total,
                "errors_window": stat["errors"],
                "error_rate": round(stat["errors"] / total, 3) if total else 0.0,
            }
        )

    # Nhóm theo category (giữ thứ tự xuất hiện).
    groups: dict[str, dict] = {}
    for w in enriched:
        cat = w["category"]
        g = groups.setdefault(
            cat["key"],
            {"key": cat["key"], "label": cat["label"], "source": cat["source"], "workflows": []},
        )
        g["workflows"].append(w)
    categories = sorted(groups.values(), key=lambda g: (-len(g["workflows"]), g["label"]))

    return {
        "configured": True,
        "n8n_url": settings.n8n_api_base(),
        "total": len(enriched),
        "categories": categories,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/workflows/{workflow_id}/activate")
async def activate(workflow_id: str, _admin: dict = Depends(require_admin)) -> dict:
    """Bật 1 workflow."""
    if not n8n_admin.is_configured():
        raise HTTPException(status_code=400, detail="Chưa cấu hình N8N_API_KEY")
    try:
        res = await n8n_admin.set_active(workflow_id, True)
    except n8n_admin.N8nNotConfigured:
        raise HTTPException(status_code=400, detail="Chưa cấu hình N8N_API_KEY")
    except n8n_admin.N8nError as exc:
        _raise_n8n(exc)
    return {"status": "ok", **res}


@router.post("/workflows/{workflow_id}/deactivate")
async def deactivate(workflow_id: str, _admin: dict = Depends(require_admin)) -> dict:
    """Tắt 1 workflow."""
    if not n8n_admin.is_configured():
        raise HTTPException(status_code=400, detail="Chưa cấu hình N8N_API_KEY")
    try:
        res = await n8n_admin.set_active(workflow_id, False)
    except n8n_admin.N8nNotConfigured:
        raise HTTPException(status_code=400, detail="Chưa cấu hình N8N_API_KEY")
    except n8n_admin.N8nError as exc:
        _raise_n8n(exc)
    return {"status": "ok", **res}


@router.get("/workflows/{workflow_id}/executions")
async def workflow_executions(
    workflow_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None, description="success | error"),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Lịch sử chạy gần nhất của 1 workflow."""
    if not n8n_admin.is_configured():
        return _not_configured_payload()
    try:
        rows = await n8n_admin.list_executions(
            workflow_id=workflow_id, limit=limit, status=status
        )
    except n8n_admin.N8nNotConfigured:
        return _not_configured_payload()
    except n8n_admin.N8nError as exc:
        _raise_n8n(exc)
    return {
        "configured": True,
        "workflow_id": workflow_id,
        "count": len(rows),
        "executions": rows,
    }
