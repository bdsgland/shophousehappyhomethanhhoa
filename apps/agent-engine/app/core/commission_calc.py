"""Tính phân chia hoa hồng cho 1 deal theo CommissionConfig.

Logic:
  1. total_pool = deal_amount * total_pool_percentage / 100
  2. Xác định bậc KPI frontline theo doanh số/tháng SAU khi cộng deal này.
  3. ekip nhận % cơ bản + ekip_bonus của bậc; frontline nhận frontline_percentage
     của bậc; director/manager/leader nhận % cơ bản.
  4. Nếu có người giới thiệu (data) → cắt referral% từ phần frontline.

Trả CommissionBreakdown. `is_balanced` cảnh báo khi tổng chia lệch pool (do cấu
hình ekip_bonus cộng thêm) — admin tự cân chỉnh nếu muốn chia đúng 100%.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.core import commission_config_store
from app.schemas.commission_config import (
    CommissionBreakdown,
    CommissionConfig,
    CommissionRecipient,
    FrontlineKPITier,
)


def find_frontline_tier(monthly_volume: int, config: CommissionConfig) -> FrontlineKPITier:
    """Tìm bậc KPI ứng với doanh số/tháng. Vượt mọi ngưỡng → bậc cao nhất."""
    tiers = sorted(config.frontline_kpi_tiers, key=lambda t: t.min_monthly_volume)
    for t in tiers:
        lo = t.min_monthly_volume
        hi = t.max_monthly_volume
        if monthly_volume >= lo and (hi is None or monthly_volume < hi):
            return t
    return tiers[-1]


def calculate_commission_breakdown(
    *,
    deal_amount: int,
    sale_frontline_id: str,
    sale_monthly_volume_before_deal: int = 0,
    leader_id: Optional[str] = None,
    manager_id: Optional[str] = None,
    director_id: Optional[str] = None,
    referrer_id: Optional[str] = None,
    config: Optional[CommissionConfig] = None,
) -> CommissionBreakdown:
    """Tính breakdown hoa hồng cho 1 deal."""
    if config is None:
        config = commission_config_store.get_current()

    pool = round(deal_amount * config.total_pool_percentage / 100)
    volume_after = max(0, sale_monthly_volume_before_deal) + max(0, deal_amount)
    tier = find_frontline_tier(volume_after, config)

    def pct_amount(pct: float) -> int:
        return round(pool * pct / 100)

    id_by_role = {
        "ekip": None,
        "director": director_id,
        "manager": manager_id,
        "leader": leader_id,
        "frontline": sale_frontline_id,
    }

    recipients: list[CommissionRecipient] = []
    for t in config.tiers:
        pct = t.percentage
        tier_name: Optional[str] = None
        if t.role == "ekip":
            pct = t.percentage + tier.ekip_bonus_percentage
            tier_name = tier.name
        elif t.role == "frontline":
            pct = tier.frontline_percentage
            tier_name = tier.name
        recipients.append(
            CommissionRecipient(
                role=t.role,
                label_vi=t.label_vi,
                user_id=id_by_role.get(t.role),
                percentage=round(pct, 4),
                amount=pct_amount(pct),
                tier_name=tier_name,
            )
        )

    # Người giới thiệu (data): cắt từ phần frontline.
    if referrer_id and config.referral_bonus.enabled:
        ref_pct = config.referral_bonus.percentage_of_commission
        ref_amount = pct_amount(ref_pct)
        for r in recipients:
            if r.role == "frontline":
                r.amount = max(0, r.amount - ref_amount)
                break
        recipients.append(
            CommissionRecipient(
                role="referrer",
                label_vi="Người giới thiệu (data)",
                user_id=referrer_id,
                percentage=round(ref_pct, 4),
                amount=ref_amount,
                tier_name=None,
            )
        )

    total_distributed = sum(r.amount for r in recipients)
    is_balanced = abs(total_distributed - pool) <= max(1, len(recipients))

    return CommissionBreakdown(
        deal_amount=deal_amount,
        total_pool=pool,
        total_pool_percentage=config.total_pool_percentage,
        frontline_tier_applied=tier.name,
        frontline_tier_id=tier.tier_id,
        total_distributed=total_distributed,
        total_distributed_percentage=(
            round(total_distributed / pool * 100, 2) if pool else 0.0
        ),
        is_balanced=is_balanced,
        recipients=recipients,
        calculated_at=datetime.utcnow(),
        config_version=config.version,
    )
