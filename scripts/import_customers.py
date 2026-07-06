"""Import danh sách khách từ file CSV/Excel vào agent-engine.

Cách dùng:
    python scripts/import_customers.py <file_path> \\
        --project "Happy Home Thanh Hóa" \\
        --project-slug happy-home-thanh-hoa \\
        --source "Quảng cáo Facebook" \\
        [--api-url http://localhost:8000] \\
        [--dry-run]

Script tự:
- Đọc .xlsx / .csv (auto-detect encoding)
- Map cột tiếng Việt linh hoạt (có/không dấu/tiếng Anh)
- Chuẩn hoá SĐT VN (xử lý case Excel mất số 0 đầu, +84 → 0…)
- Bỏ dòng trống / thiếu cả phone lẫn email
- POST từng lead lên API; backend tự dedupe theo phone/email
- In báo cáo cuối: tổng / import mới / cập nhật / bỏ qua kèm lý do

Yêu cầu: openpyxl, pandas, requests (cài qua pip nếu thiếu).
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Optional

try:
    import pandas as pd
except ImportError:
    sys.exit("Thiếu pandas — chạy: pip install pandas openpyxl requests")

try:
    import requests
except ImportError:
    sys.exit("Thiếu requests — chạy: pip install requests")


# ---------- Mapping cột linh hoạt ----------

# Mỗi field → các tên cột có thể gặp (đã normalize: lowercase, bỏ dấu, bỏ space)
COLUMN_ALIASES: dict[str, list[str]] = {
    "full_name": [
        "tenkh", "tenkhachhang", "ten", "hovaten", "hoten",
        "fullname", "name", "customer", "customername",
    ],
    "phone": [
        "sdt", "sodienthoai", "dienthoai", "phone", "phonenumber",
        "mobile", "tel", "sdt1",
    ],
    "phone_alt": [
        "sdtquet", "sdt2", "phone2", "altphone",
    ],
    "email": [
        "email", "mail", "diachiemail",
    ],
    "facebook_url": [
        "linkfacebook", "facebook", "fb", "fburl", "linkfb",
    ],
    "notes": [
        "ghichu", "note", "notes", "comment", "remark",
    ],
}


def _normalize_col(name: str) -> str:
    """'TÊN KH' → 'tenkh'."""
    s = str(name).strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    # Sau khi bỏ dấu: 'đ' → 'd'
    s = s.replace("đ", "d")
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def build_column_map(df_columns: list[str]) -> dict[str, str]:
    """Trả về {field_name: actual_column_name_in_df}."""
    normalized = {_normalize_col(c): c for c in df_columns}
    mapping: dict[str, str] = {}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                mapping[field] = normalized[alias]
                break
    return mapping


# ---------- Chuẩn hoá SĐT VN ----------

VN_MOBILE_PREFIXES = {
    "032", "033", "034", "035", "036", "037", "038", "039",  # Viettel
    "070", "076", "077", "078", "079",  # Mobifone
    "081", "082", "083", "084", "085", "088",  # Vinaphone
    "086", "096", "097", "098",  # Viettel
    "089", "090", "093",  # Mobifone
    "091", "094",  # Vinaphone
    "092", "056", "058",  # Vietnamobile
    "099", "059",  # Gmobile
}


def normalize_phone_vn(raw: Any) -> Optional[str]:
    """Chuẩn hoá SĐT VN. Trả về '0xxxxxxxxx' (10 chữ số) hoặc None nếu không hợp lệ.

    Xử lý các case thường gặp:
    - Excel lưu số → '912345678.0' (mất 0 đầu, dính .0)
    - '+84 912 345 678', '0084-912.345.678'
    - Người nhập có dấu chấm, gạch, space
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in {"nan", "none", "không có", "khong co", "n/a", "-"}:
        return None

    # Loại '.0' cuối nếu là dạng float string
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]

    # Giữ chữ số và dấu '+'
    s = re.sub(r"[^\d+]", "", s)
    if not s:
        return None

    # Đổi '+84' / '0084' / '84' (khi đứng đầu) → '0'
    if s.startswith("+84"):
        s = "0" + s[3:]
    elif s.startswith("0084"):
        s = "0" + s[4:]
    elif s.startswith("84") and len(s) >= 11:
        s = "0" + s[2:]

    # Excel mất số 0 đầu: '912345678' (9 chữ số bắt đầu bằng 3/5/7/8/9) → '0912345678'
    if len(s) == 9 and s[0] in "3578925670":
        s = "0" + s

    # Phải đúng 10 chữ số bắt đầu bằng 0
    if not (len(s) == 10 and s.startswith("0") and s.isdigit()):
        return None

    prefix = s[:3]
    if prefix not in VN_MOBILE_PREFIXES:
        # Vẫn chấp nhận số cố định 02x (ít gặp với BĐS) — bỏ qua để chắc chắn là di động
        return None

    return s


def normalize_text(raw: Any) -> Optional[str]:
    """Strip + bỏ giá trị rác."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in {"nan", "none", "không có", "khong co", "n/a", "-"}:
        return None
    return s


# ---------- Main ----------

def read_table(path: Path) -> pd.DataFrame:
    """Đọc .xlsx hoặc .csv với detect encoding cơ bản."""
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xlsm"}:
        return pd.read_excel(path, dtype=object)
    if suffix == ".csv":
        for enc in ("utf-8-sig", "utf-8", "cp1258", "latin-1"):
            try:
                return pd.read_csv(path, dtype=object, encoding=enc)
            except UnicodeDecodeError:
                continue
        sys.exit(f"Không decode được file CSV với UTF-8/CP1258/Latin-1: {path}")
    sys.exit(f"Định dạng chưa hỗ trợ: {suffix}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import lead từ CSV/Excel vào agent-engine")
    parser.add_argument("file", type=Path, help="Đường dẫn file .xlsx / .csv")
    parser.add_argument("--project", required=True, help='Tên hiển thị, vd "Happy Home Thanh Hóa"')
    parser.add_argument("--project-slug", required=True, help='Slug, vd "happy-home-thanh-hoa"')
    parser.add_argument("--source", default="import", help='Nguồn lead, vd "Quảng cáo Facebook"')
    parser.add_argument("--api-url", default="http://localhost:8000", help="URL agent-engine")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ in báo cáo, không POST")
    args = parser.parse_args()

    if not args.file.exists():
        sys.exit(f"File không tồn tại: {args.file}")

    print(f"📂 Đọc file: {args.file}")
    df = read_table(args.file)
    print(f"   → {len(df)} dòng x {len(df.columns)} cột")

    col_map = build_column_map(list(df.columns))
    print(f"\n🔗 Map cột phát hiện được:")
    for field, col in col_map.items():
        print(f"   {field:<13} ← {col!r}")
    missing_essential = [f for f in ("full_name", "phone") if f not in col_map]
    if "phone" not in col_map and "phone_alt" not in col_map and "email" not in col_map:
        sys.exit("⚠️  File không có cột nào nhận diện được là SĐT hoặc Email — dừng.")
    if missing_essential:
        print(f"   ⚠️  Thiếu cột nhận diện được: {missing_essential} — vẫn tiếp tục.")

    # ---------- Health-check API trước ----------
    if not args.dry_run:
        try:
            r = requests.get(f"{args.api_url}/health", timeout=5)
            r.raise_for_status()
            print(f"\n✅ Agent-engine sẵn sàng: {r.json().get('status')} ({r.json().get('llm_mode')})")
        except Exception as e:
            sys.exit(f"❌ Không gọi được {args.api_url}/health — {e}\n   Khởi động backend trước.")

    # ---------- Duyệt dòng ----------
    stats = {
        "total_rows": len(df),
        "skipped_blank": 0,
        "skipped_no_contact": 0,
        "skipped_invalid_phone": 0,
        "imported_new": 0,
        "updated_existing": 0,
        "api_errors": 0,
    }
    samples_imported: list[dict] = []

    for idx, row in df.iterrows():
        full_name = normalize_text(row.get(col_map.get("full_name"))) if col_map.get("full_name") else None
        raw_phone = row.get(col_map.get("phone")) if col_map.get("phone") else None
        raw_phone_alt = row.get(col_map.get("phone_alt")) if col_map.get("phone_alt") else None
        raw_email = normalize_text(row.get(col_map.get("email"))) if col_map.get("email") else None
        fb = normalize_text(row.get(col_map.get("facebook_url"))) if col_map.get("facebook_url") else None
        notes = normalize_text(row.get(col_map.get("notes"))) if col_map.get("notes") else None

        # Dòng trống hoàn toàn
        if not any([full_name, raw_phone, raw_phone_alt, raw_email, fb, notes]):
            stats["skipped_blank"] += 1
            continue

        phone = normalize_phone_vn(raw_phone) or normalize_phone_vn(raw_phone_alt)

        # Phải có ít nhất phone hoặc email
        if not phone and not raw_email:
            if raw_phone or raw_phone_alt:
                stats["skipped_invalid_phone"] += 1
            else:
                stats["skipped_no_contact"] += 1
            continue

        payload = {
            "full_name": full_name,
            "phone": phone,
            "email": raw_email,
            "source_channel": args.source,
            "project": args.project,
            "project_slug": args.project_slug,
            "facebook_url": fb,
            "notes": notes,
        }
        # Bỏ None để payload gọn
        payload = {k: v for k, v in payload.items() if v is not None}

        if args.dry_run:
            stats["imported_new"] += 1
            if len(samples_imported) < 3:
                samples_imported.append(payload)
            continue

        try:
            r = requests.post(f"{args.api_url}/leads", json=payload, timeout=10)
            if r.status_code == 201:
                stats["imported_new"] += 1
                if len(samples_imported) < 3:
                    samples_imported.append(r.json())
            elif r.status_code == 200:
                stats["updated_existing"] += 1
                if len(samples_imported) < 3:
                    samples_imported.append(r.json())
            else:
                stats["api_errors"] += 1
                if stats["api_errors"] <= 3:
                    print(f"   ⚠️  API trả {r.status_code} cho dòng {idx}: {r.text[:120]}")
        except Exception as e:
            stats["api_errors"] += 1
            if stats["api_errors"] <= 3:
                print(f"   ⚠️  Lỗi mạng dòng {idx}: {e}")

    # ---------- Báo cáo ----------
    print("\n" + "=" * 60)
    print("📊 BÁO CÁO IMPORT")
    print("=" * 60)
    print(f"  Tổng dòng đọc được:           {stats['total_rows']}")
    print(f"  Bỏ qua (dòng trống):          {stats['skipped_blank']}")
    print(f"  Bỏ qua (không có liên hệ):    {stats['skipped_no_contact']}")
    print(f"  Bỏ qua (SĐT không hợp lệ):    {stats['skipped_invalid_phone']}")
    print(f"  ✅ Import mới:                 {stats['imported_new']}")
    print(f"  🔄 Cập nhật lead đã có:        {stats['updated_existing']}")
    print(f"  ❌ Lỗi API:                    {stats['api_errors']}")
    print(f"  Gắn vào dự án:                {args.project!r} (slug: {args.project_slug!r})")
    if args.dry_run:
        print(f"\n  ⚠️  DRY-RUN — không thật sự gọi API.")

    if samples_imported:
        print(f"\n📋 Mẫu {len(samples_imported)} lead đầu (PII đã mask):")
        for s in samples_imported:
            name = s.get("full_name") or "(không tên)"
            name_m = " ".join(w[0] + "*" * (len(w) - 1) if len(w) > 1 else w for w in name.split())
            ph = s.get("phone") or ""
            ph_m = ph[:4] + "*" * (len(ph) - 6) + ph[-2:] if len(ph) >= 6 else ph
            print(f"   • {name_m} | {ph_m} | project={s.get('project')}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
