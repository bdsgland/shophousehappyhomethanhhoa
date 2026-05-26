#!/usr/bin/env python3
"""Giải nén CHỈ tài liệu văn bản từ các file zip Eurowindow Light City.

- Đọc tất cả ~/Downloads/Eurowindow Light City-*.zip
- Chỉ trích các file có đuôi: pdf, doc, docx, xls, xlsx, ppt, pptx, txt
- Xử lý tên file tiếng Việt (UTF-8 chuẩn của zip, fallback cp437->utf-8 cho zip cũ)
- Giữ nguyên cấu trúc thư mục bên trong zip
- Idempotent: bỏ qua file đã tồn tại có cùng kích thước
"""
from __future__ import annotations

import os
import sys
import zipfile
from pathlib import Path

HOME = Path.home()
SRC_DIR = HOME / "Downloads"
DST_DIR = Path("/Users/phamvanthu/Documents/Agent-Proptech/data/projects/eurowindow-light-city")
DOC_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"}
ZIP_GLOB = "Eurowindow Light City-*.zip"


def decode_zip_name(info: zipfile.ZipInfo) -> str:
    """Giải mã đúng tên file tiếng Việt trong zip."""
    # Bit 0x800: tên file đã ở UTF-8 (chuẩn ZIP hiện đại)
    if info.flag_bits & 0x800:
        return info.filename
    # Ngược lại: zipfile đã decode bằng cp437 -> encode lại rồi decode utf-8
    try:
        return info.filename.encode("cp437").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Thử cp1258 (mã Việt Windows) như fallback cuối
        try:
            return info.filename.encode("cp437").decode("cp1258")
        except Exception:
            return info.filename


def safe_join(base: Path, rel: str) -> Path | None:
    """Tránh zip-slip: chỉ cho phép đường dẫn nằm trong base."""
    # Chuẩn hoá: bỏ ký tự nguy hiểm, đảm bảo dùng separator của OS
    rel = rel.replace("\\", "/").lstrip("/")
    candidate = (base / rel).resolve()
    try:
        candidate.relative_to(base.resolve())
    except ValueError:
        return None
    return candidate


def extract_one_zip(zpath: Path, dst: Path) -> tuple[int, int, int]:
    """Trả về (số file đã lấy, số file bỏ qua vì đã tồn tại, tổng bytes lấy)."""
    extracted = skipped = total_bytes = 0
    with zipfile.ZipFile(zpath) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = decode_zip_name(info)
            ext = os.path.splitext(name)[1].lower()
            if ext not in DOC_EXTS:
                continue
            out = safe_join(dst, name)
            if out is None:
                print(f"  ! BỎ (zip-slip): {name}", file=sys.stderr)
                continue
            if out.exists() and out.stat().st_size == info.file_size:
                skipped += 1
                continue
            out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(out, "wb") as dstf:
                while chunk := src.read(1024 * 1024):
                    dstf.write(chunk)
            extracted += 1
            total_bytes += info.file_size
            print(f"  + {name}  ({info.file_size:,} B)")
    return extracted, skipped, total_bytes


def main() -> int:
    DST_DIR.mkdir(parents=True, exist_ok=True)
    zips = sorted(SRC_DIR.glob(ZIP_GLOB))
    if not zips:
        print(f"Không tìm thấy zip nào khớp {ZIP_GLOB} trong {SRC_DIR}", file=sys.stderr)
        return 1
    print(f"Tìm thấy {len(zips)} file zip. Đích: {DST_DIR}\n")
    grand_ex = grand_sk = grand_bytes = 0
    for i, z in enumerate(zips, 1):
        print(f"[{i}/{len(zips)}] {z.name}")
        try:
            ex, sk, bts = extract_one_zip(z, DST_DIR)
        except zipfile.BadZipFile as e:
            print(f"  ! ZIP HỎNG: {e}", file=sys.stderr)
            continue
        grand_ex += ex
        grand_sk += sk
        grand_bytes += bts
        print(f"  -> Lấy {ex}, bỏ qua {sk} (đã có)")
    print("\n===== TỔNG =====")
    print(f"Tài liệu đã lấy:    {grand_ex}")
    print(f"Đã có sẵn (bỏ qua): {grand_sk}")
    print(f"Tổng dung lượng:    {grand_bytes:,} B  (~{grand_bytes/1024/1024:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
