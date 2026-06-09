"""Store chính sách bán hàng — JSON 1 object + auto-backup + version.

File: data/_runtime/sales_policy.json  → {SalesPolicyConfig dict}
Backup: data/_runtime/backups/sales_policy-{timestamp}.json (giữ N bản gần nhất)

Cùng convention atomic write / resolve path robust + version với
commission_config_store. Mỗi update: backup config cũ → tăng version → ghi atomic.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings
from app.schemas.sales_policy import SalesPolicyConfig, default_config

_LOCK = threading.RLock()


def _resolve(rel: str) -> Path:
    p = Path(rel)
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


def _config_path() -> Path:
    return _resolve(settings.sales_policy_file)


def _backup_dir() -> Path:
    return _config_path().parent / "backups"


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _read_raw() -> Optional[dict]:
    path = _config_path()
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_atomic(data: dict) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def validate_config(config: SalesPolicyConfig) -> None:
    """Raise ValueError nếu config không hợp lệ (kiểm tra nhẹ, nghiệp vụ cho phép)."""
    if not config.base_plans:
        raise ValueError("Cần ít nhất 1 phương án thanh toán.")
    keys = [p.key for p in config.base_plans]
    if len(keys) != len(set(keys)):
        raise ValueError("Key phương án thanh toán bị trùng.")
    for p in config.base_plans:
        if not (0 <= p.base_discount_pct <= 100):
            raise ValueError(f"Phương án '{p.label}': % chiết khấu gốc phải trong 0–100.")
    akeys = [a.key for a in config.addons]
    if len(akeys) != len(set(akeys)):
        raise ValueError("Key ưu đãi (addon) bị trùng.")
    for a in config.addons:
        if not (0 <= a.pct <= 100):
            raise ValueError(f"Ưu đãi '{a.label}': % phải trong 0–100.")
    if not (0 <= config.vat_pct <= 100):
        raise ValueError("VAT % phải trong 0–100.")
    if not (0 <= config.maintenance_pct <= 100):
        raise ValueError("Phí bảo trì % phải trong 0–100.")


def get_current() -> SalesPolicyConfig:
    """Load config hiện tại. Auto-tạo default (version 1) nếu chưa có file."""
    with _LOCK:
        raw = _read_raw()
        if raw is None:
            cfg = default_config()
            _write_atomic(cfg.model_dump(mode="json"))
            return cfg
        return SalesPolicyConfig.model_validate(raw)


def update(config: SalesPolicyConfig, by_admin_id: Optional[str]) -> SalesPolicyConfig:
    """Validate → backup config cũ → tăng version → ghi atomic. Trả config mới."""
    with _LOCK:
        validate_config(config)
        current_raw = _read_raw()
        if current_raw is not None:
            _backup(current_raw)
        prev_version = int((current_raw or {}).get("version", 0) or 0)
        config.version = prev_version + 1
        config.last_updated_by = by_admin_id
        config.last_updated_at = datetime.utcnow()
        _write_atomic(config.model_dump(mode="json"))
        return config


def get_history(limit: int = 10) -> list[dict]:
    with _LOCK:
        out: list[dict] = []
        cur = _read_raw()
        if cur is not None:
            out.append({
                "version": cur.get("version"),
                "last_updated_by": cur.get("last_updated_by"),
                "last_updated_at": cur.get("last_updated_at"),
                "backup_file": None,
                "is_current": True,
            })
        bdir = _backup_dir()
        if bdir.exists():
            files = sorted(bdir.glob("sales_policy-*.json"), reverse=True)
            for f in files[: max(0, limit - len(out))]:
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                out.append({
                    "version": data.get("version"),
                    "last_updated_by": data.get("last_updated_by"),
                    "last_updated_at": data.get("last_updated_at"),
                    "backup_file": f.name,
                    "is_current": False,
                })
        return out


def _backup(raw: dict) -> None:
    bdir = _backup_dir()
    bdir.mkdir(parents=True, exist_ok=True)
    ts = _now_iso().replace(":", "").replace(".", "").replace("-", "")
    (bdir / f"sales_policy-{ts}.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _rotate(bdir)


def _rotate(bdir: Path) -> None:
    keep = max(1, settings.sales_policy_backup_keep)
    files = sorted(bdir.glob("sales_policy-*.json"))
    for old in files[:-keep]:
        try:
            old.unlink()
        except OSError:
            pass


def clear() -> None:
    """Xoá config + backup — chỉ dùng trong test."""
    with _LOCK:
        path = _config_path()
        if path.exists():
            path.unlink()
        bdir = _backup_dir()
        if bdir.exists():
            for f in bdir.glob("sales_policy-*.json"):
                try:
                    f.unlink()
                except OSError:
                    pass
