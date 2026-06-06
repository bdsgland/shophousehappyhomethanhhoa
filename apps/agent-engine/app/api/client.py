"""Endpoint dành riêng cho portal khách hàng (`/client`).

Hiện cung cấp gợi ý căn hộ. Giai đoạn sau sẽ cá nhân hoá theo lịch sử xem,
ngân sách và khu vực khách quan tâm.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.inventory import get_units

router = APIRouter(prefix="/client", tags=["client"])


@router.get("/recommended")
def recommended(
    limit: int = 3, user: dict = Depends(get_current_user)
) -> list[dict]:
    """Gợi ý vài căn còn hàng cho khách.

    MVP: chọn tất định (không random) các căn 'Còn hàng' rải đều theo phân khu
    để mỗi lần gọi đều ổn định. Ưu tiên đa dạng phân khu cho danh sách gợi ý.
    """
    units = get_units()
    available = [u for u in units if u.get("trang_thai") == "Còn hàng"]
    if not available:
        available = list(units)

    # Rải theo bước nhảy để gợi ý đa dạng phân khu thay vì 3 căn liền nhau.
    n = len(available)
    limit = max(1, min(limit, n))
    step = max(1, n // limit)
    picked = [available[(i * step) % n] for i in range(limit)]

    # Khử trùng lặp (giữ thứ tự) phòng khi step gây đụng.
    seen: set[str] = set()
    result: list[dict] = []
    for u in picked:
        if u["id"] not in seen:
            seen.add(u["id"])
            result.append(u)
    # Bù cho đủ limit nếu khử trùng làm thiếu.
    for u in available:
        if len(result) >= limit:
            break
        if u["id"] not in seen:
            seen.add(u["id"])
            result.append(u)
    return result
