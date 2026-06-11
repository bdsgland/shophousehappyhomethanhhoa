"""Pydantic schema cho module TÀI CHÍNH (admin).

  • Cost            — 1 khoản chi phí (đã lưu, có id/timestamps).
  • CostIn          — body tạo/sửa chi phí.
  • ManualRevenue   — 1 khoản doanh thu nhập tay (đã lưu).
  • ManualRevenueIn — body tạo/sửa doanh thu thủ công.
  • RevenueItem     — 1 dòng doanh thu tổng hợp (hoa hồng / deal / thủ công).
  • Các model tổng hợp: PeriodSummary, MonthlyPoint, CostCategorySlice,
    FinanceOverview, FinanceForecast, FinanceAIAnalysis.

Doanh thu THẬT lấy tự động từ hoa hồng (commission_store) — phần công ty nhận
được trên mỗi deal chốt; module này không tự bịa số. Chi phí do admin nhập.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

# Hạng mục chi phí hợp lệ (đồng bộ với FE select).
COST_CATEGORIES: tuple[str, ...] = (
    "nền tảng",
    "marketing",
    "nhân sự",
    "vận hành",
    "khác",
)
# Kiểu lặp lại của chi phí.
RECURRENCE_KINDS: tuple[str, ...] = ("monthly", "one_off")


class CostIn(BaseModel):
    """Body tạo / cập nhật một khoản chi phí."""

    category: str = Field(description="nền tảng|marketing|nhân sự|vận hành|khác")
    name: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0, description="Số tiền (VND)")
    recurring: str = Field(default="monthly", description="monthly|one_off")
    date: str = Field(description="Ngày phát sinh / bắt đầu (YYYY-MM-DD)")
    note: Optional[str] = Field(default="", max_length=500)


class Cost(CostIn):
    """Khoản chi phí đã lưu."""

    id: str
    created_at: str
    updated_at: Optional[str] = None


class ManualRevenueIn(BaseModel):
    """Body tạo / cập nhật doanh thu nhập tay (khoản ngoài hoa hồng tự động)."""

    name: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0, description="Số tiền (VND)")
    date: str = Field(description="Ngày ghi nhận (YYYY-MM-DD)")
    source: Optional[str] = Field(default="khác", max_length=80)
    note: Optional[str] = Field(default="", max_length=500)


class ManualRevenue(ManualRevenueIn):
    """Khoản doanh thu thủ công đã lưu."""

    id: str
    created_at: str
    updated_at: Optional[str] = None


class RevenueItem(BaseModel):
    """1 dòng doanh thu đã tổng hợp để liệt kê / dựng biểu đồ."""

    source: str = Field(description="commission|manual|deal")
    source_label: str
    ref_id: Optional[str] = None
    label: str
    amount: float
    date: str  # YYYY-MM-DD
    meta: dict = Field(default_factory=dict)


class PeriodSummary(BaseModel):
    """Doanh thu / chi phí / lợi nhuận của 1 kỳ."""

    period_label: str
    start: str
    end: str
    revenue: float
    cost: float
    profit: float
    margin: float = Field(description="Biên lợi nhuận % (profit/revenue*100)")
    deal_count: int = 0
    customer_count: int = 0


class MonthlyPoint(BaseModel):
    month: str  # YYYY-MM
    revenue: float
    cost: float
    profit: float


class CostCategorySlice(BaseModel):
    category: str
    amount: float
    percentage: float


class FinanceOverview(BaseModel):
    summary: PeriodSummary
    monthly: list[MonthlyPoint]
    cost_breakdown: list[CostCategorySlice]
    revenue_breakdown: dict  # {commission: x, manual: y}


class FinanceForecast(BaseModel):
    next_period_label: str
    revenue: float
    cost: float
    profit: float
    method: str


class FinanceAIAnalysis(BaseModel):
    source: str = Field(description="ai|fallback")
    summary: str
    forecast: FinanceForecast
    period_label: str
    generated_at: str
