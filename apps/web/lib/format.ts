/** Tiện ích định dạng số/tiền tệ (VND) dùng chung cho portal khách hàng. */

/** Định dạng số VND đầy đủ, ví dụ 3000000000 → "3.000.000.000 đ". */
export function formatVnd(value: number): string {
  const n = Math.round(value);
  return `${n.toLocaleString("vi-VN")} đ`;
}

/** Rút gọn theo tỷ/triệu, ví dụ 3500000000 → "3,5 tỷ", 850000000 → "850 triệu". */
export function formatShort(value: number): string {
  const v = Math.round(value);
  if (Math.abs(v) >= 1_000_000_000) {
    const ty = v / 1_000_000_000;
    return `${ty.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  }
  if (Math.abs(v) >= 1_000_000) {
    const tr = v / 1_000_000;
    return `${tr.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  }
  return v.toLocaleString("vi-VN");
}

/** Định dạng có dấu phân cách hàng nghìn (không kèm "đ"). */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

/** Bóc số nguyên từ chuỗi nhập (bỏ mọi ký tự không phải số). */
export function parseNumber(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Quy đổi giá hiển thị dạng "1.9 tỷ" / "3,6 tỷ" → số VND.
 * Dữ liệu quỹ căn trả `gia` dạng "X.Y tỷ"; `gia_tri` là số tỷ.
 */
export function parsePriceToVnd(price: string): number {
  const m = price.replace(",", ".").match(/([\d.]+)/);
  if (!m) return 0;
  const ty = parseFloat(m[1]);
  return Math.round(ty * 1_000_000_000);
}
