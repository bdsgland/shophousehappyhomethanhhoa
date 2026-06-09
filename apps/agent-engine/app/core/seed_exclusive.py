"""Seed TẠM 5 căn ĐỘC QUYỀN có giá chi tiết (chưa kịp sync sheet bảng hàng).

>>> ĐÂY LÀ SEED TẠM — sẽ được THAY bằng đồng bộ Google Sheets sau. <<<

Idempotent: UPSERT theo MÃ CĂN (= field `id` trong inventory_store).
  - Căn đã có (vd từ sync) → CHỈ cập nhật 4 field giá chi tiết + `quy` + `gia_tri`
    + nhãn `gia`, GIỮ NGUYÊN các field khác.
  - Căn chưa có → tạo mới (đất 96 m², Liền kề, quỹ độc quyền).
Chỉ 5 căn này được set giá chi tiết → các căn khác vẫn "Báo giá".

Tắt qua env: SEED_EXCLUSIVE_UNITS=0 (mặc định bật). Ghi vào inventory_store (đường
dẫn resolve theo DATA_DIR — volume bền vững).
"""

from __future__ import annotations

import os

from app.core import inventory_store

_MAP_W, _MAP_H = 2001, 1126
_MARGIN = 110

# (id, đường, phân khu, loại, dt_đất, dt_sàn_XD, N, VAT(K), KPBT(L))
_EXCLUSIVE_UNITS = [
    ("DQ-31", "Dương Quang (17m)", "Mặt Trời", "Liền kề", 96.0, 263.7,
     7_042_783_206, 427_327_606, 26_472_112),
    ("DQ-53", "Dương Quang (17m)", "Mặt Trời", "Liền kề", 96.0, 264.8,
     7_054_099_212, 428_077_606, 26_509_612),
    ("HD-42", "Hoà Dương (17m)", "Mặt Trời", "Liền kề", 96.0, 264.8,
     6_758_906_799, 428_077_606, 26_509_612),
    ("HD-54", "Hoà Dương (17m)", "Mặt Trời", "Liền kề", 96.0, 264.8,
     6_980_301_109, 428_077_606, 26_509_612),
    ("HQ1-145", "Hồng Quang (25m)", "Mặt Trời", "Liền kề", 96.0, 263.7,
     7_264_177_517, 427_327_606, 26_472_112),
]


def _gia_label(n: int) -> str:
    return f"{n / 1_000_000_000:.2f}".rstrip("0").rstrip(".") + " tỷ"


def _pos(i: int) -> dict:
    cols = 3
    bw = (_MAP_W - 2 * _MARGIN) / cols
    bh = (_MAP_H - 2 * _MARGIN) / 3
    x = _MARGIN + ((i % cols) + 0.5) * bw
    y = _MARGIN + ((i // cols) + 0.5) * bh
    return {"x": round(x, 1), "y": round(y, 1)}


def seed_exclusive_units(force: bool = False) -> dict:
    """UPSERT 5 căn độc quyền. force=True bỏ qua kiểm tra env (dùng trong test)."""
    if not force and os.getenv("SEED_EXCLUSIVE_UNITS", "1") == "0":
        return {"skipped": True, "reason": "SEED_EXCLUSIVE_UNITS=0"}

    created = updated = 0
    for i, (code, duong, khu, loai, dt, dt_san, n, k, l) in enumerate(_EXCLUSIVE_UNITS):
        price_fields = {
            "quy": "exclusive",
            "gia_ny_gom_vat_kpbt": int(n),
            "vat_hdmb": int(k),
            "kpbt": int(l),
            "gt_xay_ny": 0,  # P (GT xây) chưa có trong dữ liệu mẫu → để 0 (giá cuối F26 không cần P)
            "gia_tri": round(n / 1_000_000_000, 2),
            "gia": _gia_label(int(n)),
        }
        existing = inventory_store.get_by_id(code, include_deleted=True)
        if existing:
            # Chỉ cập nhật field giá + quỹ, giữ nguyên phần còn lại.
            inventory_store.update(code, price_fields)
            updated += 1
        else:
            unit = {
                "id": code,
                "lo": code.split("-")[-1],
                "phan_khu": khu,
                "khu": khu,
                "duong": duong,
                "loai": loai,
                "dien_tich": float(dt),  # đất 96 m² → đơn giá F27 = F26/96
                "dt_san_xd": float(dt_san),
                "mat_tien": 0.0,
                "trang_thai": "Còn hàng",
                "gia_min": int(n),
                "gia_max": int(n),
                "huong": "",
                "view": "",
                "notes": "Seed tạm — căn độc quyền (sẽ thay bằng sync sheet)",
                "source": "seed_exclusive",
                "position": _pos(i),
                "deleted": False,
                **price_fields,
            }
            inventory_store.create(unit)
            created += 1

    return {"created": created, "updated": updated, "total": len(_EXCLUSIVE_UNITS)}
