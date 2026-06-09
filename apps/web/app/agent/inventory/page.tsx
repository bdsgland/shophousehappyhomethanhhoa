"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Calculator, Grid } from "@/components/dashboard/icons";
import { FUND_FILTERS, STATUS_FILTERS } from "@/components/dashboard/elc-data";
import { fetchInventory, type InventoryUnit } from "@/lib/api";

const FUND_LABEL: Record<string, string> = Object.fromEntries(
  FUND_FILTERS.filter((f) => f.value).map((f) => [f.value, f.label]),
);

function fmtTy(n: number): string {
  if (!n) return "—";
  return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")} tỷ`;
}

/** Giá hiển thị: có giá chi tiết → nhãn giá hoặc quy đổi tỷ; chưa có → "Báo giá". */
function priceText(u: InventoryUnit): string {
  if (!u.has_price) return "Báo giá";
  if (u.price && u.price !== "Liên hệ") return u.price;
  return fmtTy(u.gia_ny_gom_vat_kpbt ?? 0);
}

function statusColor(s: string): string {
  if (s === "Còn hàng") return "bg-emerald-50 text-emerald-700";
  if (s === "Đặt cọc") return "bg-amber-50 text-amber-700";
  return "bg-brand-50 text-brand-600";
}

export default function SaleInventoryPage() {
  const [zone, setZone] = useState("Tất cả");
  const [status, setStatus] = useState("Tất cả");
  const [fund, setFund] = useState("");
  const [loai, setLoai] = useState("Tất cả");
  const [rows, setRows] = useState<InventoryUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    fetchInventory({ phankhu: zone, status, quy: fund, signal: ctrl.signal })
      .then((d) => alive && setRows(d ?? []))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [zone, status, fund]);

  const zones = useMemo(
    () => ["Tất cả", ...Array.from(new Set(rows.map((r) => r.zone))).sort()],
    [rows],
  );
  const loais = useMemo(
    () => ["Tất cả", ...Array.from(new Set(rows.map((r) => r.type))).sort()],
    [rows],
  );
  const shown = loai === "Tất cả" ? rows : rows.filter((r) => r.type === loai);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-900">
          <Grid size={24} className="text-orange-500" /> Bảng hàng
        </h1>
        <p className="text-sm text-brand-700">
          Quỹ căn Eurowindow Light City — lọc theo phân khu, loại, trạng thái, quỹ
          và lập phiếu tính giá nhanh.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterBox label="Phân khu" value={zone} onChange={setZone} options={zones} />
        <FilterBox label="Loại" value={loai} onChange={setLoai} options={loais} />
        <FilterBox
          label="Trạng thái"
          value={status}
          onChange={setStatus}
          options={[...STATUS_FILTERS]}
        />
        <label className="flex flex-col gap-1 text-xs font-medium text-brand-700">
          Quỹ
          <select
            value={fund}
            onChange={(e) => setFund(e.target.value)}
            className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
          >
            {FUND_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-brand-50 text-left text-xs font-bold uppercase tracking-wide text-brand-900">
              <th className="px-4 py-3">Mã căn</th>
              <th className="px-4 py-3">Phân khu</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Diện tích</th>
              <th className="px-4 py-3">Giá</th>
              <th className="px-4 py-3">Quỹ</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Phiếu giá</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-brand-500">
                  Đang tải bảng hàng…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-brand-500">
                  Không có căn phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              shown.map((u, i) => (
                <tr
                  key={u.code}
                  className={`border-t border-brand-100 ${
                    i % 2 ? "bg-white" : "bg-brand-50/30"
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-brand-900">
                    {u.code}
                  </td>
                  <td className="px-4 py-3 text-brand-700">{u.zone}</td>
                  <td className="px-4 py-3 text-brand-700">{u.type}</td>
                  <td className="px-4 py-3 text-brand-700">{u.area} m²</td>
                  <td className="px-4 py-3">
                    {u.has_price ? (
                      <span className="text-brand-700">{priceText(u)}</span>
                    ) : (
                      <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                        Báo giá
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-700">
                    {u.fund ? FUND_LABEL[u.fund] ?? u.fund : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(
                        u.status,
                      )}`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.has_price ? (
                      <Link
                        href={`/agent/learning?tab=policy&unit=${encodeURIComponent(
                          u.code,
                        )}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                      >
                        <Calculator size={14} /> Lập phiếu
                      </Link>
                    ) : (
                      <span
                        title="Chưa có giá — liên hệ báo giá"
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-brand-100 px-3 py-1.5 text-xs font-medium text-brand-400"
                      >
                        <Calculator size={14} /> Lập phiếu
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-brand-700">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
