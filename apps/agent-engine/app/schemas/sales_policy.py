"""Schema "Chính sách bán hàng" — cấu hình phương án thanh toán + chiết khấu
nhiều lớp + VAT/phí bảo trì, dùng cho phiếu TÍNH GIÁ (policy quote).

Lưu thành 1 object `SalesPolicyConfig` (JSON store, xem core/sales_policy_store.py,
cùng pattern version+backup với commission_config). Admin chỉnh qua /admin/sales-policy.

Công thức (xem services/pricing_policy.py):
  - Chiết khấu tính trên GTSP CHƯA VAT (list_price_ex_vat).
  - Tổng %CK = base_discount_pct (theo phương án) + Σ pct các addon được chọn.
  - Giá sau CK = ex_vat × (1 − tổng%CK/100).
  - VAT = giá sau CK × vat_pct/100; phí bảo trì = giá sau CK × maintenance_pct/100.
  - Tổng thanh toán = giá sau CK + VAT + phí bảo trì.

⚠️ Tỷ lệ các đợt thanh toán trong seed mặc định là TẠM (đánh dấu cần xác nhận) —
admin sẽ chỉnh trong trang Cấu hình.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Cấu hình chính sách (admin sửa được)
# ---------------------------------------------------------------------------

class PolicyMilestone(BaseModel):
    """1 đợt trong tiến độ thanh toán.

    - kind="pct": số tiền = phần còn lại (sau khi trừ các đợt cố định) × pct/100.
    - kind="amount_fixed": số tiền cố định (VND), vd đặt cọc 200.000.000.
    """

    label: str
    kind: Literal["pct", "amount_fixed"] = "pct"
    pct: float = 0.0
    amount: float = 0.0  # dùng khi kind="amount_fixed"
    days_offset: Optional[int] = None  # mốc ngày tham khảo (vd 45) — chỉ hiển thị
    needs_confirm: bool = False  # True = số liệu TẠM, chờ CĐT xác nhận


class BasePlan(BaseModel):
    """1 phương án thanh toán gốc (chuẩn / sớm / vay)."""

    key: str  # "chuan" | "som" | "vay"
    label: str
    base_discount_pct: float = 0.0
    enabled: bool = True
    schedule: list[PolicyMilestone] = Field(default_factory=list)


class PolicyAddon(BaseModel):
    """1 ưu đãi cộng thêm (early bird / quà hè / đầu tư)."""

    key: str  # "early_bird" | "qua_he" | "dau_tu"
    label: str
    pct: float = 0.0
    enabled: bool = True


class SalesPolicyConfig(BaseModel):
    """Toàn bộ chính sách bán hàng — 1 object duy nhất trong store."""

    base_plans: list[BasePlan]
    addons: list[PolicyAddon]
    vat_pct: float = 10.0
    maintenance_pct: float = 2.0
    note: str = ""
    last_updated_by: Optional[str] = None
    last_updated_at: Optional[datetime] = None
    version: int = 1


class SalesPolicyVersion(BaseModel):
    version: Optional[int] = None
    last_updated_by: Optional[str] = None
    last_updated_at: Optional[str] = None
    backup_file: Optional[str] = None
    is_current: bool = False


# ---------------------------------------------------------------------------
# Request / Response cho phiếu tính giá
# ---------------------------------------------------------------------------

class PolicyQuoteRequest(BaseModel):
    unit_id: str = Field(description="Mã căn trong quỹ hàng (vd BM-01)")
    customer_name: str = Field(min_length=1)
    customer_phone: str = ""
    sale_name: str = ""
    sale_phone: str = ""
    base_plan: str = Field(description="key phương án: chuan | som | vay")
    addons: list[str] = Field(default_factory=list, description="key các ưu đãi chọn thêm")
    note: Optional[str] = None


class DiscountLine(BaseModel):
    """1 dòng chiết khấu (CK gốc theo phương án, hoặc 1 addon)."""

    label: str
    pct: float
    amount: float


class PolicyMilestoneOut(BaseModel):
    label: str
    kind: str
    pct: float
    amount: float
    needs_confirm: bool = False
    deposit_deducted: bool = False  # True: đợt này đã được trừ khoản đặt cọc


class PolicyQuoteResponse(BaseModel):
    quote_id: str
    unit_id: str
    customer_name: str
    sale_name: str
    base_plan: str
    base_plan_label: str
    list_price_ex_vat: float  # GTSP chưa VAT
    discount_lines: list[DiscountLine]
    total_discount_pct: float
    total_discount_amount: float
    price_after_discount: float
    vat_pct: float
    vat_amount: float
    maintenance_pct: float
    maintenance_amount: float
    total_payment: float
    milestones: list[PolicyMilestoneOut]
    pdf_url: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Seed mặc định (lần đầu) — TỶ LỆ ĐỢT LÀ TẠM, chờ CĐT/admin xác nhận
# ---------------------------------------------------------------------------

# Đặt cọc thiện chí cố định (VND).
_DEPOSIT = 200_000_000.0


def default_config() -> SalesPolicyConfig:
    """Bản chính sách mặc định MỚI (tránh chia sẻ object mutable).

    ⚠️ % các đợt (đặc biệt đợt cuối "Nhận nhà/Bàn giao") là TẠM để tổng = 100%;
    admin chỉnh lại theo chính sách thực tế của CĐT trong trang Cấu hình.
    """
    twelve = [
        PolicyMilestone(
            label=f"Đợt {i} (mỗi 45 ngày)", kind="pct", pct=5.0,
            days_offset=45 * i, needs_confirm=True,
        )
        for i in range(1, 13)
    ]
    return SalesPolicyConfig(
        vat_pct=10.0,
        maintenance_pct=2.0,
        note=(
            "Tỷ lệ các đợt thanh toán là TẠM (đặc biệt đợt 'Nhận nhà/Bàn giao') — "
            "vui lòng cập nhật theo chính sách chính thức của Chủ đầu tư."
        ),
        base_plans=[
            BasePlan(
                key="chuan", label="Thanh toán chuẩn", base_discount_pct=5.0,
                schedule=[
                    PolicyMilestone(label="Đặt cọc thiện chí", kind="amount_fixed", amount=_DEPOSIT),
                    PolicyMilestone(label="Ký HĐMB", kind="pct", pct=10.0),
                    *twelve,
                    PolicyMilestone(
                        label="Nhận nhà / Bàn giao", kind="pct", pct=30.0, needs_confirm=True,
                    ),
                ],
            ),
            BasePlan(
                key="som", label="Thanh toán sớm", base_discount_pct=12.0,
                schedule=[
                    PolicyMilestone(label="Đặt cọc thiện chí", kind="amount_fixed", amount=_DEPOSIT),
                    PolicyMilestone(label="Ký HĐMB", kind="pct", pct=10.0),
                    PolicyMilestone(label="Đợt 1 (45 ngày)", kind="pct", pct=5.0, days_offset=45),
                    PolicyMilestone(label="Đợt 2 (90 ngày)", kind="pct", pct=5.0, days_offset=90),
                    PolicyMilestone(label="Đợt 3 (135 ngày)", kind="pct", pct=5.0, days_offset=135),
                    PolicyMilestone(label="Đợt 4 (180 ngày)", kind="pct", pct=5.0, days_offset=180),
                    PolicyMilestone(
                        label="Nhận nhà / Bàn giao", kind="pct", pct=70.0, needs_confirm=True,
                    ),
                ],
            ),
            BasePlan(
                key="vay", label="Vay ngân hàng", base_discount_pct=5.0,
                schedule=[
                    PolicyMilestone(label="Đặt cọc thiện chí", kind="amount_fixed", amount=_DEPOSIT),
                    PolicyMilestone(label="Vốn tự có khi ký HĐMB", kind="pct", pct=20.0),
                    PolicyMilestone(label="Đợt 1 (45 ngày)", kind="pct", pct=5.0, days_offset=45),
                    PolicyMilestone(label="Đợt 2 (90 ngày)", kind="pct", pct=5.0, days_offset=90),
                    PolicyMilestone(
                        label="Ngân hàng giải ngân (vay)", kind="pct", pct=70.0, needs_confirm=True,
                    ),
                ],
            ),
        ],
        addons=[
            PolicyAddon(key="early_bird", label="Early bird (đặt sớm)", pct=2.0),
            PolicyAddon(key="qua_he", label="Quà hè", pct=1.5),
            PolicyAddon(key="dau_tu", label="Ưu đãi đầu tư", pct=2.0),
        ],
    )
