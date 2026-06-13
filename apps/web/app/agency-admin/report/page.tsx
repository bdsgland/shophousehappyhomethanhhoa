"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
  KpiCard,
  fmtNum,
  fmtPct,
} from "@/components/agency/AgencyKit";
import { fetchAgencyAdminReport, type AgencyReport } from "@/lib/api";
import { readToken } from "@/lib/auth";

export default function AgencyAdminReportPage() {
  const [data, setData] = useState<AgencyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyAdminReport(token)
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Báo cáo doanh số sàn"
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Sale"
              value={fmtNum(data.summary.sales_count)}
              tone="brand"
            />
            <KpiCard
              label="Khách"
              value={fmtNum(data.summary.total)}
              sub={`Chuyển đổi ${fmtPct(data.summary.conversion_rate)}`}
              tone="indigo"
            />
            <KpiCard
              label="Đã chốt"
              value={fmtNum(data.summary.customers)}
              tone="emerald"
            />
            <KpiCard
              label="Nóng"
              value={fmtNum(data.summary.hot)}
              tone="red"
            />
          </div>

          <Card title="Hiệu suất theo sale">
            {data.by_sale.length === 0 ? (
              <EmptyState text="Chưa có dữ liệu theo sale." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-100 text-left text-brand-700">
                      <th className="py-2 pr-3 font-semibold">Sale</th>
                      <th className="py-2 pr-3 font-semibold">Khách</th>
                      <th className="py-2 pr-3 font-semibold">Đã chốt</th>
                      <th className="py-2 pr-3 font-semibold">Nóng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_sale.map((r, idx) => (
                      <tr
                        key={r.sale_id ?? `unassigned-${idx}`}
                        className="border-b border-brand-50 last:border-0"
                      >
                        <td className="py-2 pr-3 font-medium text-brand-900">
                          {r.sale_name ?? "—"}
                        </td>
                        <td className="py-2 pr-3">{fmtNum(r.leads)}</td>
                        <td className="py-2 pr-3">{fmtNum(r.customers)}</td>
                        <td className="py-2 pr-3">{fmtNum(r.hot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Ghi chú">
            <p className="text-sm text-brand-700">
              {data.notes?.revenue_commission ??
                "Doanh số/hoa hồng theo dòng tiền thực tế là bước nền."}
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
