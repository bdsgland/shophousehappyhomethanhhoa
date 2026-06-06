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


def _gen_units() -> List[dict]:
    """Sinh 112 căn (16 căn / phân khu) theo quy luật cố định."""
    units: List[dict] = []
    per_zone = 16
    for zi, (zone, loai, prefix) in enumerate(_ZONES):
        base = _BASE_PRICE[loai]
        for j in range(per_zone):
            idx = zi * per_zone + j
            lot = f"{j + 1:02d}"
            area = 75 + (j % 8) * 12 if loai != "Biệt thự" else 180 + (j % 6) * 20
            facade = 5 + (j % 4) if loai != "Biệt thự" else 10 + (j % 4)
            status = _STATUSES[idx % 3]
            price_val = round(base + (area - 75) * 0.035, 1)
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
