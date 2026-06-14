"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  AiPanel,
  Card,
  FunnelChart,
  KpiCard,
  SourceBars,
  TrendBarChart,
  fmtNum,
  fmtPct,
} from "@/components/agency/AgencyKit";
import {
  fetchAgencyAdminOverview,
  fetchAgencyImprovements,
  type AgencyAdminOverview,
  type AgencyImprovementsResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

export default function AgencyAdminOverviewPage() {
  const [data, setData] = useState<AgencyAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [ai, setAi] = useState<AgencyImprovementsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

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

  const loadAi = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setAiLoading(true);
    fetchAgencyImprovements(token)
      .then((d) => setAi(d))
      .catch(() => setAi(null))
      .finally(() => setAiLoading(false));
  }, []);

  useEffect(() => {
    load();
    loadAi();
  }, [load, loadAi]);

  const hasData = !error && data;

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Tổng quan sàn"
        subtitle={data?.agency.ten_san ?? undefined}
        onRefresh={() => {
          load();
          loadAi();
        }}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {hasData ? (
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

          <AiPanel
            summary={ai?.summary}
            suggestions={ai?.improvements ?? []}
            loading={aiLoading}
            generatedBy={ai?.generated_by}
            onRefresh={loadAi}
            emptyText="Chưa có đề xuất — khi sàn có thêm khách/sale, trợ lý AI sẽ gợi ý hành động hôm nay."
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Khách mới & đã chốt theo tháng">
              <TrendBarChart data={data.trends ?? []} />
            </Card>
            <Card title="Phễu chuyển đổi">
              <FunnelChart steps={data.funnel ?? []} />
            </Card>
          </div>

          <Card title="Nguồn khách">
            <SourceBars rows={data.sources ?? []} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
