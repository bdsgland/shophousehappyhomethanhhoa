"use client";

import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import { useMemo, useState } from "react";

import { getCrmSalesPerformance, listAllCrmLeads } from "@/lib/api";
import type { SalePerformance } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LeadTrendChart } from "@/components/charts/LeadTrendChart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey =
  | "rank"
  | "avg_daily_score"
  | "total_leads_added"
  | "total_hot_leads_received"
  | "total_deals_closed"
  | "eligibility_score";

const COLS: { key: SortKey; label: string; align?: "center" }[] = [
  { key: "rank", label: "#", align: "center" },
  { key: "avg_daily_score", label: "Điểm TB", align: "center" },
  { key: "total_leads_added", label: "Khách thêm", align: "center" },
  { key: "total_hot_leads_received", label: "Hot nhận", align: "center" },
  { key: "total_deals_closed", label: "Chốt deal", align: "center" },
  { key: "eligibility_score", label: "Ưu tiên", align: "center" },
];

const MEDAL = ["🥇", "🥈", "🥉"];

function buildTrend(createdAts: string[]): { date: string; count: number }[] {
  const days = 30;
  const buckets: Record<string, number> = {};
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const iso of createdAts) {
    const key = iso.slice(0, 10);
    if (key in buckets) buckets[key] += 1;
  }
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

/**
 * Phần thân của trang "Hiệu suất Sale" (chart xu hướng + bảng xếp hạng).
 * Tách riêng để tái dùng ở cả route /customers/performance lẫn tab trong /sales.
 * Không kèm PageHeader để nơi gọi tự quyết định tiêu đề.
 */
export function SalePerformanceContent() {
  const perfQ = useQuery({
    queryKey: ["crm-sales-performance"],
    queryFn: getCrmSalesPerformance,
  });
  const leadsQ = useQuery({
    queryKey: ["crm-leads-trend"],
    queryFn: () => listAllCrmLeads(),
  });

  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const list = [...(perfQ.data ?? [])];
    list.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return asc ? av - bv : bv - av;
    });
    return list;
  }, [perfQ.data, sortKey, asc]);

  const trend = useMemo(
    () => buildTrend((leadsQ.data?.items ?? []).map((l) => l.created_at)),
    [leadsQ.data],
  );

  function toggleSort(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "rank");
    }
  }

  const conversion = (p: SalePerformance) =>
    p.total_hot_leads_received > 0
      ? Math.round((p.total_deals_closed / p.total_hot_leads_received) * 100)
      : 0;

  return (
    <div>
      {/* Lead trend chart */}
      <Card className="mb-6 p-5">
        <h3 className="mb-3 text-sm font-semibold">Khách mới theo ngày (30 ngày qua)</h3>
        {leadsQ.isLoading ? <Skeleton className="h-64 w-full" /> : <LeadTrendChart data={trend} />}
      </Card>

      {/* Ranking table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 text-center font-medium">#</th>
                <th className="px-4 py-3 font-medium">Sale</th>
                {COLS.filter((c) => c.key !== "rank").map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className="cursor-pointer select-none px-4 py-3 text-center font-medium hover:text-foreground"
                  >
                    {c.label}
                    {sortKey === c.key && <span className="ml-1">{asc ? "▲" : "▼"}</span>}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-medium">Tỉ lệ chốt</th>
              </tr>
            </thead>
            <tbody>
              {perfQ.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={9}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={9}>
                    Chưa có dữ liệu hiệu suất sale.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.sale_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-center text-base">
                      {MEDAL[p.rank - 1] ?? p.rank}
                    </td>
                    <td className="px-4 py-3 font-medium">{p.sale_name || "(Chưa đặt tên)"}</td>
                    <td className="px-4 py-3 text-center font-semibold text-primary">
                      {p.avg_daily_score.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-center">{p.total_leads_added}</td>
                    <td className="px-4 py-3 text-center">{p.total_hot_leads_received}</td>
                    <td className="px-4 py-3 text-center">{p.total_deals_closed}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {p.eligibility_score.toFixed(1)}
                    </td>
                    <td className={cn("px-4 py-3 text-center font-medium", conversion(p) >= 50 ? "text-success" : "")}>
                      {conversion(p)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Medal className="h-3.5 w-3.5" />
        Điểm ưu tiên (eligibility) = điểm TB tuần + thưởng theo số deal chốt → quyết định thứ tự nhận hot lead.
      </p>
    </div>
  );
}
