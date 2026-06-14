"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
  KpiCard,
  fmtNum,
} from "@/components/agency/AgencyKit";
import {
  fetchInventory,
  fetchInventoryStats,
  type InventoryStats,
  type InventoryUnit,
} from "@/lib/api";

export default function AgencyAdminInventoryPage() {
  const [units, setUnits] = useState<InventoryUnit[] | null>(null);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchInventory(), fetchInventoryStats()])
      .then(([u, s]) => {
        setUnits(u);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = units ?? [];

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Bảng hàng"
        subtitle="Quỹ căn dùng chung toàn nền tảng (đọc)"
        onRefresh={load}
        refreshing={loading}
      />

      <Link
        href="/agency-admin/quote"
        className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 transition hover:border-orange-300 hover:bg-orange-100"
      >
        <div>
          <div className="text-sm font-semibold text-orange-800">
            Lập phiếu tính giá tự động
          </div>
          <div className="text-xs text-orange-700">
            Chọn căn → tính giá theo chính sách CĐT (chiết khấu, VAT, KPBT, tiến
            độ thanh toán)
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white">
          Mở phiếu →
        </span>
      </Link>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Tổng căn" value={fmtNum(stats.total)} tone="brand" />
          <KpiCard
            label="Còn trống"
            value={fmtNum(stats.available)}
            tone="emerald"
          />
          <KpiCard label="Đã giữ" value={fmtNum(stats.reserved)} tone="amber" />
          <KpiCard label="Đã bán" value={fmtNum(stats.sold)} tone="red" />
        </div>
      ) : null}

      {loading && !units ? <AgencyLoading /> : null}

      {!loading || units ? (
        <Card title="Danh sách căn">
          {rows.length === 0 ? (
            <EmptyState text="Chưa tải được quỹ căn." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-left text-brand-700">
                    <th className="py-2 pr-3 font-semibold">Mã căn</th>
                    <th className="py-2 pr-3 font-semibold">Phân khu</th>
                    <th className="py-2 pr-3 font-semibold">Loại</th>
                    <th className="py-2 pr-3 font-semibold">DT (m²)</th>
                    <th className="py-2 pr-3 font-semibold">Trạng thái</th>
                    <th className="py-2 pr-3 font-semibold">Giá</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((u) => (
                    <tr
                      key={u.code}
                      className="border-b border-brand-50 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium text-brand-900">
                        {u.code}
                      </td>
                      <td className="py-2 pr-3 text-brand-700">{u.zone}</td>
                      <td className="py-2 pr-3 text-brand-700">{u.type}</td>
                      <td className="py-2 pr-3">{fmtNum(u.area)}</td>
                      <td className="py-2 pr-3 text-brand-700">{u.status}</td>
                      <td className="py-2 pr-3 text-brand-700">{u.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
