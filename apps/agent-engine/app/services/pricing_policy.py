"""Engine tính phiếu giá theo Chính sách bán hàng (đọc % từ store, KHÔNG hardcode).

Công thức (chốt với người dùng):
  1. Chiết khấu tính trên GTSP CHƯA VAT (list_price_ex_vat).
  2. total_discount_pct = base_discount_pct(phương án) + Σ pct(addon được chọn)  [cộng dồn %]
  3. price_after_discount = ex_vat × (1 − total_discount_pct/100)
  4. vat = price_after_discount × vat_pct/100
     maintenance = price_after_discount × maintenance_pct/100
  5. total_payment = price_after_discount + vat + maintenance
  6. Tiến độ (milestones) áp lên GTSP SAU CHIẾT KHẤU (price_after_discount):
       - đợt kind="pct": giá trị đợt = price_after_discount × pct/100.
         → % các đợt cộng = 100% ⇒ tổng các đợt % = price_after_discount.
       - đợt kind="amount_fixed" (vd đặt cọc 200tr): là khoản ĐẶT CHỖ, KHÔNG tính
         vào %; được TRỪ dần vào (các) đợt % ĐẦU TIÊN. Nhờ vậy tổng tiền các đợt
         (cọc + phần còn lại của các đợt %) = price_after_discount, không cộng trùng.
     VAT và phí bảo trì hiển thị RIÊNG (không gộp vào % tiến độ) — tổng thanh toán
     thực = price_after_discount + VAT + bảo trì (xem bảng giá).

Đơn vị giá: inventory `gia_tri` theo TỶ đồng; nếu trống → fallback gia_max/gia_min
(VND) để phiếu không ra giá 0.
"""

from __future__ import annotations

from typing import Any, Optional

from app.schemas.sales_policy import SalesPolicyConfig


def list_price_ex_vat(unit: dict) -> float:
    """Giá niêm yết CHƯA VAT (VND) từ căn inventory.

    Ưu tiên `gia_tri` (tỷ đồng → ×1e9). Fallback `gia_max` rồi `gia_min` (đã VND).
    """
    gia_tri = unit.get("gia_tri")
    if gia_tri:
        try:
            return float(gia_tri) * 1_000_000_000
        except (TypeError, ValueError):
            pass
    for key in ("gia_max", "gia_min"):
        v = unit.get(key)
        if v:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return 0.0


def _find_base_plan(config: SalesPolicyConfig, key: str):
    for p in config.base_plans:
        if p.key == key and p.enabled:
            return p
    return None


def compute_policy_quote(
    *,
    list_price_ex_vat: float,
    base_key: str,
    addon_keys: list[str],
    config: SalesPolicyConfig,
) -> dict[str, Any]:
    """Tính toàn bộ phiếu giá theo chính sách. Raise ValueError nếu phương án sai."""
    base = _find_base_plan(config, base_key)
    if base is None:
        raise ValueError(f"Phương án thanh toán '{base_key}' không hợp lệ hoặc đã tắt.")

    ex_vat = max(0.0, float(list_price_ex_vat))

    discount_lines: list[dict[str, Any]] = [
        {
            "label": f"Chiết khấu phương án — {base.label}",
            "pct": base.base_discount_pct,
            "amount": ex_vat * base.base_discount_pct / 100.0,
        }
    ]
    total_discount_pct = base.base_discount_pct

    chosen = set(addon_keys or [])
    for a in config.addons:
        if a.enabled and a.key in chosen:
            discount_lines.append({
                "label": f"Ưu đãi — {a.label}",
                "pct": a.pct,
                "amount": ex_vat * a.pct / 100.0,
            })
            total_discount_pct += a.pct

    total_discount_amount = ex_vat * total_discount_pct / 100.0
    price_after_discount = ex_vat - total_discount_amount

    vat_amount = price_after_discount * config.vat_pct / 100.0
    maintenance_amount = price_after_discount * config.maintenance_pct / 100.0
    total_payment = price_after_discount + vat_amount + maintenance_amount

    # Tiến độ tính trên GTSP SAU CHIẾT KHẤU. Đợt % = base × pct/100; đợt cố định
    # (cọc) là khoản đặt chỗ, được TRỪ dần vào các đợt % đầu tiên (không cộng trùng).
    base_amount = price_after_discount
    deposit_remaining = sum(
        float(m.amount) for m in base.schedule if m.kind == "amount_fixed"
    )
    milestones: list[dict[str, Any]] = []
    for m in base.schedule:
        if m.kind == "amount_fixed":
            # Hiển thị nguyên khoản đặt cọc.
            amount = float(m.amount)
            pct = 0.0
            note_deduct = False
        else:
            pct = float(m.pct)
            gross = base_amount * pct / 100.0
            deduct = min(deposit_remaining, gross)  # trừ cọc vào đợt % đầu
            amount = gross - deduct
            deposit_remaining -= deduct
            note_deduct = deduct > 0
        milestones.append({
            "label": m.label,
            "kind": m.kind,
            "pct": pct,
            "amount": amount,
            "needs_confirm": bool(m.needs_confirm),
            "deposit_deducted": note_deduct,
        })

    return {
        "base_plan": base.key,
        "base_plan_label": base.label,
        "list_price_ex_vat": ex_vat,
        "discount_lines": discount_lines,
        "total_discount_pct": total_discount_pct,
        "total_discount_amount": total_discount_amount,
        "price_after_discount": price_after_discount,
        "vat_pct": config.vat_pct,
        "vat_amount": vat_amount,
        "maintenance_pct": config.maintenance_pct,
        "maintenance_amount": maintenance_amount,
        "total_payment": total_payment,
        "milestones": milestones,
    }
