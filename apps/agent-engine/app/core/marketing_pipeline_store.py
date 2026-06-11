"""Store MARKETING PIPELINE — dây chuyền sản xuất content AI nhiều giai đoạn (JSON).

File:
  data/_runtime/marketing_pipelines.json → {"pipelines": [ {pipeline dict} ]}

Mỗi PIPELINE = metadata (chủ đề/dự án/định dạng/tone/ngôn ngữ/kênh) + `stages`:
dict {stage: {status, output, result, used_llm, updated_at, error}} cho 5 giai đoạn
research → script → content → video_script → publish.

Cùng convention store JSON (thread-safe Lock, atomic write, resolve path robust,
rotate theo *_keep) với app/core/marketing_store.py. Giữ interface gọn để sau này
migrate PostgreSQL dễ swap.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from app.core.settings import settings
from app.schemas.marketing_pipeline import STAGE_ORDER

_LOCK = threading.Lock()

_ROOT = "pipelines"


# ---------------------------------------------------------------------------
# Path / IO helpers (đồng nhất marketing_store)
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


def _ensure() -> Path:
    path = _resolve(settings.marketing_pipeline_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({_ROOT: []}, ensure_ascii=False, indent=2))
    return path


def _load() -> dict:
    path = _ensure()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {_ROOT: []}
    if not isinstance(data, dict) or not isinstance(data.get(_ROOT), list):
        return {_ROOT: []}
    return data


def _save(data: dict) -> None:
    path = _ensure()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _clean_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _empty_stages() -> dict[str, dict]:
    """Khởi tạo 5 giai đoạn ở trạng thái pending."""
    return {
        stage: {
            "status": "pending",
            "output": None,
            "result": None,
            "used_llm": False,
            "updated_at": None,
            "error": None,
        }
        for stage in STAGE_ORDER
    }


_META_FIELDS = {
    "name", "topic", "project", "audience", "content_format",
    "channel", "tone", "language", "campaign_id",
}


# ---------------------------------------------------------------------------
# Pipeline CRUD
# ---------------------------------------------------------------------------

def create_pipeline(payload: dict) -> dict:
    """Tạo pipeline mới (đã validate bởi Pydantic ở endpoint)."""
    now = _now()
    pipeline = {
        "id": str(uuid.uuid4()),
        "name": (payload.get("name") or "").strip(),
        "topic": (payload.get("topic") or "").strip(),
        "project": _clean_str(payload.get("project")),
        "audience": _clean_str(payload.get("audience")),
        "content_format": payload.get("content_format") or "generic",
        "channel": payload.get("channel") or "facebook",
        "tone": _clean_str(payload.get("tone")),
        "language": payload.get("language") or "vi",
        "campaign_id": _clean_str(payload.get("campaign_id")),
        "stages": _empty_stages(),
        "created_by": _clean_str(payload.get("created_by")),
        "created_at": now,
        "updated_at": now,
    }
    with _LOCK:
        data = _load()
        data[_ROOT].append(pipeline)
        keep = max(1, int(settings.marketing_pipeline_keep))
        if len(data[_ROOT]) > keep:
            data[_ROOT].sort(key=lambda x: x.get("created_at") or "")
            data[_ROOT] = data[_ROOT][-keep:]
        _save(data)
    return pipeline


def list_pipelines(*, channel: Optional[str] = None) -> list[dict]:
    """Danh sách pipeline (mới nhất trước), lọc tuỳ chọn theo channel."""
    with _LOCK:
        data = _load()
        rows = list(data[_ROOT])
    if channel:
        rows = [p for p in rows if p.get("channel") == channel]
    rows.sort(key=lambda p: p.get("created_at") or "", reverse=True)
    return rows


def get_pipeline(pipeline_id: str) -> Optional[dict]:
    with _LOCK:
        data = _load()
        for p in data[_ROOT]:
            if p.get("id") == pipeline_id:
                return p
    return None


def update_pipeline(pipeline_id: str, fields: dict) -> Optional[dict]:
    """Cập nhật metadata hợp lệ của pipeline. None nếu không tìm thấy."""
    with _LOCK:
        data = _load()
        for p in data[_ROOT]:
            if p.get("id") != pipeline_id:
                continue
            for key, val in fields.items():
                if key not in _META_FIELDS or val is None:
                    continue
                if key in ("name", "topic"):
                    p[key] = str(val).strip()
                elif key in ("project", "audience", "tone", "campaign_id"):
                    p[key] = _clean_str(val)
                else:
                    p[key] = val
            p["updated_at"] = _now()
            _save(data)
            return p
    return None


def set_stage(
    pipeline_id: str,
    stage: str,
    *,
    status: Optional[str] = None,
    output: Optional[str] = None,
    result: Optional[dict] = None,
    used_llm: Optional[bool] = None,
    error: Optional[str] = None,
) -> Optional[dict]:
    """Cập nhật trạng thái/output 1 giai đoạn. Trả pipeline mới (None nếu thiếu)."""
    if stage not in STAGE_ORDER:
        return None
    with _LOCK:
        data = _load()
        for p in data[_ROOT]:
            if p.get("id") != pipeline_id:
                continue
            stages = p.setdefault("stages", _empty_stages())
            st = stages.setdefault(stage, {
                "status": "pending", "output": None, "result": None,
                "used_llm": False, "updated_at": None, "error": None,
            })
            if status is not None:
                st["status"] = status
            if output is not None:
                st["output"] = output
            if result is not None:
                st["result"] = result
            if used_llm is not None:
                st["used_llm"] = bool(used_llm)
            # error: gán dù None để cho phép clear (truyền "" để xoá).
            st["error"] = error or None
            st["updated_at"] = _now()
            p["updated_at"] = _now()
            _save(data)
            return p
    return None


def delete_pipeline(pipeline_id: str) -> bool:
    """Xoá hẳn 1 pipeline. True nếu đã xoá."""
    with _LOCK:
        data = _load()
        before = len(data[_ROOT])
        data[_ROOT] = [p for p in data[_ROOT] if p.get("id") != pipeline_id]
        if len(data[_ROOT]) == before:
            return False
        _save(data)
        return True


def clear() -> None:
    """Xoá toàn bộ pipelines — chỉ dùng trong test."""
    with _LOCK:
        _save({_ROOT: []})
