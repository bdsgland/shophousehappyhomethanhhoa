"""Import khách hàng ELC từ file Excel quảng cáo vào user store.

File nguồn (PII — KHÔNG commit): cột `TÊN KH`, `SĐT`, `SĐT Quét`, `Link Facebook`.
Chỉ những dòng CÓ số điện thoại hợp lệ mới được import (đó là ~108 khách thật).

Vì file không có email, ta sinh email định danh từ SĐT: `kh-<sdt>@elc-import.local`
(placeholder — khách thật sẽ cập nhật email khi đăng ký). Khử trùng lặp theo cả
SĐT lẫn email so với user đang có.

Ghi qua `user_store.create_user` → tự động dual-write sang Postgres nếu đang bật.

Chạy (từ apps/agent-engine, đã activate venv):
    python -m app.scripts.import_customers --dry-run        # xem trước, không ghi
    python -m app.scripts.import_customers                  # import thật
    python -m app.scripts.import_customers --file /path/to.xlsx --sheet "Trang tính1"

Trên Railway (sau khi upload file lên volume /app/data):
    python -m app.scripts.import_customers --file /app/data/sheet-data-quang-cao-elc.xlsx
"""

from __future__ import annotations

import argparse
import re
import secrets
import string
import sys
from pathlib import Path
from typing import Optional

DEFAULT_FILE = (
    "data/customers/eurowindow-light-city/sheet-data-quang-cao-elc.xlsx"
)
DEFAULT_SOURCE = "ELC Quảng cáo"
EMAIL_DOMAIN = "elc-import.local"

# Tên cột trong file (linh hoạt: chấp nhận vài biến thể hay gặp).
COL_NAME = ["TÊN KH", "Tên KH", "TEN KH", "Họ tên", "Name"]
COL_PHONE = ["SĐT", "SDT", "Số điện thoại", "Phone"]
COL_PHONE_ALT = ["SĐT Quét", "SDT Quet", "Số điện thoại quét"]
COL_FACEBOOK = ["Link Facebook", "Facebook", "FB", "Link FB"]

_NO_VALUE = {"", "không có", "khong co", "n/a", "na", "none", "nan"}


def _pick_col(columns, candidates) -> Optional[str]:
    norm = {str(c).strip().lower(): c for c in columns}
    for cand in candidates:
        if cand.strip().lower() in norm:
            return norm[cand.strip().lower()]
    return None


def normalize_phone(value) -> Optional[str]:
    """Chuẩn hoá SĐT VN: bỏ ký tự lạ, thêm '0' đầu nếu thiếu. None nếu không hợp lệ."""
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in _NO_VALUE:
        return None
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    # pandas đôi khi đọc thành float '326599796.0' → đã bỏ '.' ở trên.
    if not digits.startswith("0"):
        digits = "0" + digits
    # SĐT VN hợp lệ thường 10 số (đôi khi 11). Lọc rác quá ngắn/quá dài.
    if not (9 <= len(digits) <= 12):
        return None
    return digits


def _gen_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(16))


def _read_rows(file_path: str, sheet: Optional[str]):
    try:
        import pandas as pd
    except ImportError:
        sys.exit("Thiếu pandas/openpyxl — chạy: pip install -r requirements.txt")

    p = Path(file_path)
    if not p.exists():
        sys.exit(
            f"KHÔNG tìm thấy file Excel: {p}\n"
            "→ Kiểm tra lại đường dẫn (hoặc upload file lên Railway volume)."
        )

    xl = pd.ExcelFile(p)
    sheet_name = sheet or xl.sheet_names[0]
    df = pd.read_excel(p, sheet_name=sheet_name, header=0)
    cols = list(df.columns)

    c_name = _pick_col(cols, COL_NAME)
    c_phone = _pick_col(cols, COL_PHONE)
    c_phone_alt = _pick_col(cols, COL_PHONE_ALT)
    c_fb = _pick_col(cols, COL_FACEBOOK)
    if c_name is None or c_phone is None:
        sys.exit(
            f"File thiếu cột bắt buộc. Cột tìm thấy: {cols}\n"
            f"Cần có cột tên ({COL_NAME}) và SĐT ({COL_PHONE})."
        )

    import pandas as pd  # noqa: F811 — dùng pd.isna

    rows = []
    for _, r in df.iterrows():
        name = r.get(c_name)
        name = str(name).strip() if not pd.isna(name) else ""
        phone = normalize_phone(r.get(c_phone))
        if not phone and c_phone_alt is not None:
            phone = normalize_phone(r.get(c_phone_alt))
        fb = r.get(c_fb) if c_fb is not None else None
        fb = str(fb).strip() if (fb is not None and not pd.isna(fb)) else None
        if fb and fb.lower() in _NO_VALUE:
            fb = None
        rows.append({"name": name, "phone": phone, "facebook": fb})
    return rows, sheet_name


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Import khách hàng ELC từ Excel.")
    ap.add_argument("--file", default=DEFAULT_FILE, help="Đường dẫn file Excel.")
    ap.add_argument("--sheet", default=None, help="Tên sheet (mặc định sheet đầu).")
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="Gắn nhãn nguồn data.")
    ap.add_argument(
        "--dry-run", action="store_true", help="Chỉ xem trước, KHÔNG ghi dữ liệu."
    )
    args = ap.parse_args(argv)

    # Import muộn để --help không cần kéo cả app/settings.
    from app.core import user_store
    from app.core.security import hash_password

    rows, sheet_name = _read_rows(args.file, args.sheet)

    existing = user_store.list_users()
    existing_emails = {u["email"].lower() for u in existing}
    existing_phones = {
        re.sub(r"\D", "", str(u.get("phone") or "")) for u in existing if u.get("phone")
    }

    total = len(rows)
    candidates = [r for r in rows if r["phone"]]
    print(
        f"File: {args.file} | sheet: {sheet_name}\n"
        f"Tổng dòng: {total} | có SĐT hợp lệ: {len(candidates)} | "
        f"dry-run: {args.dry_run}"
    )

    imported = skipped_dup = skipped_no_phone = errors = 0
    seen_phones: set[str] = set()
    for r in rows:
        phone = r["phone"]
        if not phone:
            skipped_no_phone += 1
            continue
        if phone in existing_phones or phone in seen_phones:
            skipped_dup += 1
            continue
        seen_phones.add(phone)
        email = f"kh-{phone}@{EMAIL_DOMAIN}"
        if email.lower() in existing_emails:
            skipped_dup += 1
            continue
        name = r["name"] or f"Khách {phone[-4:]}"
        if args.dry_run:
            imported += 1
            continue
        try:
            user_store.create_user(
                email=email,
                full_name=name,
                password_hash=hash_password(_gen_password()),
                phone=phone,
                role="client",
                source=args.source,
                facebook_url=r["facebook"],
            )
            imported += 1
        except ValueError:
            skipped_dup += 1
        except Exception as e:  # noqa: BLE001
            errors += 1
            print(f"  ! Lỗi dòng {name} / {phone}: {type(e).__name__}: {e}")

    verb = "SẼ import" if args.dry_run else "Đã import"
    print(
        "\n=== KẾT QUẢ ===\n"
        f"{verb}: {imported}\n"
        f"Bỏ qua (trùng SĐT/email): {skipped_dup}\n"
        f"Bỏ qua (không có SĐT): {skipped_no_phone}\n"
        f"Lỗi: {errors}\n"
        f"Tổng user sau import: {len(user_store.list_users())}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
