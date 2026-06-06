"""Endpoint quỹ căn (inventory) — public read, không cần auth.

Trả dữ liệu mock cho dự án Eurowindow Light City để dashboard hiển thị
mặt bằng quỹ căn, bộ lọc và thống kê. Dữ liệu sinh theo quy luật (không
random) để ổn định giữa các lần gọi.

Giai đoạn sau sẽ thay bằng nguồn dữ liệu thật từ chủ đầu tư / CRM.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/inventory", tags=["inventory"])

SLUG = "eurowindow-light-city"

# 7 phân khu — khớp với SUBZONES bên frontend.
_ZONES = [
    ("Bình Minh", "Liền kề", "BM"),
    ("Mặt Trời", "Liền kề", "MT"),
    ("Cầu Vồng", "Liền kề", "CV"),
    ("Ánh Sao", "Liền kề", "AS"),
    ("Ánh Trăng", "Biệt thự", "AT"),
    ("Ánh Sáng", "Shophouse", "AG"),
    ("Hừng Đông", "Liền kề", "HD"),
]

_STATUSES = ["Còn hàng", "Đặt cọc", "Đã bán"]

# Giá khởi điểm theo loại sản phẩm (tỷ đồng) — tham khảo thị trường.
_BASE_PRICE = {"Liền kề": 1.9, "Shophouse": 4.2, "Biệt thự": 5.5}

# Kích thước ảnh mặt bằng tổng (px) — dùng cho toạ độ marker trên Leaflet CRS.Simple.
# Khớp file: public/elc-assets/.../ELC_ban do phan khu_tong-01.jpg (2001 x 1126).
_MAP_W = 2001
_MAP_H = 1126
_MARGIN = 110


def _gen_units() -> List[dict]:
    """Sinh 112 căn (16 căn / phân khu) theo quy luật cố định.

    Mỗi căn kèm `position {x, y}` (px) để đặt marker trên ảnh mặt bằng —
    gom cụm theo phân khu để giống bố cục thực tế. Toạ độ tất định (không
    random) để ổn định giữa các lần gọi và lần deploy.
    """
    units: List[dict] = []
    per_zone = 16
    band_w = (_MAP_W - 2 * _MARGIN) / len(_ZONES)
    for zi, (zone, loai, prefix) in enumerate(_ZONES):
        base = _BASE_PRICE[loai]
        zone_cx = _MARGIN + (zi + 0.5) * band_w
        for j in range(per_zone):
            idx = zi * per_zone + j
            lot = f"{j + 1:02d}"
            area = 75 + (j % 8) * 12 if loai != "Biệt thự" else 180 + (j % 6) * 20
            facade = 5 + (j % 4) if loai != "Biệt thự" else 10 + (j % 4)
            status = _STATUSES[idx % 3]
            price_val = round(base + (area - 75) * 0.035, 1)
            # Rải marker quanh tâm phân khu: lệch ngang ±(band/2), trải đều dọc.
            pos_x = zone_cx + ((j * 53) % int(band_w)) - band_w / 2
            pos_y = _MARGIN + (j * 67 % (per_zone)) / per_zone * (_MAP_H - 2 * _MARGIN)
            pos_x = max(_MARGIN, min(_MAP_W - _MARGIN, pos_x))
            pos_y = max(_MARGIN, min(_MAP_H - _MARGIN, pos_y))
            units.append(
                {
                    "id": f"{prefix}-{lot}",
                    "lo": lot,
                    "phan_khu": zone,
                    "loai": loai,
                    "dien_tich": float(area),
                    "mat_tien": float(facade),
                    "trang_thai": status,
                    "gia_tri": price_val,
                    "gia": f"{price_val:.1f} tỷ",
                    "position": {"x": round(pos_x, 1), "y": round(pos_y, 1)},
                }
            )
    return units


# Sinh 1 lần khi import — coi như "kho" cố định trong vòng đời process.
_UNITS: List[dict] = _gen_units()


@router.get("/{slug}/units")
def list_units(
    slug: str,
    phankhu: Optional[str] = Query(default=None, description="Lọc theo tên phân khu"),
    status: Optional[str] = Query(default=None, description="Lọc theo trạng thái"),
) -> List[dict]:
    """Danh sách căn của dự án, có lọc theo ?phankhu= và ?status=."""
    if slug != SLUG:
        raise HTTPException(status_code=404, detail="Dự án không tồn tại")
    rows = _UNITS
    if phankhu and phankhu not in ("", "Tất cả"):
        rows = [u for u in rows if u["phan_khu"] == phankhu]
    if status and status not in ("", "Tất cả"):
        rows = [u for u in rows if u["trang_thai"] == status]
    return rows


@router.get("/{slug}/stats")
def get_stats(slug: str) -> dict:
    """Thống kê quỹ căn: tổng / còn hàng / đã bán / đặt cọc."""
    if slug != SLUG:
        raise HTTPException(status_code=404, detail="Dự án không tồn tại")
    total = len(_UNITS)
    available = sum(1 for u in _UNITS if u["trang_thai"] == "Còn hàng")
    sold = sum(1 for u in _UNITS if u["trang_thai"] == "Đã bán")
    reserved = sum(1 for u in _UNITS if u["trang_thai"] == "Đặt cọc")
    return {
        "total": total,
        "available": available,
        "sold": sold,
        "reserved": reserved,
    }
