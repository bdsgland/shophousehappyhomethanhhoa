"""Store cấu hình hoa hồng — JSON 1 object + auto-backup + version + validate.

File: data/_runtime/commission_config.json  → {CommissionConfig dict}
Backup: data/_runtime/backups/commission_config-{timestamp}.json (giữ N bản gần nhất)

Cùng convention atomic write / resolve path robust với lead_store & inventory_store.
Mỗi lần update: backup config hiện tại → tăng version → ghi atomic. Validate chặt:
tổng % 5 bậc = 100%, các bậc KPI liên tục (max bậc N == min bậc N+1, bậc cuối max=None).
Sau migrate PostgreSQL — giữ interface (get_current/update/get_history/restore) để swap dễ.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings
from app.schemas.commission_config import CommissionConfig, default_config

_LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# Path / IO helpers
# ---------------------------------------------------------------------------

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
    return _resolve(settings.commission_config_file)


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


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_config(config: CommissionConfig) -> None:
    """Raise ValueError nếu config không hợp lệ.

    - total_pool_percentage > 0
    - tổng % 5 bậc == 100%
    - các bậc KPI liên tục, không chồng lấn, bậc cuối max = None
    - các % trong khoảng [0, 100]
    """
    if config.total_pool_percentage <= 0:
        raise ValueError("Tổng pool hoa hồng phải > 0%.")

    if not config.tiers:
        raise ValueError("Cần ít nhất 1 bậc phân chia.")
    total = sum(t.percentage for t in config.tiers)
    if abs(total - 100.0) > 0.01:
        raise ValueError(
            f"Tổng % của {len(config.tiers)} bậc phân chia phải = 100% (hiện {total:g}%)."
        )
    for t in config.tiers:
        if not (0 <= t.percentage <= 100):
            raise ValueError(f"Bậc '{t.label_vi}': % phải trong khoảng 0–100.")

    kpi = config.frontline_kpi_tiers
    if not kpi:
        raise ValueError("Cần ít nhất 1 bậc KPI frontline.")
    tiers = sorted(kpi, key=lambda t: t.min_monthly_volume)
    for i, t in enumerate(tiers):
        if t.min_monthly_volume < 0:
            raise ValueError(f"Bậc KPI '{t.name}': doanh số tối thiểu không được âm.")
        if not (0 <= t.frontline_percentage <= 100):
            raise ValueError(f"Bậc KPI '{t.name}': % frontline phải trong 0–100.")
        if t.ekip_bonus_percentage < 0:
            raise ValueError(f"Bậc KPI '{t.name}': % ekip bonus không được âm.")
        is_last = i == len(tiers) - 1
        if is_last:
            if t.max_monthly_volume is not None:
                raise ValueError(
                    f"Bậc KPI cao nhất ('{t.name}') phải có doanh số tối đa = không giới hạn (null)."
                )
        else:
            if t.max_monthly_volume is None:
                raise ValueError(
                    f"Chỉ bậc KPI cao nhất mới được để doanh số tối đa = null (bậc '{t.name}')."
                )
            if t.max_monthly_volume <= t.min_monthly_volume:
                raise ValueError(
                    f"Bậc KPI '{t.name}': doanh số tối đa phải lớn hơn tối thiểu."
                )
            nxt = tiers[i + 1]
            if t.max_monthly_volume != nxt.min_monthly_volume:
                raise ValueError(
                    f"Bậc KPI không liên tục: 'đến' của bậc '{t.name}' "
                    f"({t.max_monthly_volume:,}) phải bằng 'từ' của bậc '{nxt.name}' "
                    f"({nxt.min_monthly_volume:,})."
                )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_current() -> CommissionConfig:
    """Load config hiện tại. Auto-tạo default (version 1) nếu chưa có file."""
    with _LOCK:
        raw = _read_raw()
        if raw is None:
            cfg = default_config()
            _write_atomic(cfg.model_dump(mode="json"))
            return cfg
        return CommissionConfig.model_validate(raw)


def update(config: CommissionConfig, by_admin_id: Optional[str]) -> CommissionConfig:
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
    """Danh sách version gần đây (current + các backup), mới nhất trước."""
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
            files = sorted(bdir.glob("commission_config-*.json"), reverse=True)
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


def restore(version: int, by_admin_id: Optional[str]) -> CommissionConfig:
    """Khôi phục 1 version cũ từ backup (ghi thành version mới, backup current)."""
    with _LOCK:
        target: Optional[dict] = None
        bdir = _backup_dir()
        if bdir.exists():
            for f in sorted(bdir.glob("commission_config-*.json"), reverse=True):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if data.get("version") == version:
                    target = data
                    break
        if target is None:
            raise ValueError(f"Không tìm thấy phiên bản {version} trong lịch sử backup.")
        cfg = CommissionConfig.model_validate(target)
        return update(cfg, by_admin_id)


# ---------------------------------------------------------------------------
# Backup helpers
# ---------------------------------------------------------------------------

def _backup(raw: dict) -> None:
    bdir = _backup_dir()
    bdir.mkdir(parents=True, exist_ok=True)
    ts = _now_iso().replace(":", "").replace(".", "").replace("-", "")
    fname = f"commission_config-{ts}.json"
    (bdir / fname).write_text(
        json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _rotate(bdir)


def _rotate(bdir: Path) -> None:
    keep = max(1, settings.commission_config_backup_keep)
    files = sorted(bdir.glob("commission_config-*.json"))
    for old in files[:-keep]:
        try:
            old.unlink()
        except OSError:
            pass


def clear() -> None:
    """Xoá config + toàn bộ backup — chỉ dùng trong test."""
    with _LOCK:
        path = _config_path()
        if path.exists():
            path.unlink()
        bdir = _backup_dir()
        if bdir.exists():
            for f in bdir.glob("commission_config-*.json"):
                try:
                    f.unlink()
                except OSError:
                    pass
