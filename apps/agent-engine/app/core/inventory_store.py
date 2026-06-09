"""Inventory store — persist quỹ căn ra JSON file (Railway Volume aware).

Thay thế biến in-memory `_UNITS` (sinh mock mỗi lần khởi động process). Sau khi
admin đồng bộ từ Google Sheets, dữ liệu THẬT được ghi xuống file và là nguồn sự
thật giữa các lần redeploy.

Format file (data/_runtime/inventory.json):
  {
    "units": [ {id, lo, phan_khu, loai, dien_tich, mat_tien, trang_thai,
                gia_tri, gia, gia_min, gia_max, huong, view, duong, ...,
                position:{x,y}, deleted:false, updated_at} ],
    "sync_history": [ InventorySyncResult-dict, ... ]  # mới nhất ở cuối
  }

An toàn dữ liệu (quy tắc tuyệt đối của dự án):
  - Thread-safe (Lock) + atomic write (.tmp → replace) — giống booking_store.
  - AUTO-BACKUP trước mỗi lần ghi đè lớn (replace_all / restore): copy file hiện
    tại sang data/_runtime/backups/inventory-{timestamp}.json, giữ N bản gần nhất.
  - SOFT DELETE: căn bị xoá chỉ set deleted=True, không mất khỏi file.
  - DATA_DIR aware: resolve path giống user_store/booking_store.

Sau này migrate PostgreSQL — giữ interface (get_all/get_by_id/replace_all/
bulk_upsert/update/delete_soft) để swap dễ.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.settings import settings

_LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# Resolve đường dẫn (giống booking_store) — robust với mọi cấu trúc deploy.
# ---------------------------------------------------------------------------
def _file_path() -> Path:
    p = Path(settings.inventory_file)
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


def _backups_dir() -> Path:
    return _file_path().parent / "backups"


def _ensure_file() -> Path:
    path = _file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(
            json.dumps({"units": [], "sync_history": []}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return path


def _load() -> dict:
    path = _ensure_file()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        # File hỏng → KHÔNG ghi đè (an toàn dữ liệu). Trả rỗng để fallback mock.
        return {"units": [], "sync_history": []}
    data.setdefault("units", [])
    data.setdefault("sync_history", [])
    return data


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _save(data: dict) -> None:
    _write(_ensure_file(), data)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ---------------------------------------------------------------------------
# Backup / restore
# ---------------------------------------------------------------------------
def backup_now() -> Optional[str]:
    """Copy file inventory hiện tại sang backups/inventory-{ts}.json.

    Trả về filename backup (hoặc None nếu chưa có file để backup). Rotate giữ
    lại `inventory_backup_keep` bản gần nhất, xoá bản cũ hơn.
    """
    with _LOCK:
        src = _file_path()
        if not src.exists():
            return None
        bdir = _backups_dir()
        bdir.mkdir(parents=True, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        # Tránh ghi đè nếu 2 sync trong cùng giây.
        fname = f"inventory-{ts}.json"
        dest = bdir / fname
        suffix = 1
        while dest.exists():
            fname = f"inventory-{ts}-{suffix}.json"
            dest = bdir / fname
            suffix += 1
        shutil.copy2(src, dest)
        _rotate_backups()
        return fname


def _rotate_backups() -> None:
    bdir = _backups_dir()
    if not bdir.exists():
        return
    keep = max(1, int(settings.inventory_backup_keep))
    files = sorted(
        bdir.glob("inventory-*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in files[keep:]:
        try:
            old.unlink()
        except OSError:
            pass


def list_backups() -> list[dict]:
    """Liệt kê backup gần nhất trước (timestamp, filename, size, số căn)."""
    with _LOCK:
        bdir = _backups_dir()
        if not bdir.exists():
            return []
        out: list[dict] = []
        for p in sorted(
            bdir.glob("inventory-*.json"),
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        ):
            try:
                content = json.loads(p.read_text(encoding="utf-8"))
                count = len(content.get("units", []))
            except (json.JSONDecodeError, OSError):
                count = -1
            # timestamp = phần sau "inventory-" và trước ".json"
            ts = p.stem.replace("inventory-", "", 1)
            out.append(
                {
                    "timestamp": ts,
                    "filename": p.name,
                    "size_bytes": p.stat().st_size,
                    "unit_count": count,
                }
            )
        return out


def restore_from_backup(timestamp: str) -> int:
    """Khôi phục inventory từ backup theo timestamp (hoặc filename đầy đủ).

    Tự backup TRẠNG THÁI HIỆN TẠI trước khi ghi đè (an toàn 2 chiều). Trả về số
    căn sau khi khôi phục. Raise FileNotFoundError nếu không thấy backup.
    """
    with _LOCK:
        bdir = _backups_dir()
        # Cho phép truyền cả filename đầy đủ hoặc chỉ timestamp.
        cand = bdir / timestamp
        if not cand.exists():
            cand = bdir / f"inventory-{timestamp}.json"
        if not cand.exists():
            raise FileNotFoundError(f"Không tìm thấy backup: {timestamp}")
        content = json.loads(cand.read_text(encoding="utf-8"))
        content.setdefault("units", [])
        content.setdefault("sync_history", [])
        # Backup hiện trạng trước khi overwrite.
        backup_now()
        _save(content)
        return len(content["units"])


# ---------------------------------------------------------------------------
# CRUD đơn vị căn
# ---------------------------------------------------------------------------
def get_all(include_deleted: bool = False) -> list[dict]:
    with _LOCK:
        units = _load()["units"]
        if include_deleted:
            return list(units)
        return [u for u in units if not u.get("deleted")]


def is_empty() -> bool:
    """True nếu store chưa có căn nào (chưa sync) → caller dùng mock fallback."""
    return len(get_all(include_deleted=False)) == 0


def get_by_id(unit_id: str, include_deleted: bool = False) -> Optional[dict]:
    with _LOCK:
        for u in _load()["units"]:
            if u["id"] == unit_id and (include_deleted or not u.get("deleted")):
                return u
    return None


def create(unit: dict) -> dict:
    with _LOCK:
        data = _load()
        if any(u["id"] == unit["id"] for u in data["units"]):
            raise ValueError(f"Mã căn đã tồn tại: {unit['id']}")
        unit.setdefault("deleted", False)
        unit["updated_at"] = _now_iso()
        data["units"].append(unit)
        _save(data)
        return unit


def update(unit_id: str, changes: dict) -> Optional[dict]:
    """Cập nhật field tuỳ ý của 1 căn (đè trực tiếp các key trong changes)."""
    with _LOCK:
        data = _load()
        for u in data["units"]:
            if u["id"] == unit_id:
                for k, v in changes.items():
                    u[k] = v
                u["updated_at"] = _now_iso()
                _save(data)
                return u
    return None


def delete_soft(unit_id: str) -> bool:
    """Soft delete — chỉ set deleted=True, KHÔNG xoá khỏi file."""
    with _LOCK:
        data = _load()
        for u in data["units"]:
            if u["id"] == unit_id and not u.get("deleted"):
                u["deleted"] = True
                u["updated_at"] = _now_iso()
                _save(data)
                return True
    return False


def bulk_upsert(units: list[dict]) -> dict:
    """Upsert nhiều căn theo id. Trả về {created, updated}. Giữ căn cũ không có
    trong danh sách (merge — dùng cho replace_all=False)."""
    with _LOCK:
        data = _load()
        by_id = {u["id"]: u for u in data["units"]}
        created = updated = 0
        for nu in units:
            nu.setdefault("deleted", False)
            nu["updated_at"] = _now_iso()
            if nu["id"] in by_id:
                # Giữ lại các field admin có thể đã override thủ công? Ở đây sync
                # là nguồn sự thật → đè. Nhưng giữ position nếu căn mới không có.
                existing = by_id[nu["id"]]
                if not nu.get("position") and existing.get("position"):
                    nu["position"] = existing["position"]
                existing.update(nu)
                updated += 1
            else:
                data["units"].append(nu)
                by_id[nu["id"]] = nu
                created += 1
        _save(data)
        return {"created": created, "updated": updated}


def replace_all(units: list[dict]) -> dict:
    """Thay thế toàn bộ: upsert danh sách mới + SOFT-DELETE các căn không còn
    xuất hiện trong sheet. Backup TRƯỚC khi ghi (gọi backup_now ở caller).
    Trả về {created, updated, deleted}."""
    with _LOCK:
        data = _load()
        existing = {u["id"]: u for u in data["units"]}
        new_ids = {u["id"] for u in units}
        created = updated = deleted = 0

        for nu in units:
            nu.setdefault("deleted", False)
            nu["updated_at"] = _now_iso()
            if nu["id"] in existing:
                old = existing[nu["id"]]
                if not nu.get("position") and old.get("position"):
                    nu["position"] = old["position"]
                old.update(nu)
                updated += 1
            else:
                data["units"].append(nu)
                existing[nu["id"]] = nu
                created += 1

        # Soft-delete căn cũ không còn trong sheet (giữ lịch sử, không mất data).
        for uid, u in existing.items():
            if uid not in new_ids and not u.get("deleted"):
                u["deleted"] = True
                u["updated_at"] = _now_iso()
                deleted += 1

        _save(data)
        return {"created": created, "updated": updated, "deleted": deleted}


# ---------------------------------------------------------------------------
# Lịch sử sync
# ---------------------------------------------------------------------------
def add_sync_record(record: dict, keep: int = 50) -> None:
    with _LOCK:
        data = _load()
        data["sync_history"].append(record)
        # Giữ N bản gần nhất.
        if len(data["sync_history"]) > keep:
            data["sync_history"] = data["sync_history"][-keep:]
        _save(data)


def get_sync_history(limit: int = 20) -> list[dict]:
    """Trả lịch sử sync, mới nhất TRƯỚC."""
    with _LOCK:
        hist = _load()["sync_history"]
        return list(reversed(hist[-limit:]))


def last_sync() -> Optional[dict]:
    with _LOCK:
        hist = _load()["sync_history"]
        return hist[-1] if hist else None


def clear() -> None:
    """Xoá sạch store — CHỈ dùng trong test."""
    with _LOCK:
        _save({"units": [], "sync_history": []})
