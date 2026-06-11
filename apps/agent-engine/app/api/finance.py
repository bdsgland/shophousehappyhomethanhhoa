"""API TÀI CHÍNH (admin) — chi phí, doanh thu, lợi nhuận + phân tích AI.

  GET    /admin/finance/overview?period=month|quarter|year&months_back=12
         → KPI kỳ + chuỗi tháng (DT/CP/LN) + cơ cấu chi phí + tách nguồn DT.
  GET    /admin/finance/summary?period=...        → tóm tắt 1 kỳ (KPI).
  GET    /admin/finance/monthly?months_back=12    → chuỗi theo tháng.

  GET    /admin/finance/costs                      → danh sách chi phí.
  POST   /admin/finance/costs                      → tạo chi phí.
  PATCH  /admin/finance/costs/{cost_id}            → sửa chi phí.
  DELETE /admin/finance/costs/{cost_id}            → xoá chi phí.

  GET    /admin/finance/revenue?period=...         → các dòng doanh thu tổng hợp
         (hoa hồng + thủ công) + tổng. ?all=true bỏ lọc kỳ.
  POST   /admin/finance/revenue                    → thêm doanh thu thủ công.
  PATCH  /admin/finance/revenue/{rev_id}           → sửa doanh thu thủ công.
  DELETE /admin/finance/revenue/{rev_id}           → xoá doanh thu thủ công.

  POST   /admin/finance/ai-analysis?period=...     → Claude phân tích + dự báo
         (fallback heuristic khi thiếu API key).

Auth: require_admin (đúng convention admin_commission.py). Doanh thu lấy THẬT từ
hoa hồng (commission_store) + deal chốt; chi phí do admin nhập (seed mẫu lần đầu).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import require_admin
from app.core import finance_ai, finance_service, finance_store
from app.schemas.finance import (
    Cost,
    CostIn,
    FinanceAIAnalysis,
    FinanceOverview,
    ManualRevenue,
    ManualRevenueIn,
    PeriodSummary,
)

router = APIRouter(prefix="/admin/finance", tags=["admin", "finance"])


def _parse_month_key(month: str | None) -> date | None:
    """'YYYY-MM' → date ngày 1 của tháng đó (để tính theo tháng cụ thể)."""
    if not month:
        return None
    try:
        return date(int(month[:4]), int(month[5:7]), 1)
    except (ValueError, TypeError, IndexError):
        return None


# ---------------------------------------------------------------------------
# Tổng quan / KPI / chuỗi tháng
# ---------------------------------------------------------------------------

@router.get("/overview")
def get_overview(
    period: str = Query(default="month", description="month|quarter|year|YYYY-MM"),
    months_back: int = Query(default=12, ge=1, le=36),
    _admin: dict = Depends(require_admin),
) -> FinanceOverview:
    return finance_service.overview(period, months_back)


@router.get("/summary")
def get_summary(
    period: str = Query(default="month"),
    _admin: dict = Depends(require_admin),
) -> PeriodSummary:
    return finance_service.period_summary(period)


@router.get("/monthly")
def get_monthly(
    months_back: int = Query(default=12, ge=1, le=36),
    _admin: dict = Depends(require_admin),
) -> dict:
    return {"monthly": finance_service.monthly_series(months_back)}


# ---------------------------------------------------------------------------
# Chi phí — CRUD
# ---------------------------------------------------------------------------

@router.get("/costs")
def list_costs(_admin: dict = Depends(require_admin)) -> dict:
    items = finance_store.list_costs()
    return {"costs": items, "count": len(items)}


@router.post("/costs", status_code=status.HTTP_201_CREATED)
def create_cost(payload: CostIn, _admin: dict = Depends(require_admin)) -> Cost:
    try:
        return finance_store.create_cost(payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/costs/{cost_id}")
def update_cost(
    cost_id: str, payload: CostIn, _admin: dict = Depends(require_admin)
) -> Cost:
    try:
        updated = finance_store.update_cost(cost_id, payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khoản chi phí")
    return updated


@router.delete("/costs/{cost_id}")
def delete_cost(cost_id: str, _admin: dict = Depends(require_admin)) -> dict:
    if not finance_store.delete_cost(cost_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy khoản chi phí")
    return {"ok": True, "id": cost_id}


# ---------------------------------------------------------------------------
# Doanh thu — liệt kê tổng hợp + CRUD thủ công
# ---------------------------------------------------------------------------

@router.get("/revenue")
def list_revenue(
    period: str = Query(default="month"),
    all: bool = Query(default=False, description="Bỏ lọc kỳ, lấy toàn bộ"),
    _admin: dict = Depends(require_admin),
) -> dict:
    items = finance_service.revenue_items()
    if not all:
        start, end, _label = finance_service.period_range(period)
        months = set(finance_service._months_between(start, end))
        filtered = []
        for it in items:
            d = finance_service._parse_date(it["date"])
            if d and finance_service._month_key(d) in months:
                filtered.append(it)
        items = filtered
    total = round(sum(float(i["amount"] or 0) for i in items), 2)
    return {
        "items": items,
        "count": len(items),
        "total": total,
        "manual": finance_store.list_manual_revenue(),
    }


@router.post("/revenue", status_code=status.HTTP_201_CREATED)
def create_manual_revenue(
    payload: ManualRevenueIn, _admin: dict = Depends(require_admin)
) -> ManualRevenue:
    return finance_store.create_manual_revenue(payload.model_dump())


@router.patch("/revenue/{rev_id}")
def update_manual_revenue(
    rev_id: str, payload: ManualRevenueIn, _admin: dict = Depends(require_admin)
) -> ManualRevenue:
    updated = finance_store.update_manual_revenue(rev_id, payload.model_dump())
    if updated is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khoản doanh thu")
    return updated


@router.delete("/revenue/{rev_id}")
def delete_manual_revenue(
    rev_id: str, _admin: dict = Depends(require_admin)
) -> dict:
    if not finance_store.delete_manual_revenue(rev_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy khoản doanh thu")
    return {"ok": True, "id": rev_id}


# ---------------------------------------------------------------------------
# Phân tích AI
# ---------------------------------------------------------------------------

@router.post("/ai-analysis")
async def ai_analysis(
    period: str = Query(default="month"),
    _admin: dict = Depends(require_admin),
) -> FinanceAIAnalysis:
    return await finance_ai.analyze(period)
