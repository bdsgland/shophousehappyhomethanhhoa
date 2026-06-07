"""Backup Postgres → nén gzip → upload Cloudflare R2 (S3-compatible).

Hai chế độ dump, tự chọn:
  1. `pg_dump` (ưu tiên, fidelity đầy đủ) nếu binary có sẵn trong PATH.
  2. Fallback: export logic toàn bộ bảng ra JSON qua SQLAlchemy (chạy mọi nơi,
     không cần postgresql-client) — đủ để khôi phục dữ liệu.

Upload R2 chỉ chạy khi đủ biến môi trường; nếu thiếu → giữ file local + báo log
(không coi là lỗi). Dùng cho Railway Cron / n8n chạy hằng đêm.

Biến môi trường:
  DATABASE_URL            (bắt buộc) — chuỗi kết nối Postgres
  R2_ACCOUNT_ID           — Cloudflare account id (để dựng endpoint)
  R2_ENDPOINT             — (tuỳ chọn) ghi đè endpoint, vd https://<acc>.r2.cloudflarestorage.com
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET               — tên bucket (vd elc-db-backups)
  R2_PREFIX               — (tuỳ chọn) thư mục trong bucket, mặc định 'agent-engine'
  BACKUP_DIR              — (tuỳ chọn) thư mục lưu local, mặc định /tmp

Chạy:
  python -m app.scripts.backup_db
  python -m app.scripts.backup_db --stamp 2026-06-07T02-00-00   # đặt tên cố định
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


def _database_url() -> str:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        sys.exit("Thiếu DATABASE_URL — không thể backup.")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def _dump_with_pg_dump(url: str, out_path: Path) -> bool:
    """Dump bằng pg_dump (định dạng plain SQL, nén gzip). True nếu thành công."""
    if shutil.which("pg_dump") is None:
        return False
    print("[BACKUP] Dùng pg_dump …")
    with gzip.open(out_path, "wb") as gz:
        proc = subprocess.Popen(
            ["pg_dump", "--no-owner", "--no-acl", url],
            stdout=subprocess.PIPE,
        )
        assert proc.stdout is not None
        shutil.copyfileobj(proc.stdout, gz)
        proc.wait()
    if proc.returncode != 0:
        print(f"[BACKUP] pg_dump trả mã lỗi {proc.returncode} → thử fallback.")
        out_path.unlink(missing_ok=True)
        return False
    return True


def _dump_logical_json(url: str, out_path: Path) -> bool:
    """Fallback: export toàn bộ bảng ra JSON (qua SQLAlchemy reflect)."""
    print("[BACKUP] pg_dump không có — export logic JSON qua SQLAlchemy …")
    from sqlalchemy import create_engine, inspect, select, Table, MetaData

    drv = url
    if drv.startswith("postgresql://"):
        drv = "postgresql+psycopg2://" + drv[len("postgresql://") :]
    engine = create_engine(drv, future=True)
    meta = MetaData()
    payload: dict = {"_dumped_at": datetime.utcnow().isoformat() + "Z", "tables": {}}
    with engine.connect() as conn:
        insp = inspect(conn)
        for tname in insp.get_table_names():
            tbl = Table(tname, meta, autoload_with=conn)
            rows = []
            for row in conn.execute(select(tbl)).mappings():
                rows.append({k: _jsonable(v) for k, v in row.items()})
            payload["tables"][tname] = rows
    with gzip.open(out_path, "wt", encoding="utf-8") as gz:
        json.dump(payload, gz, ensure_ascii=False, default=str)
    return True


def _jsonable(v):
    if isinstance(v, datetime):
        return v.isoformat() + "Z"
    from decimal import Decimal

    if isinstance(v, Decimal):
        return float(v)
    return v


def _upload_r2(local: Path) -> Optional[str]:
    """Upload lên R2 nếu đủ env. Trả về key đã upload, None nếu bỏ qua/không cấu hình."""
    bucket = os.getenv("R2_BUCKET")
    access = os.getenv("R2_ACCESS_KEY_ID")
    secret = os.getenv("R2_SECRET_ACCESS_KEY")
    endpoint = os.getenv("R2_ENDPOINT")
    account = os.getenv("R2_ACCOUNT_ID")
    if not endpoint and account:
        endpoint = f"https://{account}.r2.cloudflarestorage.com"
    if not (bucket and access and secret and endpoint):
        print("[BACKUP] Chưa cấu hình R2 đầy đủ → giữ file local, bỏ qua upload.")
        return None
    try:
        import boto3
    except ImportError:
        print("[BACKUP] Thiếu boto3 → không upload được (pip install boto3).")
        return None

    prefix = (os.getenv("R2_PREFIX") or "agent-engine").strip("/")
    key = f"{prefix}/{local.name}"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        region_name="auto",
    )
    client.upload_file(str(local), bucket, key)
    print(f"[BACKUP] Đã upload R2: s3://{bucket}/{key}")
    return key


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Backup Postgres → R2.")
    ap.add_argument("--stamp", default=None, help="Hậu tố tên file (mặc định UTC now).")
    ap.add_argument(
        "--keep-local",
        action="store_true",
        help="Giữ file local sau khi upload (mặc định xoá nếu upload OK).",
    )
    args = ap.parse_args(argv)

    url = _database_url()
    stamp = args.stamp or datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    backup_dir = Path(os.getenv("BACKUP_DIR", "/tmp"))
    backup_dir.mkdir(parents=True, exist_ok=True)

    sql_path = backup_dir / f"agent-engine-{stamp}.sql.gz"
    if _dump_with_pg_dump(url, sql_path):
        out = sql_path
    else:
        out = backup_dir / f"agent-engine-{stamp}.json.gz"
        _dump_logical_json(url, out)

    size_kb = out.stat().st_size / 1024
    print(f"[BACKUP] Tạo dump: {out} ({size_kb:.1f} KB)")

    uploaded = _upload_r2(out)
    if uploaded and not args.keep_local:
        out.unlink(missing_ok=True)
        print("[BACKUP] Đã xoá file local sau upload.")
    print("[BACKUP] HOÀN TẤT.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
