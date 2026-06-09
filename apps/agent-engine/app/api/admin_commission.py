"""API cấu hình cơ chế hoa hồng (admin) + xem bậc KPI của sale frontline.

Admin:
  GET    /admin/commission/config              → config hiện tại
  PATCH  /admin/commission/config              → cập nhật (validate + version + backup)
  GET    /admin/commission/config/history      → lịch sử version
  POST   /admin/commission/config/restore/{v}  → khôi phục version cũ
  POST   /admin/commission/preview             → tính thử breakdown (chưa lưu)
  POST   /admin/commission/config/reset        → khôi phục mặc định

Sale:
  GET    /sale/commission/me/current-tier      → bậc KPI hiện tại + progress
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.api.deps import get_current_user, require_admin, require_sale
from app.core import commission_calc, commission_config_store
from app.schemas.commission_config import CommissionBreakdown, CommissionConfig, default_config

router = APIRouter(prefix="/admin/commission", tags=["admin", "commission"])
sale_router = APIRouter(prefix="/sale/commission", tags=["sale", "commission"])


# ---------------------------------------------------------------------------
# Admin — config CRUD
# ---------------------------------------------------------------------------

@router.get("/config")
def get_config(_admin: dict = Depends(require_admin)) -> CommissionConfig:
    return commission_config_store.get_current()


@router.patch("/config")
def update_config(
    config: CommissionConfig,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> CommissionConfig:
    try:
        return commission_config_store.update(config, by_admin_id=user.get("id"))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/config/history")
def config_history(_admin: dict = Depends(require_admin)) -> dict:
    return {"versions": commission_config_store.get_history()}


@router.post("/config/restore/{version}")
def restore_version(
    version: int,
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> CommissionConfig:
    try:
        return commission_config_store.restore(version, by_admin_id=user.get("id"))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/config/reset")
def reset_to_default(
    user: dict = Depends(get_current_user),
    _admin: dict = Depends(require_admin),
) -> CommissionConfig:
    """Khôi phục cấu hình mặc định (vẫn backup config hiện tại + tăng version)."""
    return commission_config_store.update(default_config(), by_admin_id=user.get("id"))


# ---------------------------------------------------------------------------
# Admin — preview calculator (chưa lưu)
# ---------------------------------------------------------------------------

@router.post("/preview")
def preview_calculation(
    payload: dict = Body(...),
    _admin: dict = Depends(require_admin),
) -> CommissionBreakdown:
    """Tính thử breakdown. Body:

      {
        "deal_amount": 5000000000,
        "sale_monthly_volume_before_deal": 3000000000,  # optional, mặc định 0
        "with_referrer": false,                          # optional
        "config": {...}                                  # optional, null = config hiện tại
      }
    """
    deal_amount = payload.get("deal_amount")
    if not isinstance(deal_amount, (int, float)) or deal_amount <= 0:
        raise HTTPException(status_code=400, detail="deal_amount phải là số > 0.")

    config = None
    raw_config = payload.get("config")
    if raw_config:
        try:
            config = CommissionConfig.model_validate(raw_config)
            commission_config_store.validate_config(config)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Config không hợp lệ: {e}")
        except Exception as e:  # noqa: BLE001 — lỗi parse pydantic
            raise HTTPException(status_code=400, detail=f"Config không hợp lệ: {e}")

    return commission_calc.calculate_commission_breakdown(
        deal_amount=int(deal_amount),
        sale_frontline_id="preview-sale",
        sale_monthly_volume_before_deal=int(
            payload.get("sale_monthly_volume_before_deal", 0) or 0
        ),
        referrer_id="preview-referrer" if payload.get("with_referrer") else None,
        config=config,
    )


# ---------------------------------------------------------------------------
# Sale — bậc KPI hiện tại
# ---------------------------------------------------------------------------

@sale_router.get("/me/current-tier")
def my_current_tier(user: dict = Depends(require_sale)) -> dict:
    """Bậc KPI frontline hiện tại của sale + tiến độ lên bậc kế tiếp.

    Giai đoạn khung: chưa có dữ liệu deal thực → doanh số tháng = 0 (bậc khởi đầu).
    Khi có module deal/closed thực, thay `monthly_volume = 0` bằng tổng doanh số
    tháng của sale.
    """
    config = commission_config_store.get_current()
    monthly_volume = 0  # TODO Phase 2: tổng doanh số tháng thực của sale
    tiers = sorted(config.frontline_kpi_tiers, key=lambda t: t.min_monthly_volume)
    current = commission_calc.find_frontline_tier(monthly_volume, config)
    idx = next((i for i, t in enumerate(tiers) if t.tier_id == current.tier_id), 0)
    nxt = tiers[idx + 1] if idx + 1 < len(tiers) else None

    if nxt is not None:
        span = nxt.min_monthly_volume - current.min_monthly_volume
        done = monthly_volume - current.min_monthly_volume
        progress = round(done / span * 100, 1) if span > 0 else 0.0
        amount_to_next = max(0, nxt.min_monthly_volume - monthly_volume)
    else:
        progress = 100.0
        amount_to_next = 0

    return {
        "current_tier": current.model_dump(),
        "monthly_volume_so_far": monthly_volume,
        "next_tier": nxt.model_dump() if nxt else None,
        "progress_percentage": progress,
        "amount_to_next_tier": amount_to_next,
        "all_tiers": [t.model_dump() for t in tiers],
        "referral_bonus": config.referral_bonus.model_dump(),
    }
