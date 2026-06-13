"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  KpiCard,
  fmtNum,
  fmtPct,
} from "@/components/agency/AgencyKit";
import {
  fetchAgencyAdminOverview,
  type AgencyAdminOverview,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

export default function AgencyAdminOverviewPage() {
  const [data, setData] = useState<AgencyAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyAdminOverview(token)
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
        title="Tổng quan sàn"
        subtitle={data?.agency.ten_san ?? undefined}
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard
              label="Sale của sàn"
              value={fmtNum(data.kpi.sales_count)}
              tone="brand"
            />
            <KpiCard
              label="Tổng khách"
              value={fmtNum(data.kpi.leads_total)}
              sub={`Chuyển đổi ${fmtPct(data.kpi.conversion_rate)}`}
              tone="indigo"
            />
            <KpiCard
              label="Khách NÓNG"
              value={fmtNum(data.kpi.leads_hot)}
              sub={`Ấm ${fmtNum(data.kpi.leads_warm)} · Lạnh ${fmtNum(
                data.kpi.leads_cold,
              )}`}
              tone="red"
            />
            <KpiCard
              label="Khách đã chốt"
              value={fmtNum(data.kpi.customers)}
              tone="emerald"
            />
            <KpiCard
              label="Doanh số sàn"
              value={data.kpi.revenue === null ? "—" : fmtNum(data.kpi.revenue)}
              sub="Bước nền"
              tone="amber"
            />
            <KpiCard
              label="Hoa hồng sàn"
              value={
                data.kpi.commission === null ? "—" : fmtNum(data.kpi.commission)
              }
              sub="Bước nền"
              tone="sky"
            />
          </div>

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
