"""Endpoint quỹ căn (inventory) — public read, không cần auth.

Nguồn dữ liệu: `inventory_store` (JSON persist trên Railway Volume), đồng bộ từ
Google Sheets chủ đầu tư qua `/admin/inventory/sync`. Khi store còn TRỐNG (chưa
sync lần nào) thì FALLBACK về bộ mock 112 căn sinh theo quy luật để dashboard
không trống.

Các hàm get_units()/get_unit() + admin_* được nhiều module khác dùng
(client.py, admin.py, bookings.py, n8n_stubs.py, learning.py) → giữ nguyên
chữ ký + shape dict tiếng Việt để tương thích ngược.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.core import inventory_store

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

# Phân loại quỹ (lưu key; label tiếng Việt hiển thị ở FE).
_QUY_OPTIONS = ["exclusive", "bonus", "agency_f1", "mid", "not_open"]
_DEFAULT_QUY = "not_open"

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


# Mock fallback — sinh 1 lần khi import. CHỈ dùng khi store còn trống (chưa sync).
_FALLBACK_UNITS: List[dict] = _gen_units()


def get_units() -> List[dict]:
    """Toàn bộ quỹ căn đang hiển thị (đã loại căn soft-deleted).

    Ưu tiên dữ liệu THẬT trong store; nếu store trống → mock fallback.
    """
    if inventory_store.is_empty():
        return _FALLBACK_UNITS
    return inventory_store.get_all(include_deleted=False)


def get_unit(unit_id: str) -> Optional[dict]:
    if inventory_store.is_empty():
        for u in _FALLBACK_UNITS:
            if u["id"] == unit_id:
                return u
        return None
    return inventory_store.get_by_id(unit_id)


# ---------------------------------------------------------------------------
# Mutations cho admin — ghi xuống inventory_store (persist trên Volume).
# Nếu store còn trống thì seed bằng mock trước khi sửa để admin QA được ngay cả
# khi chưa sync từ sheet.
# ---------------------------------------------------------------------------

_ALLOWED_STATUS = set(_STATUSES)


def _ensure_seeded() -> None:
    """Seed store bằng mock nếu trống — để mutation có dữ liệu thao tác."""
    if inventory_store.is_empty():
        inventory_store.replace_all([dict(u) for u in _FALLBACK_UNITS])


def _recompute_price_label(u: dict) -> None:
    """Cập nhật nhãn `gia`: min-max nếu có gia_min/gia_max, ngược lại theo gia_tri."""
    gmin = u.get("gia_min") or 0
    gmax = u.get("gia_max") or 0
    if gmin and gmax:
        def _ty(v: int) -> str:
            return f"{v / 1_000_000_000:.2f}".rstrip("0").rstrip(".")

        u["gia"] = f"{_ty(gmin)} tỷ" if gmin == gmax else f"{_ty(gmin)} - {_ty(gmax)} tỷ"
    elif u.get("gia_tri"):
        u["gia"] = f"{u['gia_tri']:.1f} tỷ"
    else:
        u["gia"] = "Liên hệ"


def admin_update_unit(unit_id: str, changes: dict) -> Optional[dict]:
    """Cập nhật 1 căn. Cho phép đổi giá (gia_tri / gia_min / gia_max), trạng
    thái, diện tích, vị trí, phân khu, loại. Manual override dữ liệu sheet."""
    _ensure_seeded()
    u = inventory_store.get_by_id(unit_id)
    if not u:
        return None
    patch: dict = {}
    if "trang_thai" in changes and changes["trang_thai"]:
        if changes["trang_thai"] not in _ALLOWED_STATUS:
            raise ValueError(f"Trạng thái không hợp lệ: {changes['trang_thai']}")
        patch["trang_thai"] = changes["trang_thai"]
    for fld in ("gia_min", "gia_max"):
        if changes.get(fld) is not None:
            patch[fld] = int(round(float(changes[fld])))
    if changes.get("gia_tri") is not None:
        patch["gia_tri"] = round(float(changes["gia_tri"]), 2)
    for fld in ("phan_khu", "loai", "huong", "view", "notes"):
        if changes.get(fld) is not None:
            patch[fld] = changes[fld]
    if changes.get("quy") is not None:
        if changes["quy"] not in _QUY_OPTIONS:
            raise ValueError(f"Quỹ không hợp lệ: {changes['quy']}")
        patch["quy"] = changes["quy"]
    for fld in ("gia_ny_gom_vat_kpbt", "vat_hdmb", "kpbt", "gt_xay_ny"):
        if changes.get(fld) is not None:
            patch[fld] = int(round(float(changes[fld])))
    for fld in ("dien_tich", "mat_tien"):
        if changes.get(fld) is not None:
            patch[fld] = float(changes[fld])
    if changes.get("position") and isinstance(changes["position"], dict):
        cur = u.get("position") or {"x": _MAP_W / 2, "y": _MAP_H / 2}
        patch["position"] = {
            "x": round(float(changes["position"].get("x", cur["x"])), 1),
            "y": round(float(changes["position"].get("y", cur["y"])), 1),
        }
    merged = {**u, **patch}
    _recompute_price_label(merged)
    patch["gia"] = merged["gia"]
    return inventory_store.update(unit_id, patch)


def admin_create_unit(data: dict) -> dict:
    """Tạo căn mới. id phải duy nhất; tự sinh giá-label."""
    _ensure_seeded()
    unit_id = (data.get("id") or "").strip()
    if not unit_id:
        raise ValueError("Thiếu mã căn (id)")
    if inventory_store.get_by_id(unit_id, include_deleted=True):
        raise ValueError(f"Mã căn đã tồn tại: {unit_id}")
    status = data.get("trang_thai") or "Còn hàng"
    if status not in _ALLOWED_STATUS:
        raise ValueError(f"Trạng thái không hợp lệ: {status}")
    gia_min = int(round(float(data.get("gia_min") or 0)))
    gia_max = int(round(float(data.get("gia_max") or 0)))
    gia_tri = round(float(data.get("gia_tri") or 0), 2)
    quy = data.get("quy") or _DEFAULT_QUY
    if quy not in _QUY_OPTIONS:
        raise ValueError(f"Quỹ không hợp lệ: {quy}")
    unit = {
        "id": unit_id,
        "lo": data.get("lo") or unit_id.split("-")[-1],
        "phan_khu": data.get("phan_khu") or "Khác",
        "loai": data.get("loai") or "Liền kề",
        "dien_tich": float(data.get("dien_tich") or 0),
        "mat_tien": float(data.get("mat_tien") or 0),
        "trang_thai": status,
        "gia_tri": gia_tri,
        "gia_min": gia_min,
        "gia_max": gia_max,
        "quy": quy,
        "gia_ny_gom_vat_kpbt": int(round(float(data.get("gia_ny_gom_vat_kpbt") or 0))),
        "vat_hdmb": int(round(float(data.get("vat_hdmb") or 0))),
        "kpbt": int(round(float(data.get("kpbt") or 0))),
        "gt_xay_ny": int(round(float(data.get("gt_xay_ny") or 0))),
        "huong": data.get("huong") or "",
        "view": data.get("view") or "",
        "notes": data.get("notes") or "",
        "source": "manual",
        "position": data.get("position") or {"x": _MAP_W / 2, "y": _MAP_H / 2},
    }
    _recompute_price_label(unit)
    return inventory_store.create(unit)


def admin_delete_unit(unit_id: str) -> bool:
    """Soft-delete căn khỏi quỹ (giữ trong file, set deleted=True)."""
    _ensure_seeded()
    return inventory_store.delete_soft(unit_id)


@router.get("/{slug}/units")
def list_units(
    slug: str,
    phankhu: Optional[str] = Query(default=None, description="Lọc theo tên phân khu"),
    status: Optional[str] = Query(default=None, description="Lọc theo trạng thái"),
    quy: Optional[str] = Query(default=None, description="Lọc theo quỹ (key)"),
) -> List[dict]:
    """Danh sách căn của dự án, có lọc theo ?phankhu=, ?status= và ?quy=."""
    if slug != SLUG:
        raise HTTPException(status_code=404, detail="Dự án không tồn tại")
    rows = get_units()
    if phankhu and phankhu not in ("", "Tất cả"):
        rows = [u for u in rows if u["phan_khu"] == phankhu]
    if status and status not in ("", "Tất cả"):
        rows = [u for u in rows if u["trang_thai"] == status]
    if quy and quy not in ("", "Tất cả"):
        rows = [u for u in rows if u.get("quy") == quy]
    return rows


@router.get("/{slug}/stats")
def get_stats(slug: str) -> dict:
    """Thống kê quỹ căn: tổng / còn hàng / đã bán / đặt cọc."""
    if slug != SLUG:
        raise HTTPException(status_code=404, detail="Dự án không tồn tại")
    rows = get_units()
    total = len(rows)
    available = sum(1 for u in rows if u["trang_thai"] == "Còn hàng")
    sold = sum(1 for u in rows if u["trang_thai"] == "Đã bán")
    reserved = sum(1 for u in rows if u["trang_thai"] == "Đặt cọc")
    return {
        "total": total,
        "available": available,
        "sold": sold,
        "reserved": reserved,
    }
