"""Kho tài liệu Sale Learning Center — lưu file + metadata + index BM25 runtime.

Tách biệt với knowledge base dự án (data/knowledge_base/<slug>) vốn build offline.
Ở đây tài liệu được admin upload lúc chạy, nên ta tự quản lý:

    <LEARNING_DIR>/
        index.json         — metadata tài liệu + bản ghi phiếu báo giá
        files/<id>.<ext>   — file gốc đã upload
        quotes/<id>.pdf    — phiếu báo giá đã sinh
        bm25.pkl           — BM25Okapi đã fit trên toàn bộ chunk
        chunks.jsonl       — 1 chunk/dòng + metadata (document_id, title…)

LEARNING_DIR resolve theo thứ tự: settings.learning_dir (tuyệt đối) → $DATA_DIR
(Railway volume) → neo theo thư mục `agent-engine` → cwd. Cùng chiến lược với
core/user_store.py để bền vững giữa local và container.

Tất cả thao tác ghi đều dưới 1 lock tiến trình (MVP, single-process). BM25 được
build lại toàn bộ mỗi lần thêm/xoá tài liệu — chấp nhận được ở quy mô thư viện
nội bộ (vài trăm chunk).
"""

from __future__ import annotations

import json
import logging
import os
import pickle
import threading
import uuid
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core import extract
from app.core.settings import settings

log = logging.getLogger(__name__)

_LOCK = threading.RLock()


# ============================================================
# Resolve thư mục lưu trữ
# ============================================================

def _base_dir() -> Path:
    p = Path(settings.learning_dir)
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


def _ensure_dirs() -> Path:
    base = _base_dir()
    (base / "files").mkdir(parents=True, exist_ok=True)
    (base / "quotes").mkdir(parents=True, exist_ok=True)
    return base


def _index_path() -> Path:
    return _base_dir() / "index.json"


def _bm25_path() -> Path:
    return _base_dir() / "bm25.pkl"


def _chunks_path() -> Path:
    return _base_dir() / "chunks.jsonl"


# ============================================================
# Đọc/ghi metadata (index.json)
# ============================================================

def _load_meta() -> dict:
    path = _index_path()
    if not path.exists():
        return {"documents": [], "quotes": []}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:  # noqa: BLE001
        log.error("Hỏng index.json (%s) — khởi tạo lại rỗng", e)
        return {"documents": [], "quotes": []}
    data.setdefault("documents", [])
    data.setdefault("quotes", [])
    return data


def _save_meta(data: dict) -> None:
    _ensure_dirs()
    path = _index_path()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


# ============================================================
# Build / load BM25
# ============================================================

def _rebuild_index(documents: list[dict]) -> None:
    """Trích text mọi tài liệu → chunk → ghi chunks.jsonl + build BM25.

    Mỗi tài liệu luôn có ít nhất 1 "chunk tiêu đề" để tìm được theo tên kể cả
    khi không trích được text (vd ảnh chưa OCR).
    """
    base = _ensure_dirs()
    all_chunks: list[dict] = []
    for doc in documents:
        fpath = base / doc["file_path"]
        title = doc.get("title", "")
        # Chunk tiêu đề (giúp tìm theo tên + nhóm).
        all_chunks.append(
            {
                "document_id": doc["id"],
                "title": title,
                "category": doc.get("category", ""),
                "source_file": doc.get("original_name", title),
                "chunk_index": -1,
                "text": f"{title} ({doc.get('category', '')})",
            }
        )
        if not fpath.exists():
            continue
        res = extract.extract(fpath)
        if not res.text.strip():
            continue
        for ci, ch in enumerate(extract.split_into_chunks(res.text)):
            all_chunks.append(
                {
                    "document_id": doc["id"],
                    "title": title,
                    "category": doc.get("category", ""),
                    "source_file": doc.get("original_name", title),
                    "chunk_index": ci,
                    "text": ch,
                }
            )

    with _chunks_path().open("w", encoding="utf-8") as f:
        for c in all_chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    if all_chunks:
        from rank_bm25 import BM25Okapi

        corpus_tokens = [extract.tokenize(c["text"]) for c in all_chunks]
        bm25 = BM25Okapi(corpus_tokens)
        with _bm25_path().open("wb") as f:
            pickle.dump({"bm25": bm25}, f)
    else:
        # Không còn tài liệu — xoá index cũ nếu có.
        for p in (_bm25_path(), _chunks_path()):
            if p.exists():
                p.unlink()

    # Cập nhật số chunk thực tế cho từng tài liệu (trừ chunk tiêu đề).
    counts: dict[str, int] = {}
    for c in all_chunks:
        if c["chunk_index"] >= 0:
            counts[c["document_id"]] = counts.get(c["document_id"], 0) + 1
    for doc in documents:
        doc["chunks"] = counts.get(doc["id"], 0)
        doc["indexed"] = True
        doc["indexed_at"] = doc.get("indexed_at") or _now_iso()

    log.info("RAG learning: build %d chunk từ %d tài liệu", len(all_chunks), len(documents))


@dataclass
class _LoadedIndex:
    bm25: object
    chunks: list[dict]


_index_cache: Optional[_LoadedIndex] = None
_cache_stamp: float = -1.0


def _load_index() -> Optional[_LoadedIndex]:
    """Load BM25 + chunks vào RAM, cache theo mtime của bm25.pkl."""
    global _index_cache, _cache_stamp
    bp, cp = _bm25_path(), _chunks_path()
    if not bp.exists() or not cp.exists():
        _index_cache = None
        return None
    stamp = bp.stat().st_mtime
    if _index_cache is not None and stamp == _cache_stamp:
        return _index_cache
    with cp.open("r", encoding="utf-8") as f:
        chunks = [json.loads(line) for line in f if line.strip()]
    with bp.open("rb") as f:
        bm25 = pickle.load(f)["bm25"]
    _index_cache = _LoadedIndex(bm25=bm25, chunks=chunks)
    _cache_stamp = stamp
    return _index_cache


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ============================================================
# API public — tài liệu
# ============================================================

def list_documents(category: Optional[str] = None) -> list[dict]:
    with _LOCK:
        docs = _load_meta()["documents"]
    if category:
        docs = [d for d in docs if d.get("category") == category]
    return sorted(docs, key=lambda d: d.get("created_at", ""), reverse=True)


def get_document(doc_id: str) -> Optional[dict]:
    with _LOCK:
        for d in _load_meta()["documents"]:
            if d["id"] == doc_id:
                return d
    return None


def file_abspath(doc: dict) -> Path:
    return _base_dir() / doc["file_path"]


def add_document(
    *,
    content: bytes,
    original_name: str,
    title: str,
    category: str,
    uploaded_by: Optional[str] = None,
) -> dict:
    """Lưu file, ghi metadata, build lại index BM25. Trả về metadata tài liệu."""
    ext = Path(original_name).suffix.lower()
    if ext not in extract.SUPPORTED_EXTS:
        raise ValueError(f"Định dạng không hỗ trợ: {ext or '(không rõ)'}")
    doc_id = str(uuid.uuid4())
    rel_path = f"files/{doc_id}{ext}"
    with _LOCK:
        base = _ensure_dirs()
        (base / rel_path).write_bytes(content)
        data = _load_meta()
        doc = {
            "id": doc_id,
            "title": title.strip() or Path(original_name).stem,
            "category": category,
            "type": ext.lstrip("."),
            "size": len(content),
            "file_path": rel_path,
            "original_name": original_name,
            "version": 1,
            "chunks": 0,
            "indexed": False,
            "indexed_at": None,
            "uploaded_by": uploaded_by,
            "created_at": _now_iso(),
        }
        data["documents"].append(doc)
        # Re-index toàn bộ (cập nhật chunks/indexed/indexed_at in-place).
        _rebuild_index(data["documents"])
        _save_meta(data)
    return doc


def delete_document(doc_id: str) -> bool:
    with _LOCK:
        data = _load_meta()
        docs = data["documents"]
        target = next((d for d in docs if d["id"] == doc_id), None)
        if not target:
            return False
        fpath = _base_dir() / target["file_path"]
        if fpath.exists():
            try:
                fpath.unlink()
            except OSError as e:  # noqa: PERF203
                log.warning("Không xoá được file %s: %s", fpath, e)
        data["documents"] = [d for d in docs if d["id"] != doc_id]
        _rebuild_index(data["documents"])
        _save_meta(data)
    return True


# ============================================================
# API public — tìm kiếm RAG
# ============================================================

@dataclass
class SearchHit:
    document_id: str
    title: str
    category: str
    source_file: str
    chunk_index: int
    score: float
    text: str


def search(query: str, top_k: int = 5, category: Optional[str] = None) -> list[SearchHit]:
    idx = _load_index()
    if idx is None:
        return []
    tokens = extract.tokenize(query)
    if not tokens:
        return []
    scores = idx.bm25.get_scores(tokens)
    qset = set(tokens)

    # Cổng "literal overlap": chỉ nhận đoạn có ÍT NHẤT 1 token truy vấn xuất hiện.
    # Lý do: BM25Okapi suy biến khi corpus rất nhỏ (vd df=1, N=2 → idf=0 → score=0),
    # khiến lọc theo score>0 bỏ sót. Xếp hạng chính theo score, phụ theo overlap.
    candidates: list[tuple[int, float, int]] = []
    for i, ch in enumerate(idx.chunks):
        if category and ch.get("category") != category:
            continue
        overlap = sum(1 for t in qset if t in set(extract.tokenize(ch["text"])))
        if overlap == 0 and scores[i] <= 0:
            continue
        candidates.append((i, float(scores[i]), overlap))

    candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)
    out: list[SearchHit] = []
    for i, score, _ov in candidates[:top_k]:
        ch = idx.chunks[i]
        out.append(
            SearchHit(
                document_id=ch["document_id"],
                title=ch.get("title", ""),
                category=ch.get("category", ""),
                source_file=ch.get("source_file", ""),
                chunk_index=ch.get("chunk_index", -1),
                score=score,
                text=ch["text"],
            )
        )
    return out


# ============================================================
# API public — phiếu báo giá (chỉ lưu metadata; PDF do service sinh)
# ============================================================

def quote_abspath(quote_id: str) -> Path:
    return _base_dir() / "quotes" / f"{quote_id}.pdf"


def save_quote(record: dict, pdf_bytes: bytes) -> dict:
    with _LOCK:
        _ensure_dirs()
        quote_abspath(record["quote_id"]).write_bytes(pdf_bytes)
        data = _load_meta()
        data["quotes"].append(record)
        _save_meta(data)
    return record


def get_quote(quote_id: str) -> Optional[dict]:
    with _LOCK:
        for q in _load_meta()["quotes"]:
            if q["quote_id"] == quote_id:
                return q
    return None
