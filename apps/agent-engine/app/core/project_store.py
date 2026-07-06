"""Project store — NỘI DUNG biên tập các tab dự án (CMS), 1 file JSON / slug.

File: data/_runtime/projects/{slug}.json  → {ProjectDoc dict}
Backup: data/_runtime/projects/backups/{slug}-{timestamp}.json (giữ N bản gần nhất)

Cùng convention với sales_policy_store / inventory_store:
  - Thread-safe (RLock) + atomic write (.tmp → replace).
  - DATA_DIR aware (Railway Volume) → CWD fallback.
  - Auto-backup trước mỗi lần ghi đè + tăng version + last_updated_by/at.
  - File schema cũ/hỏng → backup bản hỏng rồi tái tạo (KHÔNG để 500).

CHỈ giữ nội dung TỰ DO (overview/location/training/subzones/gallery360/policy
text/timeline/news). Quỹ căn → inventory_store; Tài liệu → learning_store; số
liệu phiếu giá → sales_policy_store.

Seed: slug happy-home-thanh-hoa lấy từ core/project_seed.py (chuyển từ
apps/web/.../project-data.ts) để không mất nội dung đang hiển thị. Slug khác chưa có
file → tạo ProjectDoc rỗng (admin tự nhập).
"""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings
from app.core.project_seed import DEFAULT_SLUG, default_elc_project
from app.schemas.project import (
    ProjectContent,
    ProjectDoc,
    ProjectSummary,
    ProjectUpdateIn,
    SECTION_MODELS,
)

_LOCK = threading.RLock()

# Slug an toàn cho tên file (chống path traversal): chữ thường, số, gạch ngang.
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")


# ---------------------------------------------------------------------------
# Resolve đường dẫn — robust với mọi cấu trúc deploy (giống inventory_store).
# ---------------------------------------------------------------------------
def _projects_dir() -> Path:
    p = Path(settings.projects_dir)
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


def _backup_dir() -> Path:
    return _projects_dir() / "backups"


def normalize_slug(slug: str) -> str:
    """Chuẩn hoá + kiểm tra slug. Raise ValueError nếu không hợp lệ (chống traversal)."""
    s = (slug or "").strip().lower()
    if not _SLUG_RE.match(s):
        raise ValueError("Slug dự án không hợp lệ (chỉ a-z, 0-9, gạch ngang).")
    return s


def _project_path(slug: str) -> Path:
    return _projects_dir() / f"{normalize_slug(slug)}.json"


def _now() -> datetime:
    return datetime.utcnow()


def _ts() -> str:
    return _now().isoformat().replace(":", "").replace(".", "").replace("-", "") + "Z"


# ---------------------------------------------------------------------------
# IO thấp tầng
# ---------------------------------------------------------------------------
def _read_raw(slug: str) -> Optional[dict]:
    path = _project_path(slug)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _write_atomic(slug: str, doc: ProjectDoc) -> None:
    path = _project_path(slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    # by_alias=True để PriceRow.price_from xuất ra key "from" (khớp web project-data).
    data = doc.model_dump(mode="json", by_alias=True)
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _backup_raw(slug: str, raw: dict) -> None:
    bdir = _backup_dir()
    bdir.mkdir(parents=True, exist_ok=True)
    (bdir / f"{normalize_slug(slug)}-{_ts()}.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _rotate(slug, bdir)


def _rotate(slug: str, bdir: Path) -> None:
    keep = max(1, settings.projects_backup_keep)
    files = sorted(bdir.glob(f"{normalize_slug(slug)}-*.json"))
    for old in files[:-keep]:
        try:
            old.unlink()
        except OSError:
            pass


def _seed_for(slug: str) -> ProjectDoc:
    """ProjectDoc mặc định khi chưa có file: Happy Home = seed đầy đủ; khác = rỗng."""
    if slug == DEFAULT_SLUG:
        return default_elc_project()
    return ProjectDoc(slug=slug, name=slug)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get(slug: str) -> ProjectDoc:
    """Load nội dung dự án. Auto-seed (ghi file) nếu chưa có / file hỏng schema cũ.

    KHÔNG raise khi schema cũ/hỏng — backup bản hỏng rồi tái tạo seed (giữ uptime).
    """
    slug = normalize_slug(slug)
    with _LOCK:
        raw = _read_raw(slug)
        if raw is None:
            doc = _seed_for(slug)
            _write_atomic(slug, doc)
            return doc
        try:
            doc = ProjectDoc.model_validate(raw)
            # Đảm bảo slug trong file khớp tên file (chống lệch khi copy thủ công).
            doc.slug = slug
            return doc
        except Exception:  # noqa: BLE001 — schema cũ/hỏng → backup + reseed
            try:
                _backup_raw(slug, raw)
            except Exception:  # noqa: BLE001
                pass
            doc = _seed_for(slug)
            _write_atomic(slug, doc)
            return doc


def exists(slug: str) -> bool:
    try:
        return _project_path(slug).exists()
    except ValueError:
        return False


def list_projects() -> list[ProjectSummary]:
    """Danh sách dự án (đảm bảo dự án Happy Home mặc định luôn xuất hiện dù chưa có file)."""
    with _LOCK:
        out: dict[str, ProjectSummary] = {}
        pdir = _projects_dir()
        if pdir.exists():
            for f in sorted(pdir.glob("*.json")):
                slug = f.stem
                try:
                    slug = normalize_slug(slug)
                except ValueError:
                    continue
                raw = _read_raw(slug) or {}
                out[slug] = ProjectSummary(
                    slug=slug,
                    name=raw.get("name") or slug,
                    status=raw.get("status") or "",
                    version=int(raw.get("version", 1) or 1),
                    last_updated_at=raw.get("last_updated_at"),
                )
        # Luôn hiển thị dự án Happy Home mặc định (auto-seed lần đầu khi admin mở).
        if DEFAULT_SLUG not in out:
            seed = default_elc_project()
            out[DEFAULT_SLUG] = ProjectSummary(
                slug=seed.slug, name=seed.name, status=seed.status, version=seed.version,
            )
        return list(out.values())


def save(doc: ProjectDoc, by_admin_id: Optional[str]) -> ProjectDoc:
    """Ghi đè toàn bộ dự án: backup bản cũ → tăng version → atomic. Trả bản mới."""
    slug = normalize_slug(doc.slug)
    doc.slug = slug
    with _LOCK:
        current_raw = _read_raw(slug)
        if current_raw is not None:
            _backup_raw(slug, current_raw)
        prev_version = int((current_raw or {}).get("version", 0) or 0)
        doc.version = prev_version + 1
        doc.last_updated_by = by_admin_id
        doc.last_updated_at = _now()
        _write_atomic(slug, doc)
        return doc


def update_meta_and_content(
    slug: str, payload: ProjectUpdateIn, by_admin_id: Optional[str]
) -> ProjectDoc:
    """Cập nhật meta (name/tagline/...) + (tuỳ chọn) toàn bộ content. Field None = giữ nguyên."""
    slug = normalize_slug(slug)
    with _LOCK:
        doc = get(slug)
        for field in ("name", "tagline", "status", "developer", "location"):
            val = getattr(payload, field)
            if val is not None:
                setattr(doc, field, val)
        if payload.content is not None:
            doc.content = payload.content
        return save(doc, by_admin_id)


def update_section(
    slug: str, section: str, data: dict, by_admin_id: Optional[str]
) -> ProjectDoc:
    """Cập nhật 1 tab nội dung (validate theo SECTION_MODELS). Raise ValueError nếu sai."""
    slug = normalize_slug(slug)
    model = SECTION_MODELS.get(section)
    if model is None:
        raise ValueError(f"Section không hợp lệ: {section}")
    try:
        validated = model.model_validate(data)
    except Exception as e:  # noqa: BLE001 — trả 400 ở tầng API
        raise ValueError(f"Dữ liệu section '{section}' không hợp lệ: {e}")
    with _LOCK:
        doc = get(slug)
        setattr(doc.content, section, validated)
        return save(doc, by_admin_id)


def get_history(slug: str, limit: int = 10) -> list[dict]:
    slug = normalize_slug(slug)
    with _LOCK:
        out: list[dict] = []
        cur = _read_raw(slug)
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
            files = sorted(bdir.glob(f"{slug}-*.json"), reverse=True)
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


def clear(slug: Optional[str] = None) -> None:
    """Xoá file + backup — chỉ dùng trong test. slug=None → xoá toàn bộ thư mục dự án."""
    with _LOCK:
        pdir = _projects_dir()
        if not pdir.exists():
            return
        if slug is None:
            for f in pdir.glob("*.json"):
                try:
                    f.unlink()
                except OSError:
                    pass
            bdir = _backup_dir()
            if bdir.exists():
                for f in bdir.glob("*.json"):
                    try:
                        f.unlink()
                    except OSError:
                        pass
        else:
            s = normalize_slug(slug)
            p = pdir / f"{s}.json"
            if p.exists():
                p.unlink()
            bdir = _backup_dir()
            if bdir.exists():
                for f in bdir.glob(f"{s}-*.json"):
                    try:
                        f.unlink()
                    except OSError:
                        pass
