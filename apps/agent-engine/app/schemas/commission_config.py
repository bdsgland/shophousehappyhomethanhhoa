"""Schema cấu hình cơ chế hoa hồng đa tầng (5 bậc) + KPI lũy tiến frontline.

Toàn bộ cơ chế được lưu thành 1 object `CommissionConfig` duy nhất (JSON store,
xem app/core/commission_config_store.py). Admin chỉnh sửa qua /admin/commission/config.

Mô hình:
  - `tiers`: 5 bậc chia pool (ekip / director / manager / leader / frontline).
    Tổng % của 5 bậc = 100% (validate khi update).
  - `frontline_kpi_tiers`: bậc KPI lũy tiến của Sale Frontline theo doanh số/tháng.
    Khi frontline lên bậc cao → % frontline tăng (50→65), ekip nhận bonus giảm dần.
  - `referral_bonus`: người mang khách (data) về nhận X% của tổng hoa hồng.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CommissionTier(BaseModel):
    """1 bậc trong cơ chế hoa hồng 5 tầng (chia pool)."""

    role: str  # "ekip", "director", "manager", "leader", "frontline"
    label_vi: str
    percentage: float  # % của tổng pool (vd 20.0 = 20%)
    is_progressive: bool = False  # True cho frontline (lũy tiến theo KPI)


class FrontlineKPITier(BaseModel):
    """Bậc KPI lũy tiến của Sale Frontline (theo doanh số/tháng)."""

    tier_id: int
    name: str
    min_monthly_volume: int  # VNĐ doanh số/tháng tối thiểu (>=)
    max_monthly_volume: Optional[int] = None  # None = không giới hạn (bậc cao nhất)
    frontline_percentage: float  # % frontline ăn ở bậc này
    ekip_bonus_percentage: float = 0.0  # % ekip CỘNG thêm (bù khi frontline thấp)
    description_vi: str = ""


class ReferralBonus(BaseModel):
    """Hoa hồng giới thiệu khách (lấy data, không trực tiếp chốt)."""

    enabled: bool = True
    percentage_of_commission: float = 5.0  # % của tổng hoa hồng (trừ từ frontline)


class CommissionConfig(BaseModel):
    """Toàn bộ config hoa hồng — 1 object duy nhất trong store."""

    total_pool_percentage: float = 4.0  # tổng % của deal_amount
    tiers: list[CommissionTier]
    frontline_kpi_tiers: list[FrontlineKPITier]
    referral_bonus: ReferralBonus = Field(default_factory=ReferralBonus)
    last_updated_by: Optional[str] = None
    last_updated_at: Optional[datetime] = None
    version: int = 1  # tăng mỗi lần update (audit)


class CommissionConfigVersion(BaseModel):
    """1 mục trong lịch sử phiên bản config (current + backup)."""

    version: Optional[int] = None
    last_updated_by: Optional[str] = None
    last_updated_at: Optional[str] = None
    backup_file: Optional[str] = None
    is_current: bool = False


# ----- Kết quả tính hoa hồng (breakdown) -----

class CommissionRecipient(BaseModel):
    """1 người/vai trò nhận hoa hồng trong 1 deal."""

    role: str
    label_vi: str
    user_id: Optional[str] = None
    percentage: float  # % của pool áp dụng cho người này
    amount: int  # số tiền VNĐ
    tier_name: Optional[str] = None  # tên bậc KPI (cho ekip/frontline)


class CommissionBreakdown(BaseModel):
    """Kết quả phân chia hoa hồng cho 1 deal."""

    deal_amount: int
    total_pool: int
    total_pool_percentage: float
    frontline_tier_applied: str
    frontline_tier_id: int
    total_distributed: int
    total_distributed_percentage: float
    is_balanced: bool  # tổng chia có khớp pool không (cảnh báo nếu over/under)
    recipients: list[CommissionRecipient]
    calculated_at: datetime
    config_version: int


# ---------------------------------------------------------------------------
# Config mặc định (seed lần đầu)
# ---------------------------------------------------------------------------

def default_config() -> CommissionConfig:
    """Trả về 1 bản config mặc định MỚI (tránh chia sẻ object mutable)."""
    return CommissionConfig(
        total_pool_percentage=4.0,
        tiers=[
            CommissionTier(role="ekip", label_vi="Ekip công ty", percentage=20.0, is_progressive=False),
            CommissionTier(role="director", label_vi="Giám đốc dự án", percentage=10.0, is_progressive=False),
            CommissionTier(role="manager", label_vi="Trưởng phòng", percentage=5.0, is_progressive=False),
            CommissionTier(role="leader", label_vi="Sale Leader", percentage=15.0, is_progressive=False),
            CommissionTier(role="frontline", label_vi="Sale Frontline", percentage=50.0, is_progressive=True),
        ],
        frontline_kpi_tiers=[
            FrontlineKPITier(
                tier_id=1, name="Bậc khởi đầu",
                min_monthly_volume=0, max_monthly_volume=5_000_000_000,
                frontline_percentage=50.0, ekip_bonus_percentage=5.0,
                description_vi="Sale mới (<5 tỷ doanh số tháng)",
            ),
            FrontlineKPITier(
                tier_id=2, name="Bậc 2 - Bạc",
                min_monthly_volume=5_000_000_000, max_monthly_volume=10_000_000_000,
                frontline_percentage=55.0, ekip_bonus_percentage=4.0,
                description_vi="5-10 tỷ doanh số tháng",
            ),
            FrontlineKPITier(
                tier_id=3, name="Bậc 3 - Vàng",
                min_monthly_volume=10_000_000_000, max_monthly_volume=15_000_000_000,
                frontline_percentage=60.0, ekip_bonus_percentage=3.0,
                description_vi="10-15 tỷ doanh số tháng",
            ),
            FrontlineKPITier(
                tier_id=4, name="Bậc 4 - Bạch kim",
                min_monthly_volume=15_000_000_000, max_monthly_volume=20_000_000_000,
                frontline_percentage=62.0, ekip_bonus_percentage=2.0,
                description_vi="15-20 tỷ doanh số tháng",
            ),
            FrontlineKPITier(
                tier_id=5, name="Bậc 5 - Kim cương",
                min_monthly_volume=20_000_000_000, max_monthly_volume=None,
                frontline_percentage=65.0, ekip_bonus_percentage=0.0,
                description_vi="≥20 tỷ doanh số tháng (top)",
            ),
        ],
        referral_bonus=ReferralBonus(enabled=True, percentage_of_commission=5.0),
        version=1,
    )
