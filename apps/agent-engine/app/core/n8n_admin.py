"""Client gọi n8n REST API v1 — phục vụ trang admin "Automation".

Khác với `app/api/automation.py` (n8n GỌI VÀO backend qua webhook), module này là
backend GỌI RA n8n để QUẢN TRỊ toàn bộ workflow: liệt kê, bật/tắt, xem lịch sử
chạy (executions), và PHÂN LOẠI workflow theo hạng mục.

Cấu hình (settings / env):
  - N8N_API_URL : base URL n8n (trống → suy từ platform_n8n_url).
  - N8N_API_KEY : API key tạo trong n8n (Settings → n8n API → Create an API key).

Nguyên tắc chịu lỗi (KHÔNG để n8n làm sập admin):
  - Chưa cấu hình key → raise `N8nNotConfigured` (endpoint bắt → trả thông báo
    "chưa cấu hình" + hướng dẫn, KHÔNG 500).
  - n8n down / timeout / lỗi HTTP → raise `N8nError` (endpoint bắt → 502 kèm
    thông điệp rõ, KHÔNG vỡ toàn trang).

REST API n8n v1 tham chiếu:
  GET  /api/v1/workflows                 (data[], nextCursor)
  GET  /api/v1/workflows/{id}
  POST /api/v1/workflows/{id}/activate
  POST /api/v1/workflows/{id}/deactivate
  GET  /api/v1/executions?workflowId=&status=&limit=
Header xác thực: `X-N8N-API-KEY: <key>`.
"""

from __future__ import annotations

import re
from typing import Any, Optional

import httpx

from app.core import integrations_store
from app.core.settings import settings

_TIMEOUT = 12.0


def _cfg() -> dict:
    """{api_url, api_key} — store (integrations) trước, env (resolved) sau."""
    return integrations_store.get_credential("n8n")


def _api_base() -> str:
    return str(_cfg().get("api_url") or settings.n8n_api_base()).rstrip("/")


def _api_key() -> str:
    return str(_cfg().get("api_key") or "")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class N8nNotConfigured(RuntimeError):
    """Chưa đặt N8N_API_KEY → không thể gọi REST API quản trị."""


class N8nError(RuntimeError):
    """Lỗi khi gọi n8n (down/timeout/HTTP 4xx-5xx). Kèm status_code nếu có."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# PHÂN LOẠI workflow theo hạng mục (category)
# ---------------------------------------------------------------------------

# Mỗi rule: (key, label, [keyword]). Quét theo THỨ TỰ — workflow khớp keyword đầu
# tiên thuộc hạng mục đó. Keyword so khớp không phân biệt hoa thường trên TÊN
# workflow (đã loại emoji/số thứ tự). Dùng khi workflow KHÔNG có tag n8n.
_CATEGORY_RULES: list[tuple[str, str, list[str]]] = [
    (
        "lead-customer",
        "Khách hàng & Lead",
        [
            "hot lead", "hot-lead", "lead", "welcome", "register", "booking",
            "reminder", "reengage", "re-engage", "silent", "cart", "abandon",
            "journey", "drip", "birthday", "viewing", "feedback", "referral",
        ],
    ),
    (
        "sale-ops",
        "Vận hành Sale",
        [
            "sale", "commission", "escalation", "escalat", "training",
            "unlock", "deal", "congrats", "leaderboard", "bonus", "didn't login",
            "didnt login",
        ],
    ),
    (
        "marketing",
        "Marketing & Nội dung",
        [
            "marketing", "campaign", "publish", "facebook", "zalo", "tiktok",
            "blog", "seo", "ads", "competitor", "price monitor", "event",
            "invitation", "post", "caption",
        ],
    ),
    (
        "report-kpi",
        "Báo cáo & KPI",
        ["kpi", "report", "briefing", "weekly", "performance"],
    ),
    (
        "sync-data",
        "Đồng bộ & Dữ liệu",
        [
            "sync", "backup", "chatwoot", "notebook", "kb", "knowledge",
            "inbound", "router", "email inbound",
        ],
    ),
    (
        "ops-monitor",
        "Giám sát & Vận hành",
        [
            "health", "monitor", "cost", "api cost", "inventory", "low stock",
            "low-stock", "stock",
        ],
    ),
    (
        "ai-bot",
        "AI Bot",
        ["bot", "intent", "ai-intent"],
    ),
]

_UNCATEGORIZED = ("other", "Khác")

# Bỏ emoji + tiền tố "ELC — 01 " / "35-" để so khớp keyword sạch hơn.
_PREFIX_RE = re.compile(r"^\s*(elc\s*[—\-:]*\s*)?\d{1,3}\s*[-—.]*\s*", re.IGNORECASE)
_EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿⌀-⏿]+"
)


def _slugify_tag(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return s or "tag"


def categorize(name: str, tags: list[dict] | None) -> dict[str, str]:
    """Suy hạng mục của 1 workflow.

    Ưu tiên TAG của n8n: nếu có tag → lấy tag ĐẦU TIÊN làm category
    (key = slug, label = tên tag, source = "tag"). Nếu KHÔNG có tag → suy từ
    TÊN theo `_CATEGORY_RULES` (source = "name"); không khớp → "Khác".
    """
    if tags:
        first = tags[0]
        label = (first.get("name") if isinstance(first, dict) else str(first)) or "Tag"
        return {"key": _slugify_tag(label), "label": label, "source": "tag"}

    clean = _EMOJI_RE.sub("", name or "")
    clean = _PREFIX_RE.sub("", clean).strip().lower()
    for key, label, keywords in _CATEGORY_RULES:
        if any(kw in clean for kw in keywords):
            return {"key": key, "label": label, "source": "name"}
    return {"key": _UNCATEGORIZED[0], "label": _UNCATEGORIZED[1], "source": "name"}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    """True nếu đã có API key (store hoặc env, kể cả fallback TEMP / TOKEN)."""
    return bool(_api_key())


def _headers() -> dict[str, str]:
    key = _api_key()
    if not key:
        raise N8nNotConfigured("Chưa cấu hình N8N_API_KEY")
    return {
        "X-N8N-API-KEY": key,
        "Accept": "application/json",
    }


async def _get(path: str, params: Optional[dict] = None) -> Any:
    """GET {base}/api/v1{path}. Raise N8nError nếu lỗi mạng/HTTP."""
    url = f"{_api_base()}/api/v1{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False) as client:
            r = await client.get(url, headers=_headers(), params=params)
    except N8nNotConfigured:
        raise
    except Exception as exc:  # noqa: BLE001 — gói lỗi mạng thành N8nError
        raise N8nError(f"Không gọi được n8n: {type(exc).__name__}") from exc
    if r.status_code == 401:
        raise N8nError("n8n từ chối API key (401) — kiểm tra lại N8N_API_KEY", 401)
    if r.status_code >= 400:
        raise N8nError(f"n8n trả lỗi HTTP {r.status_code}", r.status_code)
    try:
        return r.json()
    except Exception as exc:  # noqa: BLE001
        raise N8nError("n8n trả về dữ liệu không phải JSON") from exc


async def _post(path: str) -> Any:
    """POST {base}/api/v1{path} (không body). Dùng cho activate/deactivate."""
    url = f"{_api_base()}/api/v1{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False) as client:
            r = await client.post(url, headers=_headers())
    except N8nNotConfigured:
        raise
    except Exception as exc:  # noqa: BLE001
        raise N8nError(f"Không gọi được n8n: {type(exc).__name__}") from exc
    if r.status_code == 401:
        raise N8nError("n8n từ chối API key (401) — kiểm tra lại N8N_API_KEY", 401)
    if r.status_code == 404:
        raise N8nError("Không tìm thấy workflow trên n8n (404)", 404)
    if r.status_code >= 400:
        raise N8nError(f"n8n trả lỗi HTTP {r.status_code}", r.status_code)
    try:
        return r.json() if r.content else {}
    except Exception:  # noqa: BLE001
        return {}


def _norm_tags(raw: Any) -> list[dict]:
    """Chuẩn hoá tags về [{'id','name'}] (n8n trả list dict hoặc list string)."""
    out: list[dict] = []
    for t in raw or []:
        if isinstance(t, dict):
            out.append({"id": t.get("id"), "name": t.get("name")})
        else:
            out.append({"id": None, "name": str(t)})
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def list_workflows() -> list[dict]:
    """Liệt kê toàn bộ workflow (tự lật trang qua nextCursor).

    Trả list dict gọn: id, name, active, tags, createdAt, updatedAt, category.
    """
    items: list[dict] = []
    cursor: Optional[str] = None
    for _ in range(20):  # chặn vòng lặp vô hạn (tối đa ~2000 workflow)
        params = {"limit": 100}
        if cursor:
            params["cursor"] = cursor
        data = await _get("/workflows", params=params)
        rows = data.get("data", data) if isinstance(data, dict) else data
        for w in rows or []:
            tags = _norm_tags(w.get("tags"))
            items.append(
                {
                    "id": str(w.get("id")),
                    "name": w.get("name") or "(không tên)",
                    "active": bool(w.get("active")),
                    "tags": tags,
                    "createdAt": w.get("createdAt"),
                    "updatedAt": w.get("updatedAt"),
                    "category": categorize(w.get("name") or "", tags),
                }
            )
        cursor = data.get("nextCursor") if isinstance(data, dict) else None
        if not cursor:
            break
    return items


async def list_executions(
    workflow_id: Optional[str] = None,
    limit: int = 20,
    status: Optional[str] = None,
) -> list[dict]:
    """Lịch sử chạy gần nhất. Lọc theo workflow_id và/hoặc status (success/error)."""
    params: dict[str, Any] = {"limit": max(1, min(limit, 100))}
    if workflow_id:
        params["workflowId"] = workflow_id
    if status:
        params["status"] = status
    data = await _get("/executions", params=params)
    rows = data.get("data", data) if isinstance(data, dict) else data
    out: list[dict] = []
    for e in rows or []:
        out.append(
            {
                "id": str(e.get("id")),
                "workflowId": str(e.get("workflowId")) if e.get("workflowId") else None,
                "status": e.get("status")
                or ("error" if e.get("stoppedAt") and not e.get("finished") else None)
                or ("success" if e.get("finished") else "running"),
                "mode": e.get("mode"),
                "startedAt": e.get("startedAt"),
                "stoppedAt": e.get("stoppedAt"),
                "finished": bool(e.get("finished")),
            }
        )
    return out


async def set_active(workflow_id: str, active: bool) -> dict:
    """Bật (activate) hoặc tắt (deactivate) 1 workflow."""
    verb = "activate" if active else "deactivate"
    res = await _post(f"/workflows/{workflow_id}/{verb}")
    return {
        "id": workflow_id,
        "active": bool(res.get("active", active)) if isinstance(res, dict) else active,
    }
