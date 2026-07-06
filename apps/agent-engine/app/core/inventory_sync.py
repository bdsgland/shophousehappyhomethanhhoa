"""Đồng bộ quỹ căn từ Google Sheets công khai (link share "ai có link xem được").

Luồng: admin dán link Sheets → fetch CSV → parse từng dòng → map sang unit dict
(field tiếng Việt tương thích ngược + mở rộng min-max) → ghi xuống inventory_store
(có auto-backup). Không cần API key Google: dùng endpoint export CSV công khai.

Cấu trúc sheet THẬT (Happy Home Thanh Hóa — đã đọc 2026-06-08), 112 căn liền kề
PK Mặt Trời, cột theo INDEX (header có cột trùng tên nên KHÔNG dùng DictReader):
  0  STT
  1  PHÂN KHU            -> khu          (vd "PK MẶT TRỜI")
  2  ĐƯỜNG               -> duong/phan_khu (vd "DƯƠNG QUANG" — dùng làm nhóm lọc)
  3  MÃ CĂN              -> id/lo        (vd "DQ-55")
  4  HÌNH THỨC (sở hữu)  -> hinh_thuc    (vd "LÂU DÀI")
  5  HƯỚNG               -> huong
  6  VIEW                -> view
  7  VỊ TRÍ              -> vi_tri       (GÓC / THƯỜNG) -> map loai (Lô góc / Liền kề)
  8  Diện tích TKCS (m2) -> dien_tich    (vd "96M2", "87.2")
  9  Diện tích TKCS (m2) (trùng — bỏ)
  10 GIÁ MIN (đơn giá/m2)-> don_gia_min
  11 THÀNH TIỀN          -> gia_min      (tổng tiền min, VNĐ)
  12 GIÁ MAX (đơn giá/m2)-> don_gia_max
  13 THÀNH TIỀN          -> gia_max      (tổng tiền max, VNĐ)
  14 QUỸ RA HÀNG         -> dot          (vd "ĐỢT 1")
  15 ĐÃ CỌC THIỆN CHÍ    -> (status hint: có giá trị -> "Đặt cọc")
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from typing import Optional

import httpx

from app.core import inventory_store

# --- Chỉ số cột (0-based) ---------------------------------------------------
C_STT = 0
C_KHU = 1
C_DUONG = 2
C_MACAN = 3
C_HINHTHUC = 4
C_HUONG = 5
C_VIEW = 6
C_VITRI = 7
C_DIENTICH = 8
C_DONGIA_MIN = 10
C_GIA_MIN = 11
C_DONGIA_MAX = 12
C_GIA_MAX = 13
C_DOT = 14
C_COC = 15

# === MAP CỘT GIÁ CHI TIẾT (sheet bảng hàng MỚI có N/VAT/KPBT/GT xây) ===========
# Khớp theo TÊN HEADER (không theo index) để chịu được sheet đổi vị trí cột.
# Mỗi field = danh sách "bộ token" (đã bỏ dấu, lowercase). Một cột HEADER khớp khi
# chứa ĐỦ token của ÍT NHẤT 1 bộ. Resolve theo thứ tự ưu tiên N→VAT→KPBT→GTxây,
# mỗi cột chỉ dùng 1 lần (tránh cột "niêm yết gồm VAT, KPBT" bị nhận nhầm là KPBT).
# >>> CHỈNH các bộ token dưới đây nếu header sheet thật lệch. Không khớp → để trống.
PRICE_COLUMN_TOKENS: dict[str, list[list[str]]] = {
    "gia_ny_gom_vat_kpbt": [
        ["tgt niem yet"], ["niem yet", "vat", "kpbt"], ["niem yet", "bao tri"],
        ["tong gia tri niem yet"],
    ],
    "vat_hdmb": [["vat", "hdmb"], ["vat hdmb"], ["thue vat"], ["tien vat"]],
    "kpbt": [["kpbt"], ["kinh phi bao tri"], ["phi bao tri"]],
    "gt_xay_ny": [["gia tri xay"], ["gt xay"], ["xay", "ny"], ["thanh tien xay"]],
}

# Kích thước ảnh mặt bằng tổng (khớp inventory.py mock) để sinh toạ độ marker.
_MAP_W = 2001
_MAP_H = 1126
_MARGIN = 110

_SHEET_ID_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------
def extract_sheet_id(sheet_url: str) -> str:
    """Lấy sheet_id từ URL Google Sheets. Nếu truyền thẳng id thì trả nguyên."""
    m = _SHEET_ID_RE.search(sheet_url)
    if m:
        return m.group(1)
    # Có thể user dán thẳng id.
    if re.fullmatch(r"[a-zA-Z0-9-_]{20,}", sheet_url.strip()):
        return sheet_url.strip()
    raise ValueError("Không trích được Sheet ID từ link. Kiểm tra lại URL.")


def _csv_urls(sheet_id: str, gid: int) -> list[str]:
    """Hai endpoint CSV công khai — thử gviz trước (chịu link-share rộng hơn),
    rồi export/csv. Trả về danh sách URL theo thứ tự ưu tiên."""
    return [
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}",
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}",
    ]


async def fetch_sheet_csv(sheet_url: str, gid: int = 0) -> list[list[str]]:
    """Tải sheet công khai dưới dạng CSV, trả về list các dòng (gồm cả header).

    Thử lần lượt gviz → export. Raise ValueError nếu cả hai đều fail hoặc trả về
    trang đăng nhập (sheet chưa được share công khai).
    """
    sheet_id = extract_sheet_id(sheet_url)
    last_err = "không rõ"
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for url in _csv_urls(sheet_id, gid):
            try:
                r = await client.get(
                    url, headers={"User-Agent": "HH-Inventory-Sync/1.0"}
                )
            except Exception as e:  # noqa: BLE001
                last_err = f"{type(e).__name__}: {e}"
                continue
            ct = r.headers.get("content-type", "")
            text = r.text
            # Sheet riêng tư trả HTML trang đăng nhập (status 200 hoặc 401).
            if r.status_code != 200 or "text/html" in ct or text.lstrip().startswith("<"):
                last_err = (
                    f"HTTP {r.status_code} ({ct or 'no content-type'}). "
                    "Sheet có thể CHƯA share công khai (Bất kỳ ai có liên kết → Người xem)."
                )
                continue
            rows = list(csv.reader(io.StringIO(text)))
            if rows:
                return rows
            last_err = "CSV rỗng"
    raise ValueError(f"Không đọc được Google Sheets: {last_err}")


# ---------------------------------------------------------------------------
# Parse helpers
# ---------------------------------------------------------------------------
def _cell(row: list[str], idx: int) -> str:
    return row[idx].strip() if idx < len(row) and row[idx] is not None else ""


def _deaccent(s: str) -> str:
    """Bỏ dấu tiếng Việt + lowercase để match header bền vững."""
    import unicodedata

    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d").replace("Đ", "d").lower().strip()


def _resolve_price_columns(header: list[str]) -> dict[str, Optional[int]]:
    """Tìm index cột giá chi tiết theo tên header (xem PRICE_COLUMN_TOKENS).

    Resolve theo thứ tự ưu tiên, mỗi cột chỉ gán cho 1 field. Không thấy → None.
    """
    norm = [_deaccent(h) for h in header]
    out: dict[str, Optional[int]] = {}
    used: set[int] = set()
    for field, token_sets in PRICE_COLUMN_TOKENS.items():
        found: Optional[int] = None
        for i, h in enumerate(norm):
            if i in used:
                continue
            if any(all(tok in h for tok in tset) for tset in token_sets):
                found = i
                break
        if found is not None:
            used.add(found)
        out[field] = found
    return out


def parse_vn_money(raw: str) -> Optional[int]:
    """'71.600.000,00' / '6.873.600.000,00' → int VNĐ. Trống → None.

    Định dạng VN: dấu '.' = phân cách nghìn, ',' = thập phân.
    """
    s = (raw or "").strip()
    if not s:
        return None
    s = re.sub(r"(?i)(vnđ|vnd|đ|tỷ|ty)", "", s).strip()
    if not s:
        return None
    s = s.replace(".", "").replace(",", ".")
    s = re.sub(r"[^\d.]", "", s)
    if not s or s == ".":
        return None
    try:
        return int(round(float(s)))
    except ValueError:
        return None


def parse_area(raw: str) -> Optional[float]:
    """'96M2' / '87.2' / '95.8M2' → float m². Ở đây '.' là dấu thập phân."""
    s = (raw or "").strip()
    if not s:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", s)
    if not m:
        return None
    try:
        return float(m.group().replace(",", "."))
    except ValueError:
        return None


def _to_ty(vnd: Optional[int]) -> float:
    """VNĐ → tỷ (làm tròn 2 chữ số) cho field gia_tri tương thích ngược."""
    if not vnd:
        return 0.0
    return round(vnd / 1_000_000_000, 2)


def _fmt_ty(vnd: Optional[int]) -> str:
    if not vnd:
        return ""
    return f"{vnd / 1_000_000_000:.2f}".rstrip("0").rstrip(".")


def map_status(coc_cell: str, extra: str = "") -> str:
    """Map trạng thái về nhãn frontend: 'Còn hàng' | 'Đặt cọc' | 'Đã bán'."""
    blob = f"{coc_cell} {extra}".lower()
    if any(k in blob for k in ("đã bán", "da ban", "sold", "bán")):
        return "Đã bán"
    if any(k in blob for k in ("cọc", "coc", "giữ chỗ", "booking", "reserved", "đặt")):
        return "Đặt cọc"
    return "Còn hàng"


def _gen_position(index: int, group_key: str) -> dict:
    """Sinh toạ độ marker tất định, gom cụm theo 'đường' để map vẫn render được
    khi sheet không có toạ độ thật. (Phase 2: thay bằng toạ độ thật / mặt bằng.)"""
    # Băm group_key sang 1 dải ngang ổn định.
    band = (sum(ord(c) for c in group_key) % 3)  # 0,1,2 theo 3 đường
    band_w = (_MAP_W - 2 * _MARGIN) / 3
    cx = _MARGIN + (band + 0.5) * band_w
    x = cx + ((index * 53) % int(band_w)) - band_w / 2
    y = _MARGIN + ((index * 67) % 16) / 16 * (_MAP_H - 2 * _MARGIN)
    x = max(_MARGIN, min(_MAP_W - _MARGIN, x))
    y = max(_MARGIN, min(_MAP_H - _MARGIN, y))
    return {"x": round(x, 1), "y": round(y, 1)}


# ---------------------------------------------------------------------------
# Row → unit dict
# ---------------------------------------------------------------------------
def parse_inventory_row(
    row: list[str], index: int = 0, price_cols: Optional[dict] = None
) -> Optional[dict]:
    """Chuyển 1 dòng CSV (list cells, theo index cột) → unit dict, hoặc None nếu
    dòng không có mã căn (dòng trống / footer).

    Raise ValueError nếu mã căn có nhưng dữ liệu hỏng nghiêm trọng (để caller gom
    vào errors)."""
    code = _cell(row, C_MACAN)
    if not code:
        return None
    code = re.sub(r"\s+", "", code)  # 'MÃ CĂN ' đôi khi dính khoảng trắng

    duong = _cell(row, C_DUONG)
    khu = _cell(row, C_KHU)
    vi_tri = _cell(row, C_VITRI).upper()
    huong = _cell(row, C_HUONG)
    view = _cell(row, C_VIEW)
    hinh_thuc = _cell(row, C_HINHTHUC)
    dot = _cell(row, C_DOT)

    dien_tich = parse_area(_cell(row, C_DIENTICH)) or 0.0
    gia_min = parse_vn_money(_cell(row, C_GIA_MIN))
    gia_max = parse_vn_money(_cell(row, C_GIA_MAX))
    don_gia_min = parse_vn_money(_cell(row, C_DONGIA_MIN))
    don_gia_max = parse_vn_money(_cell(row, C_DONGIA_MAX))

    # Nếu chỉ có 1 giá thì coi min=max.
    if gia_min and not gia_max:
        gia_max = gia_min
    if gia_max and not gia_min:
        gia_min = gia_max

    loai = "Lô góc" if vi_tri == "GÓC" else "Liền kề"
    status = map_status(_cell(row, C_COC))

    # Nhãn giá hiển thị: min-max tỷ, hoặc "Liên hệ" nếu chưa có giá.
    if gia_min and gia_max:
        if gia_min == gia_max:
            gia_label = f"{_fmt_ty(gia_min)} tỷ"
        else:
            gia_label = f"{_fmt_ty(gia_min)} - {_fmt_ty(gia_max)} tỷ"
    else:
        gia_label = "Liên hệ"

    # gia_tri (số tỷ đơn) cho consumer cũ (KPI/quote): dùng giá max làm trần.
    gia_tri = _to_ty(gia_max)

    lo = code.split("-")[-1] if "-" in code else code

    # --- Giá chi tiết cho phiếu tính giá (nếu sheet có các cột tương ứng) ---
    pc = price_cols or {}

    def _price(field: str) -> int:
        idx = pc.get(field)
        if idx is None:
            return 0
        return parse_vn_money(_cell(row, idx)) or 0

    return {
        "id": code,
        "lo": lo,
        # 'phan_khu' dùng làm chiều lọc chính → gán theo ĐƯỜNG (3 nhóm hữu ích).
        "phan_khu": duong or khu or "Mặt Trời",
        "loai": loai,
        "dien_tich": float(dien_tich),
        "mat_tien": 0.0,  # sheet không có mặt tiền
        "trang_thai": status,
        "gia_tri": gia_tri,
        "gia": gia_label,
        # --- field MỞ RỘNG (min-max + metadata sheet) ---
        "gia_min": gia_min or 0,
        "gia_max": gia_max or 0,
        "don_gia_min": don_gia_min or 0,
        "don_gia_max": don_gia_max or 0,
        # Giá chi tiết cho phiếu tính giá (0 nếu sheet chưa có cột).
        "gia_ny_gom_vat_kpbt": _price("gia_ny_gom_vat_kpbt"),
        "vat_hdmb": _price("vat_hdmb"),
        "kpbt": _price("kpbt"),
        "gt_xay_ny": _price("gt_xay_ny"),
        "khu": khu,
        "duong": duong,
        "huong": huong,
        "view": view,
        "vi_tri": vi_tri,
        "hinh_thuc": hinh_thuc,
        "dot": dot,
        "stt": _cell(row, C_STT),
        "notes": "" if (gia_min or gia_max) else "Giá liên hệ (chưa ra giá)",
        "position": _gen_position(index, duong or khu or "MT"),
        "source": "google_sheets",
        "deleted": False,
    }


def parse_rows(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    """Parse toàn bộ rows (đã gồm header ở [0]). Trả (units, errors).

    Bỏ qua dòng header và dòng không có mã căn. Lỗi từng dòng được gom lại,
    không làm hỏng cả lần sync."""
    units: list[dict] = []
    errors: list[str] = []
    seen: set[str] = set()
    price_cols = _resolve_price_columns(rows[0]) if rows else {}
    for i, row in enumerate(rows[1:], start=1):  # bỏ header
        try:
            unit = parse_inventory_row(row, index=i, price_cols=price_cols)
        except Exception as e:  # noqa: BLE001
            errors.append(f"Dòng {i + 1}: {type(e).__name__}: {e}")
            continue
        if unit is None:
            continue
        if unit["id"] in seen:
            errors.append(f"Dòng {i + 1}: mã căn trùng '{unit['id']}' — bỏ qua bản sau")
            continue
        seen.add(unit["id"])
        units.append(unit)
    return units, errors


# ---------------------------------------------------------------------------
# Orchestrate
# ---------------------------------------------------------------------------
async def sync_from_sheet(
    sheet_url: str,
    replace_all: bool = True,
    gid: int = 0,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> dict:
    """Điểm vào chính: fetch → parse → backup → ghi store → lưu lịch sử.

    Trả về dict khớp schema InventorySyncResult.
    """
    synced_at = datetime.utcnow()
    errors: list[str] = []
    backup_file: Optional[str] = None

    try:
        rows = await fetch_sheet_csv(sheet_url, gid=gid)
    except Exception as e:  # noqa: BLE001
        result = {
            "success": False,
            "total_units": 0,
            "created": 0,
            "updated": 0,
            "deleted": 0,
            "errors": [str(e)],
            "sheet_url": sheet_url,
            "sheet_gid": gid,
            "synced_at": synced_at,
            "synced_by_user_id": user_id,
            "synced_by_name": user_name,
            "backup_file": None,
        }
        inventory_store.add_sync_record(_serializable(result))
        return result

    units, parse_errors = parse_rows(rows)
    errors.extend(parse_errors)

    if not units:
        result = {
            "success": False,
            "total_units": 0,
            "created": 0,
            "updated": 0,
            "deleted": 0,
            "errors": errors or ["Sheet không có dòng dữ liệu hợp lệ (thiếu MÃ CĂN)."],
            "sheet_url": sheet_url,
            "sheet_gid": gid,
            "synced_at": synced_at,
            "synced_by_user_id": user_id,
            "synced_by_name": user_name,
            "backup_file": None,
        }
        inventory_store.add_sync_record(_serializable(result))
        return result

    # AUTO-BACKUP trước khi ghi đè (quy tắc tuyệt đối: không mất data).
    backup_file = inventory_store.backup_now()

    if replace_all:
        stats = inventory_store.replace_all(units)
    else:
        stats = inventory_store.bulk_upsert(units)
        stats["deleted"] = 0

    result = {
        "success": True,
        "total_units": len(units),
        "created": stats["created"],
        "updated": stats["updated"],
        "deleted": stats.get("deleted", 0),
        "errors": errors,
        "sheet_url": sheet_url,
        "sheet_gid": gid,
        "synced_at": synced_at,
        "synced_by_user_id": user_id,
        "synced_by_name": user_name,
        "backup_file": backup_file,
    }
    inventory_store.add_sync_record(_serializable(result))
    return result


def _serializable(result: dict) -> dict:
    """datetime → ISO string để JSON ghi được vào sync_history."""
    out = dict(result)
    sa = out.get("synced_at")
    if isinstance(sa, datetime):
        out["synced_at"] = sa.isoformat() + "Z"
    return out
