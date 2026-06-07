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


def get_units() -> List[dict]:
    """Trả về toàn bộ quỹ căn (dùng nội bộ cho các module khác như /client)."""
    return _UNITS


def get_unit(unit_id: str) -> Optional[dict]:
    for u in _UNITS:
        if u["id"] == unit_id:
            return u
    return None


# ---------------------------------------------------------------------------
# Mutations cho admin (in-memory). LƯU Ý: quỹ căn hiện sinh mock mỗi lần khởi
# động process nên thay đổi là TẠM THỜI (reset khi redeploy). Giai đoạn sau
# thay bằng bảng PostgreSQL `units`. Đủ dùng để admin thao tác/QA Phase 2.
# ---------------------------------------------------------------------------

_ALLOWED_STATUS = set(_STATUSES)


def _recompute_price_label(u: dict) -> None:
    u["gia"] = f"{u['gia_tri']:.1f} tỷ"


def admin_update_unit(unit_id: str, changes: dict) -> Optional[dict]:
    """Cập nhật 1 căn. Cho phép đổi giá/trạng thái/diện tích/vị trí/phân khu/loại."""
    u = get_unit(unit_id)
    if not u:
        return None
    if "trang_thai" in changes and changes["trang_thai"]:
        if changes["trang_thai"] not in _ALLOWED_STATUS:
            raise ValueError(f"Trạng thái không hợp lệ: {changes['trang_thai']}")
        u["trang_thai"] = changes["trang_thai"]
    if changes.get("gia_tri") is not None:
        u["gia_tri"] = round(float(changes["gia_tri"]), 2)
        _recompute_price_label(u)
    for fld in ("phan_khu", "loai"):
        if changes.get(fld):
            u[fld] = changes[fld]
    for fld in ("dien_tich", "mat_tien"):
        if changes.get(fld) is not None:
            u[fld] = float(changes[fld])
    if changes.get("position") and isinstance(changes["position"], dict):
        u["position"] = {
            "x": round(float(changes["position"].get("x", u["position"]["x"])), 1),
            "y": round(float(changes["position"].get("y", u["position"]["y"])), 1),
        }
    return u


def admin_create_unit(data: dict) -> dict:
    """Tạo căn mới. id phải duy nhất; tự sinh giá-label."""
    unit_id = (data.get("id") or "").strip()
    if not unit_id:
        raise ValueError("Thiếu mã căn (id)")
    if get_unit(unit_id):
        raise ValueError(f"Mã căn đã tồn tại: {unit_id}")
    status = data.get("trang_thai") or "Còn hàng"
    if status not in _ALLOWED_STATUS:
        raise ValueError(f"Trạng thái không hợp lệ: {status}")
    gia_tri = round(float(data.get("gia_tri") or 0), 2)
    unit = {
        "id": unit_id,
        "lo": data.get("lo") or unit_id.split("-")[-1],
        "phan_khu": data.get("phan_khu") or "Khác",
        "loai": data.get("loai") or "Liền kề",
        "dien_tich": float(data.get("dien_tich") or 0),
        "mat_tien": float(data.get("mat_tien") or 0),
        "trang_thai": status,
        "gia_tri": gia_tri,
        "gia": f"{gia_tri:.1f} tỷ",
        "position": data.get("position") or {"x": _MAP_W / 2, "y": _MAP_H / 2},
    }
    _UNITS.append(unit)
    return unit


def admin_delete_unit(unit_id: str) -> bool:
    """Xoá căn khỏi quỹ (in-memory). Trả về True nếu xoá được."""
    for i, u in enumerate(_UNITS):
        if u["id"] == unit_id:
            del _UNITS[i]
            return True
    return False


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
