"""Cấu hình hệ thống do admin chỉnh (JSON persistent) — tách khỏi env secrets.

Lưu ở data/_runtime/system_settings.json (resolve giống users.json: DATA_DIR /
agent-engine / CWD). Chứa thông tin site, branding, quy tắc thông báo... KHÔNG
lưu secrets thật (token tích hợp đọc trạng thái từ env, chỉ hiển thị connected
/ disconnected) để tránh rò rỉ qua API.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from app.core.settings import settings

_LOCK = threading.Lock()

_DEFAULTS: dict[str, Any] = {
    "general": {
        "site_name": "Eurowindow Light City",
        "logo_url": "",
        "contact_email": "info@eurowindowlightcity.net",
        "contact_phone": "1900 0000",
        "working_hours": "08:00 - 18:00 (T2 - T7)",
    },
    "notifications": {
        "email_on_hot_lead": True,
        "telegram_on_hot_lead": True,
        "notify_sale_on_assignment": True,
        "daily_briefing": True,
    },
}


def _file_path() -> Path:
    p = Path("data/_runtime/system_settings.json")
    data_dir = os.getenv("DATA_DIR")
    if data_dir:
        return (Path(data_dir) / p).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "agent-engine":
            return (parent / p).resolve()
    return (Path.cwd() / p).resolve()


def _merge(base: dict, override: dict) -> dict:
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def _load() -> dict:
    path = _file_path()
    if not path.exists():
        return {k: dict(v) for k, v in _DEFAULTS.items()}
    try:
        with path.open("r", encoding="utf-8") as f:
            stored = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {k: dict(v) for k, v in _DEFAULTS.items()}
    return _merge(_DEFAULTS, stored)


def _save(data: dict) -> None:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def get_settings() -> dict:
    with _LOCK:
        return _load()


def update_settings(patch: dict) -> dict:
    """Cập nhật một phần cấu hình (deep-merge). Trả về cấu hình mới."""
    with _LOCK:
        current = _load()
        merged = _merge(current, patch)
        _save(merged)
        return merged


def integrations_status() -> list[dict]:
    """Trạng thái kết nối các tích hợp — đọc từ env, KHÔNG trả secret thật."""

    def _entry(key: str, name: str, connected: bool, detail: str = "") -> dict:
        return {
            "key": key,
            "name": name,
            "status": "connected" if connected else "disconnected",
            "detail": detail,
        }

    return [
        _entry(
            "anthropic",
            "Anthropic Claude",
            bool(settings.anthropic_api_key) and not settings.use_mock_llm,
            "Mock LLM đang BẬT" if settings.use_mock_llm else settings.llm_model,
        ),
        _entry(
            "chatwoot",
            "Chatwoot",
            bool(settings.chatwoot_api_token),
            settings.chatwoot_base_url,
        ),
        _entry(
            "n8n",
            "n8n Automation",
            bool(settings.platform_n8n_url),
            settings.platform_n8n_url,
        ),
        _entry(
            "telegram",
            "Telegram Bot",
            bool(settings.telegram_bot_token),
            f"@{settings.telegram_bot_username}",
        ),
        _entry(
            "database",
            "PostgreSQL",
            bool(settings.database_url),
            "Dual-write" if settings.database_url else "Đang chạy JSON",
        ),
        _entry(
            "internal_token",
            "Webhook nội bộ (n8n)",
            bool(settings.internal_webhook_token),
            "Đã đặt X-Internal-Token" if settings.internal_webhook_token else "Chưa đặt",
        ),
    ]
