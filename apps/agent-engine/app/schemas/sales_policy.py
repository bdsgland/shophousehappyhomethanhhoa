"""Schema "Chính sách bán hàng" — cấu hình chiết khấu CHỒNG TUẦN TỰ + 3 tiến độ,
khớp ĐÚNG mẫu phiếu tính giá Excel của Chủ đầu tư (sheet "PTG public").

Lưu 1 object `SalesPolicyConfig` (JSON store, core/sales_policy_store.py, version+
backup). Admin chỉnh qua /admin/sales-policy.

Mô hình giá (per-unit lấy từ bảng hàng — N/VAT/KPBT/GT xây):
  F12 = N  (TGT niêm yết gồm VAT, KPBT)
  F32 = K  (VAT, số tiền) ; F33 = L (KPBT, số tiền) ; F31 = P (GT xây NY)
  F13 = N − K − L                      (niêm yết CHƯA VAT, CHƯA KPBT)
  Chiết khấu CHỒNG TUẦN TỰ (ROUND từng bước, trên phần CÒN LẠI của F13):
    F17 = quà tặng tiền mặt (default 0)
    F20 = ROUND((F13−F17)            × early_bird%)
    F21 = ROUND((F13−F17−F20)        × qua_he%)
    F22 = ROUND((F13−F17−F20−F21)    × dau_tu%)
    F23 = ROUND((F13−F17−F20−F21−F22)× r)   r = payment_discount_pct theo phương án
    F24 = 0 (CK khác)
    F16 = F17 + (F20+F21+F22+F23+F24)        (tổng giảm giá)
  F28 = N − L − F16   (GT sản phẩm gồm VAT, CHƯA KPBT) — gốc áp tiến độ
  F26 = F28 + L       (GT sản phẩm gồm VAT, KPBT) — GIÁ CUỐI khách trả
  F27 = F26 / diện tích (đơn giá)
  F29 = N − P − L − F16 (GT đất)
  O   = (N − L) × 5%   (5% GT HĐMB — đợt "5% HĐMB")

3 tiến độ (đợt %·F28; cọc trừ vào đợt 1; xem services/pricing_policy.py).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Loại đợt thanh toán trong tiến độ.
MilestoneKind = Literal[
    "deposit_fixed",   # cọc thiện chí (số tiền cố định = config.deposit_amount)
    "pct_f28",         # pct × F28 (đợt thường); deduct_deposit=True → trừ cọc
    "balance_100",     # luỹ kế 100%: F26 − Σ(đợt trước) − O
    "balance_partial", # luỹ kế phần KH (htls): ROUND(pct%·F28 − Σtrước − O + F33)
    "five_pct_hdmb",   # 5% HĐMB = O = (N−L)×5%
    "bank_70",         # ngân hàng giải ngân: pct × F28 (cột NH, không tính KH)
]


# ---------------------------------------------------------------------------
# Cấu hình chính sách (admin sửa được)
# ---------------------------------------------------------------------------

class PolicyMilestone(BaseModel):
    label: str
    kind: MilestoneKind = "pct_f28"
    pct: float = 0.0  # cho pct_f28 / balance_partial / bank_70
    days_offset: Optional[int] = None  # mốc ngày (hiển thị)
    deduct_deposit: bool = False  # đợt này trừ khoản cọc thiện chí (đợt 1)


class BasePlan(BaseModel):
    """1 phương án thanh toán (thuong / som95 / htls)."""

    key: str
    label: str
    payment_discount_pct: float = 0.0  # r — CK thanh toán (F23)
    enabled: bool = True
    schedule: list[PolicyMilestone] = Field(default_factory=list)


class PolicyAddon(BaseModel):
    """1 ưu đãi chiết khấu chồng tuần tự (early_bird / qua_he / dau_tu)."""

    key: str
    label: str
    pct: float = 0.0
    enabled: bool = True  # "Áp dụng / Không" trong chính sách


class SalesPolicyConfig(BaseModel):
    base_plans: list[BasePlan]
    addons: list[PolicyAddon]
    deposit_amount: float = 200_000_000.0  # cọc thiện chí (VND)
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
    unit_id: str = Field(description="Mã căn trong quỹ hàng")
    customer_name: str = Field(min_length=1)
    customer_phone: str = ""
    sale_name: str = ""
    sale_phone: str = ""
    base_plan: str = Field(description="key phương án: thuong | som95 | htls")
    addons: list[str] = Field(default_factory=list, description="key ưu đãi áp dụng")
    gift_cash: float = 0.0  # F17 — quà tặng tiền mặt (VND)
    note: Optional[str] = None


class DiscountLine(BaseModel):
    """1 dòng chiết khấu (F20..F24)."""

    key: str
    label: str
    pct: float
    amount: float


class PolicyMilestoneOut(BaseModel):
    label: str
    kind: str
    days_offset: Optional[int] = None
    pct: float = 0.0
    customer_amount: float = 0.0  # KH thanh toán
    bank_amount: float = 0.0      # NH giải ngân (htls)


class PolicyQuoteResponse(BaseModel):
    quote_id: str
    unit_id: str
    customer_name: str
    sale_name: str
    base_plan: str
    base_plan_label: str
    dien_tich: float
    # Niêm yết & breakdown
    gia_ny_gom_vat_kpbt: float   # F12 = N
    vat: float                   # F32 = K
    kpbt: float                  # F33 = L
    gt_xay: float                # F31 = P
    niem_yet_chua_vat_kpbt: float  # F13
    # Chiết khấu
    gift_cash: float             # F17
    discount_lines: list[DiscountLine]  # F20..F24
    total_discount: float        # F16
    # Giá sản phẩm
    gtsp_gom_vat_chua_kpbt: float  # F28
    gtsp_final: float            # F26 (giá cuối)
    don_gia: float               # F27
    gt_dat: float                # F29
    five_pct_hdmb: float         # O
    # Tiến độ
    milestones: list[PolicyMilestoneOut]
    bank_total: float = 0.0      # tổng NH giải ngân (htls)
    pdf_url: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Seed mặc định — khớp 3 tiến độ trong mẫu CĐT
# ---------------------------------------------------------------------------

def _pct(label: str, pct: float, days: int, deduct: bool = False) -> PolicyMilestone:
    return PolicyMilestone(
        label=label, kind="pct_f28", pct=pct, days_offset=days, deduct_deposit=deduct
    )


def default_config() -> SalesPolicyConfig:
    """Bản chính sách mặc định MỚI (khớp mẫu Excel). Admin chỉnh được mọi %."""
    # --- THANH TOÁN THƯỜNG (chuẩn, r=5%) ---
    thuong = [
        PolicyMilestone(label="Đặt cọc thiện chí", kind="deposit_fixed"),
        _pct("Đợt 1 — Ký HĐMB (10%)", 10.0, 0, deduct=True),
    ]
    thuong += [_pct(f"Đợt {i} (5%)", 5.0, 45 * (i - 1)) for i in range(2, 12)]  # đợt 2..11
    thuong += [
        _pct("Đợt 12 (10%)", 10.0, 45 * 11),
        _pct("Đợt 13 (10%)", 10.0, 45 * 12),
        PolicyMilestone(label="Luỹ kế 100% — Nhận nhà/Bàn giao", kind="balance_100",
                        days_offset=45 * 13),
        PolicyMilestone(label="5% còn lại khi có thông báo ra sổ (5% HĐMB)",
                        kind="five_pct_hdmb"),
    ]

    # --- THANH TOÁN SỚM 95% (som95, r=12%) ---
    som95 = [
        PolicyMilestone(label="Đặt cọc thiện chí", kind="deposit_fixed"),
        _pct("Đợt 1 — Ký HĐMB (10%)", 10.0, 0, deduct=True),
        _pct("Đợt 2 (5%)", 5.0, 45),
        _pct("Đợt 3 (5%)", 5.0, 90),
        _pct("Đợt 4 (5%)", 5.0, 135),
        _pct("Đợt 5 (5%)", 5.0, 180),
        PolicyMilestone(label="Luỹ kế 100% (180 ngày)", kind="balance_100",
                        days_offset=180),
        PolicyMilestone(label="5% HĐMB (khi ra sổ)", kind="five_pct_hdmb"),
    ]

    # --- HỖ TRỢ LÃI SUẤT NGÂN HÀNG (htls, r=0%) ---
    htls = [
        PolicyMilestone(label="Đặt cọc thiện chí", kind="deposit_fixed"),
        _pct("Đợt 1 — Ký HĐMB (10%)", 10.0, 0, deduct=True),
        _pct("Đợt 2 (5%)", 5.0, 45),
        _pct("Đợt 3 (5%)", 5.0, 90),
        _pct("Đợt 4 (5%)", 5.0, 135),
        PolicyMilestone(label="Luỹ kế 30% — vốn tự có (180 ngày)", kind="balance_partial",
                        pct=30.0, days_offset=180),
        PolicyMilestone(label="Ngân hàng giải ngân 70%", kind="bank_70", pct=70.0,
                        days_offset=180),
        PolicyMilestone(label="5% HĐMB (khi ra sổ)", kind="five_pct_hdmb"),
    ]

    return SalesPolicyConfig(
        deposit_amount=200_000_000.0,
        note=(
            "Chiết khấu chồng tuần tự trên giá niêm yết chưa VAT/KPBT; VAT, KPBT, "
            "giá trị xây lấy theo bảng hàng từng căn. Tỷ lệ đợt khớp mẫu CĐT — "
            "admin chỉnh nếu chính sách thay đổi."
        ),
        base_plans=[
            BasePlan(key="thuong", label="Thanh toán thường", payment_discount_pct=5.0,
                     schedule=thuong),
            BasePlan(key="som95", label="Thanh toán sớm 95%", payment_discount_pct=12.0,
                     schedule=som95),
            BasePlan(key="htls", label="Hỗ trợ lãi suất ngân hàng",
                     payment_discount_pct=0.0, schedule=htls),
        ],
        addons=[
            PolicyAddon(key="early_bird", label="Early Bird", pct=2.0),
            PolicyAddon(key="qua_he", label="Chào Hè", pct=1.5),
            PolicyAddon(key="dau_tu", label="Ưu đãi đầu tư", pct=2.0),
        ],
    )
