"""TRUNG TÂM TÍCH HỢP & KẾT NỐI — store credential từng dịch vụ + resolve.

Mục tiêu: admin nhập khoá kết nối (Chatwoot, Stringee, SMTP, Facebook, Zalo,
n8n, Anthropic…) ngay trên UI và CÓ HIỆU LỰC NGAY mà KHÔNG cần set lại biến môi
trường trên Railway. Cách làm:

  • Lưu bền credential vào 1 file JSON ở DATA_DIR (Railway volume) —
    data/_runtime/integrations.json — đã gitignored (**/_runtime/), atomic write
    + thread-safe (RLock) theo đúng convention workspace_token_store / sales_policy_store.
  • `get_credential(service)` đọc STORE trước → fallback ENV (settings). Các client
    (chatwoot/stringee/n8n/smtp) gọi hàm này thay vì đọc thẳng settings → nhập UI
    là chạy, vẫn tương thích ngược khi store rỗng (env cũ vẫn hoạt động).

AN TOÀN (BẮT BUỘC):
  • KHÔNG bao giờ log/echo secret.
  • `status()` / `public_view()` CHE secret (chỉ 4 ký tự cuối), KHÔNG trả full
    secret ra FE. Full credential chỉ dùng nội bộ server (get_credential).
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from app.core.settings import settings

_LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# Định nghĩa dịch vụ (registry) — fields + secret flag + hướng dẫn cho UI
# ---------------------------------------------------------------------------

# Nhóm hiển thị trên UI (giữ thứ tự).
GROUPS: list[dict[str, str]] = [
    {"key": "channel", "label": "Kênh Marketing"},
    {"key": "crm", "label": "CRM & Chat"},
    {"key": "telephony", "label": "Tổng đài"},
    {"key": "ai_infra", "label": "AI & Hạ tầng"},
]


def _f(
    key: str,
    label: str,
    *,
    secret: bool = False,
    type: str = "text",
    placeholder: str = "",
    env: Optional[str] = None,
) -> dict:
    """Khai báo 1 field. `env` = tên thuộc tính settings dùng làm fallback ENV."""
    return {
        "key": key,
        "label": label,
        "secret": secret,
        "type": type,
        "placeholder": placeholder,
        "env": env,
    }


# Mỗi service: key, name, group, fields[], required[] (để tính connected), guide,
# guide_url, managed (True = không nhập tay, đọc trạng thái nơi khác — Workspace).
SERVICES: list[dict[str, Any]] = [
    # ---------------- KÊNH MARKETING ----------------
    {
        "key": "facebook",
        "name": "Facebook Page",
        "group": "channel",
        "fields": [
            _f("page_id", "Page ID"),
            _f("page_access_token", "Page Access Token", secret=True),
            _f("ad_account_id", "Ad Account ID", placeholder="act_..."),
        ],
        "required": ["page_access_token"],
        "guide": "Lấy Page Access Token trong Meta Business Suite → Cài đặt → "
        "Người dùng hệ thống / Graph API Explorer (quyền pages_messaging, "
        "pages_manage_metadata). Ad Account ID dạng act_xxxxx.",
        "guide_url": "https://developers.facebook.com/tools/explorer/",
    },
    {
        "key": "zalo",
        "name": "Zalo OA",
        "group": "channel",
        "fields": [
            _f("oa_id", "OA ID"),
            _f("oa_access_token", "OA Access Token", secret=True),
        ],
        "required": ["oa_access_token"],
        "guide": "Tạo Official Account tại oa.zalo.me, lấy Access Token trong "
        "Zalo Developers → Official Account API (token có hạn, cần refresh định kỳ).",
        "guide_url": "https://developers.zalo.me/",
    },
    {
        "key": "google_ads",
        "name": "Google Ads",
        "group": "channel",
        "fields": [
            _f("customer_id", "Customer ID", placeholder="123-456-7890"),
            _f("developer_token", "Developer Token", secret=True),
            _f("client_id", "OAuth Client ID"),
            _f("client_secret", "OAuth Client Secret", secret=True),
            _f("refresh_token", "Refresh Token", secret=True),
        ],
        "required": ["developer_token", "refresh_token"],
        "guide": "Developer Token lấy trong Google Ads → API Center. Client "
        "ID/Secret từ Google Cloud OAuth. Refresh Token sinh qua OAuth Playground "
        "với scope adwords.",
        "guide_url": "https://developers.google.com/google-ads/api/docs/first-call/overview",
    },
    {
        "key": "email_smtp",
        "name": "Email (SMTP)",
        "group": "channel",
        "fields": [
            _f("host", "SMTP Host", placeholder="smtp.gmail.com", env="smtp_host"),
            _f("port", "Port", type="number", placeholder="587", env="smtp_port"),
            _f("user", "Tài khoản", env="smtp_user"),
            _f("password", "Mật khẩu / App Password", secret=True, env="smtp_password"),
            _f("from", "Địa chỉ gửi (From)", env="smtp_from"),
            _f("use_tls", "Dùng TLS", type="bool", env="smtp_use_tls"),
        ],
        "required": ["host"],
        "guide": "Gmail: bật xác thực 2 lớp rồi tạo App Password (16 ký tự) làm "
        "mật khẩu. Host smtp.gmail.com, port 587, bật TLS.",
        "guide_url": "https://support.google.com/accounts/answer/185833",
    },
    {
        "key": "tiktok",
        "name": "TikTok (tùy chọn)",
        "group": "channel",
        "fields": [
            _f("advertiser_id", "Advertiser ID"),
            _f("access_token", "Access Token", secret=True),
        ],
        "required": ["access_token"],
        "guide": "Tạo app trong TikTok for Business → Marketing API, lấy Access "
        "Token và Advertiser ID.",
        "guide_url": "https://business-api.tiktok.com/",
    },
    # ---------------- CRM & CHAT ----------------
    {
        "key": "chatwoot",
        "name": "Chatwoot",
        "group": "crm",
        "fields": [
            _f("base_url", "Base URL", placeholder="https://chat...", env="chatwoot_base_url"),
            _f("account_id", "Account ID", type="number", env="chatwoot_account_id"),
            _f("api_token", "API Access Token (Agent Bot)", secret=True, env="chatwoot_api_token"),
        ],
        "required": ["api_token"],
        "guide": "Tạo Agent Bot trong Chatwoot → Settings → Integrations → Bot, "
        "copy Access Token. Account ID nằm trên URL /accounts/{id}.",
        "guide_url": "https://www.chatwoot.com/docs/product/channels/api/create-channel",
    },
    # ---------------- TỔNG ĐÀI ----------------
    {
        "key": "stringee",
        "name": "Stringee (Tổng đài)",
        "group": "telephony",
        "fields": [
            _f("api_key_sid", "API Key SID", env="stringee_api_key_sid"),
            _f("api_key_secret", "API Key Secret", secret=True, env="stringee_api_key_secret"),
            _f("from_number", "Số tổng đài (From)", env="stringee_from_number"),
        ],
        "required": ["api_key_sid", "api_key_secret"],
        "guide": "Trong Stringee Dashboard → Project → API key: tạo cặp SID + "
        "Secret. Secret KÝ JWT ở server, không lộ ra FE. From là số Stringee đã mua.",
        "guide_url": "https://developer.stringee.com/docs/client-authentication",
    },
    # ---------------- AI & HẠ TẦNG ----------------
    {
        "key": "anthropic",
        "name": "Anthropic Claude",
        "group": "ai_infra",
        "fields": [
            _f("api_key", "API Key", secret=True, placeholder="sk-ant-...", env="anthropic_api_key"),
        ],
        "required": ["api_key"],
        "guide": "Tạo API key tại console.anthropic.com → API Keys.",
        "guide_url": "https://console.anthropic.com/settings/keys",
    },
    {
        "key": "n8n",
        "name": "n8n Automation",
        "group": "ai_infra",
        "fields": [
            _f("api_url", "Base URL", placeholder="https://n8n...", env="n8n_api_url"),
            _f("api_key", "API Key", secret=True, env="n8n_api_key"),
        ],
        "required": ["api_key"],
        "guide": "Trong n8n → Settings → n8n API → Create an API key. Base URL "
        "trống sẽ tự suy từ domain n8n đã cấu hình.",
        "guide_url": "https://docs.n8n.io/api/authentication/",
    },
    {
        "key": "telegram",
        "name": "Telegram Bot",
        "group": "ai_infra",
        "fields": [
            _f("bot_token", "Bot Token", secret=True, env="telegram_bot_token"),
            _f("bot_username", "Bot Username (không @)", env="telegram_bot_username"),
        ],
        "required": ["bot_token"],
        "guide": "Chat với @BotFather → /newbot để tạo bot và lấy token.",
        "guide_url": "https://core.telegram.org/bots#botfather",
    },
    {
        "key": "openclaw",
        "name": "OpenClaw (God-Mode CEO)",
        "group": "ai_infra",
        "fields": [
            _f("god_token", "God Token", secret=True, env="openclaw_god_token"),
        ],
        "required": ["god_token"],
        "guide": "Sinh token mạnh bằng `openssl rand -hex 32`. Token này mở "
        "quyền god cho bridge OpenClaw — giữ tuyệt mật.",
        "guide_url": "",
    },
    {
        "key": "google_workspace",
        "name": "Google Workspace",
        "group": "ai_infra",
        "fields": [],
        "required": [],
        "managed": True,  # Kết nối qua luồng OAuth riêng (nút Connect), không nhập tay.
        "guide": "Kết nối bằng nút ở thẻ Google Workspace phía trên (OAuth Calendar "
        "+ Drive). Mục này chỉ hiển thị trạng thái.",
        "guide_url": "",
    },
]

# Index nhanh theo key.
_SERVICE_BY_KEY: dict[str, dict] = {s["key"]: s for s in SERVICES}


def service_keys() -> list[str]:
    return [s["key"] for s in SERVICES]


def get_service_def(service: str) -> Optional[dict]:
    return _SERVICE_BY_KEY.get(service)


# ---------------------------------------------------------------------------
# File store (atomic + thread-safe), neo DATA_DIR như các store khác
# ---------------------------------------------------------------------------

_STORE_FILE = "data/_runtime/integrations.json"


def _file_path() -> Path:
    p = Path(_STORE_FILE)
    if p.is_absolute():
        return p
    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / p).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / p).resolve()
    return (Path.cwd() / p).resolve()


def _load() -> dict:
    path = _file_path()
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f) or {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write(data: dict) -> None:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# ENV fallback per-service (đọc settings). Xử lý các kiểu đặc biệt (int/bool/
# n8n key resolved) ở một chỗ để get_credential gọn.
# ---------------------------------------------------------------------------

def _env_value(field: dict) -> Any:
    env_attr = field.get("env")
    if not env_attr:
        return None
    return getattr(settings, env_attr, None)


def _service_env_overrides(service: str) -> dict[str, Any]:
    """Override ENV đặc thù (vd n8n api_key có chuỗi fallback temp/token)."""
    if service == "n8n":
        return {
            "api_url": settings.n8n_api_base(),
            "api_key": settings.n8n_api_key_resolved(),
        }
    return {}


# ---------------------------------------------------------------------------
# Resolve credential: STORE trước → ENV (settings) sau
# ---------------------------------------------------------------------------

def _coerce(field: dict, value: Any) -> Any:
    """Ép kiểu theo field type cho giá trị từ store (JSON đã giữ kiểu, nhưng phòng
    trường hợp người nhập chuỗi)."""
    t = field.get("type")
    if value is None:
        return None
    if t == "number":
        try:
            return int(value)
        except (TypeError, ValueError):
            try:
                return float(value)
            except (TypeError, ValueError):
                return value
    if t == "bool":
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "yes", "on")
    return value


def get_credential(service: str) -> dict[str, Any]:
    """Credential ĐẦY ĐỦ (full secret) để CLIENT dùng nội bộ. STORE trước → ENV.

    KHÔNG trả ra FE. Trả dict {field_key: value} cho mọi field của service.
    """
    svc = _SERVICE_BY_KEY.get(service)
    if not svc:
        return {}
    with _LOCK:
        store_vals = (_load().get(service) or {}).get("values", {}) or {}
    env_overrides = _service_env_overrides(service)
    out: dict[str, Any] = {}
    for field in svc["fields"]:
        k = field["key"]
        sval = store_vals.get(k)
        if sval is not None and sval != "":
            out[k] = _coerce(field, sval)
            continue
        # ENV fallback: override đặc thù trước, rồi settings attr.
        if k in env_overrides:
            out[k] = env_overrides[k]
        else:
            out[k] = _env_value(field)
    return out


def get_value(service: str, field_key: str) -> Any:
    """Tiện ích lấy 1 field (store-first-then-env)."""
    return get_credential(service).get(field_key)


def _has_store(service: str) -> bool:
    with _LOCK:
        vals = (_load().get(service) or {}).get("values", {}) or {}
    return any(v not in (None, "") for v in vals.values())


def is_connected(service: str) -> bool:
    """Đã đủ field bắt buộc (resolve store-first-then-env) chưa."""
    svc = _SERVICE_BY_KEY.get(service)
    if not svc:
        return False
    if svc.get("managed"):
        if service == "google_workspace":
            try:
                from app.core import workspace_token_store

                return bool(workspace_token_store.get_status().get("connected"))
            except Exception:  # noqa: BLE001
                return False
        return False
    creds = get_credential(service)
    required = svc.get("required") or [f["key"] for f in svc["fields"]]
    return all(creds.get(r) not in (None, "") for r in required)


def _source(service: str) -> str:
    """store nếu có giá trị trong store; env nếu env cấp đủ; none nếu trống."""
    if _has_store(service):
        return "store"
    if is_connected(service):
        return "env"
    return "none"


# ---------------------------------------------------------------------------
# Mask + public view (CHE secret) cho FE
# ---------------------------------------------------------------------------

def _mask(value: Any) -> str:
    s = "" if value is None else str(value)
    if not s:
        return ""
    if len(s) <= 4:
        return "••••"
    return "••••" + s[-4:]


def public_view(service: str) -> dict:
    """Trạng thái AN TOÀN cho FE: connected + source + field đã che secret.

    Secret: KHÔNG trả full — chỉ {present, masked}. Non-secret: trả giá trị thật
    (base_url, port, page_id… không nhạy cảm).
    """
    svc = _SERVICE_BY_KEY.get(service)
    if not svc:
        return {}
    creds = get_credential(service)
    fields_out = []
    for field in svc["fields"]:
        k = field["key"]
        val = creds.get(k)
        present = val not in (None, "")
        item = {
            "key": k,
            "label": field["label"],
            "secret": field["secret"],
            "type": field["type"],
            "placeholder": field["placeholder"],
            "present": present,
        }
        if field["secret"]:
            item["masked"] = _mask(val) if present else ""
        else:
            item["value"] = "" if val is None else val
        fields_out.append(item)

    view = {
        "key": svc["key"],
        "name": svc["name"],
        "group": svc["group"],
        "managed": bool(svc.get("managed")),
        "connected": is_connected(service),
        "source": _source(service),
        "fields": fields_out,
        "guide": svc.get("guide", ""),
        "guide_url": svc.get("guide_url", ""),
    }
    if svc.get("managed") and service == "google_workspace":
        try:
            from app.core import workspace_token_store

            st = workspace_token_store.get_status()
            view["detail"] = st.get("email") or ""
        except Exception:  # noqa: BLE001
            view["detail"] = ""
    return view


def list_public() -> dict:
    """Toàn bộ dịch vụ (đã che secret) + nhóm — cho GET /admin/integrations."""
    return {
        "groups": GROUPS,
        "services": [public_view(s["key"]) for s in SERVICES],
    }


# ---------------------------------------------------------------------------
# Ghi / xoá credential
# ---------------------------------------------------------------------------

class IntegrationError(ValueError):
    """Lỗi validate credential khi lưu."""


def _validate(service: str, values: dict[str, Any]) -> None:
    svc = _SERVICE_BY_KEY[service]
    allowed = {f["key"]: f for f in svc["fields"]}
    for k, v in values.items():
        if k not in allowed:
            raise IntegrationError(f"Trường không hợp lệ: {k}")
        field = allowed[k]
        if field["type"] == "number" and v not in (None, ""):
            try:
                int(v)
            except (TypeError, ValueError):
                raise IntegrationError(f"Trường '{field['label']}' phải là số.")
    # Validate nhẹ theo nghiệp vụ.
    if service in ("chatwoot",) and values.get("base_url"):
        if not str(values["base_url"]).startswith(("http://", "https://")):
            raise IntegrationError("Base URL phải bắt đầu bằng http(s)://")
    if service == "n8n" and values.get("api_url"):
        if not str(values["api_url"]).startswith(("http://", "https://")):
            raise IntegrationError("Base URL n8n phải bắt đầu bằng http(s)://")


def save_credential(service: str, values: dict[str, Any], *, by: Optional[str] = None) -> dict:
    """Merge credential mới vào store (atomic).

    Quy ước: chỉ ghi đè field có giá trị non-empty trong payload → người dùng KHÔNG
    cần nhập lại secret cũ khi sửa field khác (để trống = giữ nguyên). Muốn xoá hẳn
    dùng DELETE. Trả public_view (đã che secret).
    """
    svc = _SERVICE_BY_KEY.get(service)
    if not svc:
        raise IntegrationError(f"Dịch vụ không tồn tại: {service}")
    if svc.get("managed"):
        raise IntegrationError("Dịch vụ này kết nối qua OAuth, không nhập tay.")
    _validate(service, values)
    with _LOCK:
        data = _load()
        entry = data.get(service) or {}
        cur_vals = entry.get("values", {}) or {}
        for k, v in values.items():
            if v is None:
                continue
            field = next((f for f in svc["fields"] if f["key"] == k), None)
            if field is None:
                continue
            if isinstance(v, str) and v.strip() == "" and field["type"] != "bool":
                continue  # để trống = giữ giá trị cũ
            cur_vals[k] = _coerce(field, v)
        entry["values"] = cur_vals
        entry["updated_at"] = _now()
        entry["updated_by"] = by
        data[service] = entry
        _write(data)
    return public_view(service)


def delete_credential(service: str) -> dict:
    """Xoá credential khỏi store (quay về ENV nếu có). Trả public_view mới."""
    svc = _SERVICE_BY_KEY.get(service)
    if not svc:
        raise IntegrationError(f"Dịch vụ không tồn tại: {service}")
    with _LOCK:
        data = _load()
        if service in data:
            del data[service]
            _write(data)
    return public_view(service)


def clear_all() -> None:
    """Xoá toàn bộ store — chỉ dùng trong test."""
    with _LOCK:
        _write({})


# ---------------------------------------------------------------------------
# Kiểm tra kết nối (test) — gọi thử dịch vụ, không bao giờ raise (trả {ok,detail})
# ---------------------------------------------------------------------------

async def test_service(service: str) -> dict:
    """Gọi thử kết nối 1 dịch vụ. Trả {ok, detail, info?}. KHÔNG raise / không 500."""
    svc = _SERVICE_BY_KEY.get(service)
    if not svc:
        return {"ok": False, "detail": "Dịch vụ không tồn tại."}
    handler: Optional[Callable] = _TEST_HANDLERS.get(service)
    if handler is None:
        # Không có cách test online → coi như "ok nếu đủ field bắt buộc".
        if is_connected(service):
            return {"ok": True, "detail": "Đã có đủ thông tin (không kiểm tra online)."}
        return {"ok": False, "detail": "Chưa đủ thông tin bắt buộc."}
    try:
        return await handler()
    except Exception as exc:  # noqa: BLE001 — test phải luôn trả về
        return {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}


async def _test_chatwoot() -> dict:
    from app.core import chatwoot_client

    diag = await chatwoot_client.diagnostics()
    if diag.get("ok"):
        return {
            "ok": True,
            "detail": f"Kết nối OK — {diag.get('conversation_count')} hội thoại.",
            "info": {"status_code": diag.get("status_code")},
        }
    return {"ok": False, "detail": diag.get("error") or diag.get("hint") or "Lỗi kết nối Chatwoot."}


async def _test_stringee() -> dict:
    from app.core import stringee_client

    if not stringee_client.is_configured():
        return {"ok": False, "detail": "Chưa cấu hình SID/Secret Stringee."}
    token = stringee_client.generate_rest_token(expires_seconds=120)
    return {
        "ok": bool(token),
        "detail": "Sinh access token REST thành công (SID/Secret hợp lệ về định dạng).",
    }


async def _test_smtp() -> dict:
    from app.core import smtp_ipv4

    creds = get_credential("email_smtp")
    host = creds.get("host")
    if not host:
        return {"ok": False, "detail": "Chưa cấu hình SMTP host."}
    port = int(creds.get("port") or 587)
    # 465 → SSL; còn lại dùng STARTTLS khi bật use_tls (mặc định 587 nên bật TLS).
    use_ssl = port == 465
    use_tls = bool(creds.get("use_tls")) and not use_ssl
    try:
        with smtp_ipv4.open_smtp(
            host, port, use_ssl=use_ssl, use_tls=use_tls, timeout=15
        ) as server:
            if creds.get("user"):
                server.login(creds.get("user"), creds.get("password") or "")
        mode = "SSL" if use_ssl else ("STARTTLS" if use_tls else "plain")
        return {
            "ok": True,
            "detail": f"Kết nối SMTP {host}:{port} ({mode}, IPv4) thành công.",
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"SMTP lỗi: {smtp_ipv4.classify_error(exc)}"}


async def _test_n8n() -> dict:
    from app.core import n8n_admin

    if not n8n_admin.is_configured():
        return {"ok": False, "detail": "Chưa cấu hình N8N_API_KEY."}
    try:
        wfs = await n8n_admin.list_workflows()
        return {"ok": True, "detail": f"Kết nối OK — {len(wfs)} workflow."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"n8n lỗi: {exc}"}


async def _http_get_json(url: str, *, params=None, headers=None, timeout=12.0):
    import httpx

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(url, params=params, headers=headers)
        return r.status_code, (r.json() if r.content else {}), r.text


async def _test_facebook() -> dict:
    creds = get_credential("facebook")
    token = creds.get("page_access_token")
    if not token:
        return {"ok": False, "detail": "Chưa có Page Access Token."}
    code, data, text = await _http_get_json(
        "https://graph.facebook.com/v19.0/me",
        params={"access_token": token, "fields": "id,name"},
    )
    if code == 200 and isinstance(data, dict) and data.get("id"):
        return {"ok": True, "detail": f"OK — {data.get('name')} (id {data.get('id')})."}
    err = (data.get("error") or {}).get("message") if isinstance(data, dict) else text[:200]
    return {"ok": False, "detail": f"Facebook từ chối: {err or code}"}


async def _test_zalo() -> dict:
    creds = get_credential("zalo")
    token = creds.get("oa_access_token")
    if not token:
        return {"ok": False, "detail": "Chưa có OA Access Token."}
    code, data, text = await _http_get_json(
        "https://openapi.zalo.me/v2.0/oa/getoa", headers={"access_token": token}
    )
    if code == 200 and isinstance(data, dict) and data.get("error") in (0, None):
        name = (data.get("data") or {}).get("name") if isinstance(data.get("data"), dict) else None
        return {"ok": True, "detail": f"OK — OA {name or ''}".strip()}
    msg = data.get("message") if isinstance(data, dict) else text[:200]
    return {"ok": False, "detail": f"Zalo từ chối: {msg or code}"}


async def _test_telegram() -> dict:
    creds = get_credential("telegram")
    token = creds.get("bot_token")
    if not token:
        return {"ok": False, "detail": "Chưa có Bot Token."}
    code, data, text = await _http_get_json(f"https://api.telegram.org/bot{token}/getMe")
    if code == 200 and isinstance(data, dict) and data.get("ok"):
        uname = (data.get("result") or {}).get("username")
        return {"ok": True, "detail": f"OK — @{uname}"}
    return {"ok": False, "detail": f"Telegram từ chối (HTTP {code})."}


async def _test_anthropic() -> dict:
    creds = get_credential("anthropic")
    key = creds.get("api_key")
    if not key:
        return {"ok": False, "detail": "Chưa có API key."}
    code, data, text = await _http_get_json(
        "https://api.anthropic.com/v1/models",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
    )
    if code == 200:
        n = len(data.get("data", [])) if isinstance(data, dict) else 0
        return {"ok": True, "detail": f"OK — truy cập được {n} model."}
    if code in (401, 403):
        return {"ok": False, "detail": "API key bị từ chối (401/403)."}
    return {"ok": False, "detail": f"Anthropic trả HTTP {code}."}


_TEST_HANDLERS: dict[str, Callable] = {
    "chatwoot": _test_chatwoot,
    "stringee": _test_stringee,
    "email_smtp": _test_smtp,
    "n8n": _test_n8n,
    "facebook": _test_facebook,
    "zalo": _test_zalo,
    "telegram": _test_telegram,
    "anthropic": _test_anthropic,
}
