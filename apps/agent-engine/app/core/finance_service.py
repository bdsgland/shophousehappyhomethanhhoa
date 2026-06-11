"""Tổng hợp TÀI CHÍNH — doanh thu / chi phí / lợi nhuận theo kỳ + chuỗi tháng.

Nguồn DOANH THU (ưu tiên số THẬT, không bịa):
  • Hoa hồng (commission_store): mỗi deal chốt n8n gửi về có `commission_pool`
    = phần hoa hồng CÔNG TY nhận → đây chính là doanh thu của nhà môi giới.
  • Doanh thu nhập tay (finance_store.manual_revenue) — khoản ngoài hoa hồng.
  • Số khách đã chốt (lead status=customer) dùng làm chỉ số tham chiếu.

CHI PHÍ: do admin nhập (finance_store.costs). Chi phí `monthly` được tính cho
MỌI tháng kể từ tháng bắt đầu; `one_off` chỉ tính đúng tháng phát sinh.

Mọi phép cộng dồn quy về "rổ tháng" (YYYY-MM) để doanh thu và chi phí nhất quán.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Optional

from app.core import commission_store, finance_store

# user_store / lead_store import mềm để tránh lỗi vòng / thiếu module khi test.


def _today() -> date:
    return datetime.utcnow().date()


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _add_months(d: date, n: int) -> date:
    """Cộng/trừ n tháng, neo về ngày 1 (đủ cho thao tác rổ tháng)."""
    total = (d.year * 12 + (d.month - 1)) + n
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def _months_between(start: date, end: date) -> list[str]:
    """Danh sách YYYY-MM từ tháng `start` đến tháng `end` (bao gồm 2 đầu)."""
    cur = start.replace(day=1)
    last = end.replace(day=1)
    out: list[str] = []
    while cur <= last:
        out.append(_month_key(cur))
        cur = _add_months(cur, 1)
    return out


# ---------------------------------------------------------------------------
# Kỳ (period) → danh sách rổ tháng
# ---------------------------------------------------------------------------

def period_range(period: str, ref: Optional[date] = None) -> tuple[date, date, str]:
    """Trả (start_date, end_date, label) cho 'month' | 'quarter' | 'year' | 'YYYY-MM'."""
    ref = ref or _today()
    p = (period or "month").lower().strip()

    # Tháng cụ thể "YYYY-MM"
    if len(p) == 7 and p[4] == "-" and p[:4].isdigit():
        try:
            y, m = int(p[:4]), int(p[5:7])
            start = date(y, m, 1)
            end = date(y, m, calendar.monthrange(y, m)[1])
            return start, end, f"Tháng {m:02d}/{y}"
        except ValueError:
            pass

    if p == "quarter":
        q = (ref.month - 1) // 3
        start = date(ref.year, q * 3 + 1, 1)
        end_month = q * 3 + 3
        end = date(ref.year, end_month, calendar.monthrange(ref.year, end_month)[1])
        return start, end, f"Quý {q + 1}/{ref.year}"

    if p == "year":
        return date(ref.year, 1, 1), date(ref.year, 12, 31), f"Năm {ref.year}"

    # mặc định: tháng hiện tại
    start = date(ref.year, ref.month, 1)
    end = date(ref.year, ref.month, calendar.monthrange(ref.year, ref.month)[1])
    return start, end, f"Tháng {ref.month:02d}/{ref.year}"


# ---------------------------------------------------------------------------
# Doanh thu — tổng hợp từ hoa hồng + thủ công
# ---------------------------------------------------------------------------

def _sale_name(sale_id: Optional[str]) -> str:
    if not sale_id:
        return ""
    try:
        from app.core import user_store

        u = user_store.find_by_id(sale_id)
        return (u.get("full_name") if u else "") or ""
    except Exception:  # noqa: BLE001 — thiếu module không chặn tổng hợp
        return ""


def revenue_items() -> list[dict]:
    """Mọi dòng doanh thu (hoa hồng + thủ công) chuẩn hoá để liệt kê / dựng chart."""
    items: list[dict] = []

    for r in commission_store.list_records(limit=100000):
        pool = float(r.get("commission_pool") or 0)
        if pool <= 0:
            continue
        d = (r.get("saved_at") or r.get("approved_at") or "")[:10] or _today().isoformat()
        deal_id = str(r.get("deal_id") or "")
        sname = _sale_name(r.get("sale_id"))
        label = f"Hoa hồng deal {deal_id[:8]}" + (f" · {sname}" if sname else "")
        items.append(
            {
                "source": "commission",
                "source_label": "Hoa hồng",
                "ref_id": deal_id,
                "label": label,
                "amount": pool,
                "date": d,
                "meta": {
                    "deal_amount": r.get("deal_amount"),
                    "sale_id": r.get("sale_id"),
                    "status": r.get("status"),
                },
            }
        )

    for r in finance_store.list_manual_revenue():
        items.append(
            {
                "source": "manual",
                "source_label": "Thủ công",
                "ref_id": r.get("id"),
                "label": r.get("name") or "Doanh thu thủ công",
                "amount": float(r.get("amount") or 0),
                "date": (r.get("date") or "")[:10] or _today().isoformat(),
                "meta": {"source": r.get("source"), "note": r.get("note")},
            }
        )

    items.sort(key=lambda x: x["date"], reverse=True)
    return items


def _customer_count() -> int:
    """Số lead đã chốt (status=customer) — chỉ số tham chiếu."""
    try:
        from app.core import lead_store

        page = lead_store.list_all_leads(page=1, page_size=100000)
        return sum(1 for l in page.get("items", []) if l.get("status") == "customer")
    except Exception:  # noqa: BLE001
        return 0


# ---------------------------------------------------------------------------
# Chi phí — quy đổi theo rổ tháng
# ---------------------------------------------------------------------------

def _cost_for_month(cost: dict, month_key: str) -> float:
    """Số tiền chi phí `cost` tính vào tháng `month_key` (YYYY-MM)."""
    d = _parse_date(cost.get("date"))
    if not d:
        return 0.0
    start_month = _month_key(d)
    amount = float(cost.get("amount") or 0)
    if cost.get("recurring") == "monthly":
        # Lặp hàng tháng kể từ tháng bắt đầu trở đi.
        return amount if month_key >= start_month else 0.0
    # one_off: chỉ đúng tháng phát sinh.
    return amount if month_key == start_month else 0.0


def cost_for_months(costs: list[dict], months: list[str]) -> float:
    return sum(_cost_for_month(c, m) for c in costs for m in months)


def cost_breakdown(costs: list[dict], months: list[str]) -> list[dict]:
    """Cơ cấu chi phí theo hạng mục trong các tháng đã cho."""
    by_cat: dict[str, float] = {}
    for c in costs:
        cat = c.get("category", "khác")
        by_cat[cat] = by_cat.get(cat, 0.0) + sum(_cost_for_month(c, m) for m in months)
    total = sum(by_cat.values())
    out = [
        {
            "category": cat,
            "amount": round(amt, 2),
            "percentage": round(amt / total * 100, 1) if total > 0 else 0.0,
        }
        for cat, amt in by_cat.items()
        if amt > 0
    ]
    out.sort(key=lambda x: x["amount"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Tổng hợp kỳ + chuỗi tháng
# ---------------------------------------------------------------------------

def _revenue_for_months(items: list[dict], months: set[str]) -> tuple[float, float, float, int]:
    """Trả (total, commission, manual, deal_count) trong tập tháng."""
    total = commission = manual = 0.0
    deals = 0
    for it in items:
        d = _parse_date(it["date"])
        if not d or _month_key(d) not in months:
            continue
        amt = float(it["amount"] or 0)
        total += amt
        if it["source"] == "commission":
            commission += amt
            deals += 1
        else:
            manual += amt
    return total, commission, manual, deals


def period_summary(period: str = "month", ref: Optional[date] = None) -> dict:
    start, end, label = period_range(period, ref)
    months = _months_between(start, end)
    mset = set(months)
    items = revenue_items()
    costs = finance_store.list_costs()

    revenue, _comm, _man, deal_count = _revenue_for_months(items, mset)
    cost = cost_for_months(costs, months)
    profit = revenue - cost
    margin = round(profit / revenue * 100, 1) if revenue > 0 else 0.0

    return {
        "period_label": label,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "revenue": round(revenue, 2),
        "cost": round(cost, 2),
        "profit": round(profit, 2),
        "margin": margin,
        "deal_count": deal_count,
        "customer_count": _customer_count(),
    }


def monthly_series(months_back: int = 12, ref: Optional[date] = None) -> list[dict]:
    """Chuỗi doanh thu/chi phí/lợi nhuận `months_back` tháng gần nhất (đến tháng hiện tại)."""
    ref = ref or _today()
    end = ref.replace(day=1)
    start = _add_months(end, -(max(1, months_back) - 1))
    months = _months_between(start, end)
    items = revenue_items()
    costs = finance_store.list_costs()

    out: list[dict] = []
    for m in months:
        rev, _c, _mn, _d = _revenue_for_months(items, {m})
        cst = cost_for_months(costs, [m])
        out.append(
            {
                "month": m,
                "revenue": round(rev, 2),
                "cost": round(cst, 2),
                "profit": round(rev - cst, 2),
            }
        )
    return out


def overview(period: str = "month", months_back: int = 12, ref: Optional[date] = None) -> dict:
    start, end, _label = period_range(period, ref)
    months = _months_between(start, end)
    mset = set(months)
    items = revenue_items()
    costs = finance_store.list_costs()

    _rev, commission, manual, _d = _revenue_for_months(items, mset)

    return {
        "summary": period_summary(period, ref),
        "monthly": monthly_series(months_back, ref),
        "cost_breakdown": cost_breakdown(costs, months),
        "revenue_breakdown": {
            "commission": round(commission, 2),
            "manual": round(manual, 2),
        },
    }


def forecast(period: str = "month", ref: Optional[date] = None) -> dict:
    """Dự báo kỳ TỚI bằng hồi quy tuyến tính đơn giản trên chuỗi tháng gần đây.

    Dùng tối đa 6 tháng gần nhất; nếu < 2 điểm thì lấy trung bình. Quy đổi theo
    độ dài kỳ (tháng=1, quý=3, năm=12) để con số phản ánh đúng phạm vi kỳ tới.
    """
    series = monthly_series(6, ref)
    p = (period or "month").lower()
    span = 3 if p == "quarter" else (12 if p == "year" else 1)

    def _next(values: list[float]) -> float:
        vals = [v for v in values]
        if not vals:
            return 0.0
        if len(vals) == 1:
            return vals[0]
        # hệ số góc trung bình (least-squares slope với x=0..n-1)
        n = len(vals)
        xs = list(range(n))
        mean_x = sum(xs) / n
        mean_y = sum(vals) / n
        denom = sum((x - mean_x) ** 2 for x in xs) or 1.0
        slope = sum((xs[i] - mean_x) * (vals[i] - mean_y) for i in range(n)) / denom
        nxt = vals[-1] + slope
        return max(0.0, nxt)

    rev_next = _next([s["revenue"] for s in series]) * span
    cost_next = _next([s["cost"] for s in series]) * span
    next_label = {
        "quarter": "Quý tới",
        "year": "Năm tới",
    }.get(p, "Tháng tới")

    return {
        "next_period_label": next_label,
        "revenue": round(rev_next, 2),
        "cost": round(cost_next, 2),
        "profit": round(rev_next - cost_next, 2),
        "method": "Hồi quy tuyến tính trên ≤6 tháng gần nhất",
    }
