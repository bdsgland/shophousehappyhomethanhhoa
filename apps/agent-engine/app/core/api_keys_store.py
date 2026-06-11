"""API KEYS — store cấp & quản lý khoá truy cập API/MCP cho công cụ ngoài.

MỤC TIÊU
  Cho phép admin tạo API key TOÀN QUYỀN (scope "admin_full") để công cụ ngoài
  (OpenClaw / script / tích hợp) gọi vào:
    • REST API qua https://api.eurowindowlightcity.net/docs (Authorize → Bearer).
    • MCP server tại /mcp (header X-Api-Key hoặc Authorization: Bearer elc_sk_...).

AN TOÀN (BẮT BUỘC)
  • KHÔNG lưu plaintext. Chỉ lưu HASH sha256 của phần bí mật.
  • Plaintext (vd `elc_sk_<40 hex>`) chỉ TRẢ VỀ 1 LẦN DUY NHẤT lúc tạo để user copy.
  • list/public_view CHE secret — chỉ hiển thị prefix (vd `elc_sk_ab12…`) + 4 ký tự
    cuối, KHÔNG bao giờ trả full/hash ra FE.
  • verify() so khớp HẰNG-THỜI-GIAN trên hash; chỉ chấp nhận key chưa revoke.
  • Mọi khoá đều TOÀN QUYỀN — cảnh báo rõ trên UI; chỉ require_admin được tạo/thu hồi.

PERSISTENCE
  File JSON ở DATA_DIR (Railway volume) — data/_runtime/api_keys.json — gitignored
  (**/_runtime/). Ghi atomic + thread-safe (RLock), đúng convention
  integrations_store / workspace_token_store / sales_policy_store.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

_LOCK = threading.RLock()

_STORE_FILE = "data/_runtime/api_keys.json"

# Tiền tố nhận diện khoá ELC (giúp phát hiện rò rỉ + phân biệt với token khác).
KEY_PREFIX = "elc_sk_"
# Số byte ngẫu nhiên cho phần bí mật → token_hex(20) = 40 ký tự hex.
_SECRET_BYTES = 20

# Các scope hợp lệ. Hiện chỉ "admin_full" (toàn quyền như admin); để mở rộng
# scope hẹp sau này (vd "read_only") mà không phá tương thích.
VALID_SCOPES = ("admin_full",)
DEFAULT_SCOPE = "admin_full"


# ---------------------------------------------------------------------------
# File store (atomic + thread-safe), neo DATA_DIR như các store khác
# ---------------------------------------------------------------------------

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


def _load() -> list[dict]:
    path = _file_path()
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []
    if isinstance(data, dict):  # phòng định dạng cũ {keys:[...]}
        data = data.get("keys", [])
    return data if isinstance(data, list) else []


def _write(keys: list[dict]) -> None:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(keys, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# Hash + mask
# ---------------------------------------------------------------------------

def _hash(secret: str) -> str:
    """sha256 hex của plaintext key. Chỉ HASH này được lưu bền."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _display_prefix(secret: str) -> str:
    """Phần đầu KHÔNG bí mật để hiển thị nhận diện: prefix + 4 hex đầu (vd elc_sk_ab12)."""
    body = secret[len(KEY_PREFIX):] if secret.startswith(KEY_PREFIX) else secret
    return f"{KEY_PREFIX}{body[:4]}"


def _masked(rec: dict) -> str:
    """Chuỗi che để hiển thị: prefix…last4 (last4 lưu sẵn lúc tạo, không phải secret)."""
    prefix = rec.get("prefix") or KEY_PREFIX
    last4 = rec.get("last4") or ""
    return f"{prefix}…{last4}" if last4 else f"{prefix}…"


# ---------------------------------------------------------------------------
# Public view (CHE secret) cho FE
# ---------------------------------------------------------------------------

def _public_view(rec: dict) -> dict:
    """Bản ghi AN TOÀN cho FE: KHÔNG có hash, KHÔNG có plaintext."""
    return {
        "id": rec.get("id"),
        "name": rec.get("name"),
        "scope": rec.get("scope"),
        "prefix": rec.get("prefix"),
        "masked": _masked(rec),
        "created_at": rec.get("created_at"),
        "created_by": rec.get("created_by"),
        "last_used_at": rec.get("last_used_at"),
        "revoked": bool(rec.get("revoked")),
        "revoked_at": rec.get("revoked_at"),
    }


def list_public() -> list[dict]:
    """Toàn bộ key đã che secret — mới nhất trước. Cho GET /admin/api-keys."""
    with _LOCK:
        keys = _load()
    keys_sorted = sorted(keys, key=lambda k: k.get("created_at") or "", reverse=True)
    return [_public_view(k) for k in keys_sorted]


# ---------------------------------------------------------------------------
# Tạo / thu hồi
# ---------------------------------------------------------------------------

class ApiKeyError(ValueError):
    """Lỗi nghiệp vụ khi tạo/thu hồi key."""


def create_key(
    name: str,
    *,
    scope: str = DEFAULT_SCOPE,
    by: Optional[str] = None,
) -> dict:
    """Tạo 1 API key mới. Trả về dict gồm bản ghi public + `plaintext` (1 LẦN DUY NHẤT).

    KHÔNG lưu plaintext — chỉ hash. Caller PHẢI hiển thị plaintext cho user ngay
    rồi quên đi (không log).
    """
    name = (name or "").strip()
    if not name:
        raise ApiKeyError("Tên khoá không được để trống.")
    if scope not in VALID_SCOPES:
        raise ApiKeyError(f"Scope không hợp lệ: {scope}")

    secret = f"{KEY_PREFIX}{secrets.token_hex(_SECRET_BYTES)}"
    rec = {
        "id": str(uuid4()),
        "name": name,
        "scope": scope,
        "prefix": _display_prefix(secret),
        "last4": secret[-4:],
        "hash": _hash(secret),
        "created_at": _now(),
        "created_by": by,
        "last_used_at": None,
        "revoked": False,
        "revoked_at": None,
    }
    with _LOCK:
        keys = _load()
        keys.append(rec)
        _write(keys)
    view = _public_view(rec)
    view["plaintext"] = secret  # CHỈ trả lần này — không lưu, không log
    return view


def revoke_key(key_id: str) -> Optional[dict]:
    """Thu hồi 1 key (đánh dấu revoked, giữ bản ghi để audit). Trả public_view hoặc None."""
    with _LOCK:
        keys = _load()
        target = None
        for rec in keys:
            if rec.get("id") == key_id:
                target = rec
                break
        if target is None:
            return None
        if not target.get("revoked"):
            target["revoked"] = True
            target["revoked_at"] = _now()
            _write(keys)
    return _public_view(target)


# ---------------------------------------------------------------------------
# Xác thực — verify(key) → record nếu hợp lệ + chưa revoke, cập nhật last_used_at
# ---------------------------------------------------------------------------

def verify(key: Optional[str]) -> Optional[dict]:
    """Kiểm tra plaintext key. Trả public_view (kèm scope) nếu hợp lệ + chưa revoke.

    So khớp HẰNG-THỜI-GIAN trên hash để tránh timing attack. Cập nhật last_used_at
    (best-effort, không chặn nếu ghi lỗi). Trả None nếu sai/không tồn tại/đã revoke.
    """
    if not key or not isinstance(key, str):
        return None
    key = key.strip()
    if not key.startswith(KEY_PREFIX):
        return None
    presented_hash = _hash(key)
    with _LOCK:
        keys = _load()
        matched = None
        for rec in keys:
            stored = rec.get("hash") or ""
            # compare_digest trên 2 chuỗi hex cùng độ dài — an toàn timing.
            if stored and secrets.compare_digest(stored, presented_hash):
                matched = rec
                break
        if matched is None:
            return None
        if matched.get("revoked"):
            return None
        matched["last_used_at"] = _now()
        try:
            _write(keys)
        except OSError:
            pass  # cập nhật last_used là best-effort, không chặn xác thực
    return _public_view(matched)


def clear_all() -> None:
    """Xoá toàn bộ store — chỉ dùng trong test."""
    with _LOCK:
        _write([])
