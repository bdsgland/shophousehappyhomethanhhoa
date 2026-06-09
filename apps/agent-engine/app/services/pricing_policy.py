"""Engine tính phiếu tính giá — khớp ĐÚNG mẫu Excel CĐT (chiết khấu chồng tuần tự
+ 3 tiến độ). Đọc % từ config (KHÔNG hardcode); giá chi tiết N/VAT/KPBT/GT xây lấy
theo từng căn trong bảng hàng.

Xem công thức đầy đủ trong app/schemas/sales_policy.py (docstring).
"""

from __future__ import annotations

from typing import Any, Optional

from app.schemas.sales_policy import SalesPolicyConfig


def _r(x: float) -> float:
    """ROUND về 0 chữ số thập phân (đồng) — khớp ROUND(...,0) của Excel."""
    return float(round(x))


def get_unit_prices(unit: dict) -> Optional[dict]:
    """Lấy N (niêm yết gồm VAT+KPBT), K (VAT), L (KPBT), P (GT xây) từ unit.

    Trả None nếu THIẾU N/K/L (không đủ để tính theo mẫu). P khuyết → 0.
    """
    N = unit.get("gia_ny_gom_vat_kpbt")
    K = unit.get("vat_hdmb")
    L = unit.get("kpbt")
    if not N or K is None or L is None:
        return None
    try:
        return {
            "N": float(N),
            "K": float(K),
            "L": float(L),
            "P": float(unit.get("gt_xay_ny") or 0),
        }
    except (TypeError, ValueError):
        return None


def _find_base_plan(config: SalesPolicyConfig, key: str):
    for p in config.base_plans:
        if p.key == key and p.enabled:
            return p
    return None


def compute_policy_quote(
    *,
    prices: dict,
    dien_tich: float,
    base_key: str,
    addon_keys: list[str],
    gift_cash: float,
    config: SalesPolicyConfig,
) -> dict[str, Any]:
    """Tính toàn bộ phiếu theo mẫu. Raise ValueError nếu phương án sai."""
    base = _find_base_plan(config, base_key)
    if base is None:
        raise ValueError(f"Phương án thanh toán '{base_key}' không hợp lệ hoặc đã tắt.")

    N = prices["N"]
    K = prices["K"]
    L = prices["L"]
    P = prices.get("P", 0.0)

    F13 = N - K - L  # niêm yết chưa VAT, chưa KPBT
    F17 = max(0.0, float(gift_cash or 0))  # quà tặng tiền mặt

    # ----- Chiết khấu CHỒNG TUẦN TỰ (ROUND từng bước, trên phần còn lại) -----
    remaining = F13 - F17
    discount_lines: list[dict[str, Any]] = []
    chosen = set(addon_keys or [])
    for a in config.addons:  # thứ tự: early_bird → qua_he → dau_tu
        if a.enabled and a.key in chosen:
            amt = _r(remaining * a.pct / 100.0)
            discount_lines.append({"key": a.key, "label": a.label, "pct": a.pct, "amount": amt})
            remaining -= amt
    # CK thanh toán (F23) theo phương án
    r = base.payment_discount_pct
    f23 = _r(remaining * r / 100.0)
    discount_lines.append({
        "key": "payment", "label": f"CK thanh toán — {base.label}", "pct": r, "amount": f23,
    })
    remaining -= f23

    sum_ck = sum(d["amount"] for d in discount_lines)  # F19
    F16 = F17 + sum_ck                                  # tổng giảm giá
    F28 = N - L - F16                                   # GT SP gồm VAT, chưa KPBT
    F26 = F28 + L                                       # GIÁ CUỐI (gồm VAT + KPBT)
    F27 = (F26 / dien_tich) if dien_tich else 0.0       # đơn giá
    F29 = N - P - L - F16                               # GT đất
    O = _r((N - L) * 0.05)                              # 5% HĐMB

    # ----- Tiến độ thanh toán -----
    deposit = float(config.deposit_amount)
    milestones: list[dict[str, Any]] = []
    cust_sum = 0.0
    bank_sum = 0.0
    for m in base.schedule:
        cust = 0.0
        bank = 0.0
        if m.kind == "deposit_fixed":
            cust = deposit
        elif m.kind == "pct_f28":
            cust = _r(F28 * m.pct / 100.0)
            if m.deduct_deposit:
                cust -= deposit  # trừ cọc vào đợt 1
        elif m.kind == "balance_100":
            cust = F26 - cust_sum - O  # luỹ kế: phần còn lại (đợt 5% HĐMB theo sau)
        elif m.kind == "balance_partial":
            cust = _r(F28 * m.pct / 100.0 - cust_sum - O + L)
        elif m.kind == "bank_70":
            bank = _r(F28 * m.pct / 100.0)
        elif m.kind == "five_pct_hdmb":
            cust = O
        milestones.append({
            "label": m.label,
            "kind": m.kind,
            "days_offset": m.days_offset,
            "pct": m.pct,
            "customer_amount": cust,
            "bank_amount": bank,
        })
        cust_sum += cust
        bank_sum += bank

    return {
        "base_plan": base.key,
        "base_plan_label": base.label,
        "dien_tich": float(dien_tich or 0),
        "gia_ny_gom_vat_kpbt": N,
        "vat": K,
        "kpbt": L,
        "gt_xay": P,
        "niem_yet_chua_vat_kpbt": F13,
        "gift_cash": F17,
        "discount_lines": discount_lines,
        "total_discount": F16,
        "gtsp_gom_vat_chua_kpbt": F28,
        "gtsp_final": F26,
        "don_gia": F27,
        "gt_dat": F29,
        "five_pct_hdmb": O,
        "milestones": milestones,
        "bank_total": bank_sum,
    }
