"use client";

import { Trophy } from "@/components/dashboard/icons";
import type { SalePerformance } from "@/lib/crm";

const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardTable({
  rows,
  currentSaleId,
}: {
  rows: SalePerformance[];
  currentSaleId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-white px-6 py-12 text-center shadow-sm">
        <Trophy size={28} className="mx-auto text-brand-300" />
        <p className="mt-2 text-sm text-brand-600">Chưa có dữ liệu xếp hạng tuần này.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-brand-100 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3">
        <Trophy size={18} className="text-amber-500" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
          Bảng xếp hạng tuần
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-brand-600">
              <th className="px-4 py-2.5 text-center">#</th>
              <th className="px-4 py-2.5">Sale</th>
              <th className="px-4 py-2.5 text-center">Điểm TB</th>
              <th className="px-4 py-2.5 text-center">Khách thêm</th>
              <th className="px-4 py-2.5 text-center">Hot nhận</th>
              <th className="px-4 py-2.5 text-center">Chốt deal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const me = p.sale_id === currentSaleId;
              return (
                <tr
                  key={p.sale_id}
                  className={`border-b border-brand-50 ${
                    me ? "bg-amber-50 font-semibold" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 text-center text-base">
                    {MEDAL[p.rank - 1] ?? p.rank}
                  </td>
                  <td className="px-4 py-2.5 text-brand-900">
                    {p.sale_name || "(Chưa đặt tên)"}
                    {me && <span className="ml-1 text-xs text-orange-600">(bạn)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center font-bold text-orange-600">
                    {p.avg_daily_score.toFixed(0)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-brand-700">
                    {p.total_leads_added}
                  </td>
                  <td className="px-4 py-2.5 text-center text-brand-700">
                    {p.total_hot_leads_received}
                  </td>
                  <td className="px-4 py-2.5 text-center text-brand-700">
                    {p.total_deals_closed}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
