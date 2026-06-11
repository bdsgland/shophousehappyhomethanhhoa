import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Gộp className có điều kiện + merge xung đột Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Định dạng số kiểu Việt Nam (1.234). */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

/** Định dạng tiền tỷ đồng (2.5 tỷ). */
export function formatTy(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)} tỷ`;
}

/** Tiền VND đầy đủ (1.234.567 ₫). */
export function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫`;
}

/** Tiền VND rút gọn cho thẻ KPI (1,2 tỷ / 850 tr / 12 ng). */
export function formatVndShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (v: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v);
  if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)} tr`;
  if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)} ng`;
  return `${sign}${fmt(abs)} ₫`;
}

/** Tháng YYYY-MM → MM/YYYY. */
export function shortMonth(ym: string): string {
  const [y, m] = (ym || "").split("-");
  if (!y || !m) return ym;
  return `${m}/${y}`;
}

/** Ngày ngắn gọn dd/MM. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
