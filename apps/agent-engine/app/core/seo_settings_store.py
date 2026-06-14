"""SEO settings store — cấu hình SEO MẶC ĐỊNH toàn site + override theo page key.

File: data/_runtime/seo_settings.json → {SeoSettings dict}
Backup: data/_runtime/backups/seo_settings-{timestamp}.json (giữ N bản gần nhất)

Cùng convention store JSON (RLock + atomic write + version + backup + DATA_DIR
aware) với sales_policy_store / commission_config_store. File hỏng/schema cũ →
backup bản hỏng rồi tái tạo mặc định (KHÔNG để 500).

CHỈ admin sửa (GET/PUT). Web đọc để áp metadata site-wide vào layout/page.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings
from app.schemas.news import SeoPageOverride, SeoSettings, SeoSettingsUpdate

_LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# Path / IO
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


def _path() -> Path:
    return _resolve(settings.seo_settings_file)


def _backup_dir() -> Path:
    return _path().parent / "backups"


def _now() -> datetime:
    return datetime.utcnow()


def _ts() -> str:
    return _now().isoformat().replace(":", "").replace(".", "").replace("-", "") + "Z"


def _read_raw() -> Optional[dict]:
    path = _path()
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_atomic(doc: SeoSettings) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(doc.model_dump(mode="json"), f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _backup_raw(raw: dict) -> None:
    bdir = _backup_dir()
    bdir.mkdir(parents=True, exist_ok=True)
    (bdir / f"seo_settings-{_ts()}.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    keep = max(1, int(settings.seo_settings_backup_keep))
    files = sorted(bdir.glob("seo_settings-*.json"))
    for old in files[:-keep]:
        try:
            old.unlink()
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get() -> SeoSettings:
    """Load cấu hình SEO. Auto-seed (ghi file) nếu chưa có / file hỏng schema cũ."""
    with _LOCK:
        raw = _read_raw()
        if raw is None:
            doc = SeoSettings()
            _write_atomic(doc)
            return doc
        try:
            return SeoSettings.model_validate(raw)
        except Exception:  # noqa: BLE001 — schema cũ/hỏng → backup + reseed
            try:
                _backup_raw(raw)
            except Exception:  # noqa: BLE001
                pass
            doc = SeoSettings()
            _write_atomic(doc)
            return doc


def update(payload: SeoSettingsUpdate, by_admin_id: Optional[str]) -> SeoSettings:
    """Cập nhật field (None = giữ nguyên) → backup bản cũ → tăng version → atomic."""
    with _LOCK:
        current_raw = _read_raw()
        doc = get()
        data = payload.model_dump(exclude_unset=True)
        for field in (
            "site_name", "title_template", "default_title", "default_description",
            "default_keywords", "default_og_image", "base_url", "twitter_handle",
            "robots",
        ):
            if data.get(field) is not None:
                setattr(doc, field, data[field])
        if data.get("pages") is not None:
            # payload.pages đã là dict[str, SeoPageOverride] (validated).
            doc.pages = {
                k: (v if isinstance(v, SeoPageOverride) else SeoPageOverride.model_validate(v))
                for k, v in payload.pages.items()  # type: ignore[union-attr]
            }
        if current_raw is not None:
            try:
                _backup_raw(current_raw)
            except Exception:  # noqa: BLE001
                pass
        doc.version = int((current_raw or {}).get("version", 0) or 0) + 1
        doc.updated_by = by_admin_id
        doc.updated_at = _now().isoformat() + "Z"
        _write_atomic(doc)
        return doc


def clear() -> None:
    """Xoá file + backup — chỉ dùng trong test."""
    with _LOCK:
        p = _path()
        if p.exists():
            p.unlink()
        bdir = _backup_dir()
        if bdir.exists():
            for f in bdir.glob("seo_settings-*.json"):
                try:
                    f.unlink()
                except OSError:
                    pass
