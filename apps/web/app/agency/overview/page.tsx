"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
  KpiCard,
  fmtMoneyShort,
  fmtNum,
  fmtPct,
  fmtTimeAgo,
  fmtTy,
  useAgencyAuth,
} from "@/components/agency/AgencyKit";
import { fetchManagerSystemReport, type SystemReport } from "@/lib/api";

export default function AgencyOverviewPage() {
  const { token, ready } = useAgencyAuth();
  const [report, setReport] = useState<SystemReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchManagerSystemReport(token)
      .then((r) => setReport(r))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (ready && token) load();
  }, [ready, token, load]);

  if (!ready || (!token && loading)) {
    return <AgencyLoading />;
  }

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Tổng quan điều hành"
        subtitle={
          report ? `Số liệu lúc ${fmtTimeAgo(report.generated_at)}` : undefined
        }
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !report && <AgencyLoading />}

      {!error && report && (
        <>
          {/* KPI lớn: phễu lead + tài chính */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Tổng lead"
              value={report.leads.available ? fmtNum(report.leads.total) : "—"}
              sub={
                report.leads.available
                  ? `Chuyển đổi ${fmtPct(report.leads.conversion_rate)}`
                  : "Chưa có dữ liệu"
              }
              tone="brand"
            />
            <KpiCard
              label="Khách NÓNG"
              value={report.leads.available ? fmtNum(report.leads.hot) : "—"}
              sub={
                report.leads.available
                  ? `Ấm ${fmtNum(report.leads.warm)} · Lạnh ${fmtNum(report.leads.cold)}`
                  : undefined
              }
              tone="red"
            />
            <KpiCard
              label="Doanh thu kỳ"
              value={
                report.finance.available
                  ? fmtMoneyShort(report.finance.revenue)
                  : "—"
              }
              sub={report.finance.period_label ?? undefined}
              tone="emerald"
            />
            <KpiCard
              label="Lợi nhuận kỳ"
              value={
                report.finance.available
                  ? fmtMoneyShort(report.finance.profit)
                  : "—"
              }
              sub={
                report.finance.available && report.finance.margin !== undefined
                  ? `Biên ${fmtPct(report.finance.margin)}`
                  : undefined
              }
              tone="sky"
            />
            <KpiCard
              label="Hoa hồng ghi nhận"
              value={
                report.finance.commission
                  ? fmtMoneyShort(report.finance.commission.total_amount)
                  : "—"
              }
              sub={
                report.finance.commission
                  ? `${fmtNum(report.finance.commission.deals)} deal`
                  : undefined
              }
              tone="amber"
            />
            <KpiCard
              label="Doanh thu dự kiến"
              value={fmtTy(report.sales.revenue_projection_ty)}
              sub={`Đã cọc ${fmtNum(report.sales.orders_reserved)} căn`}
              tone="indigo"
            />
          </div>

          {/* Phễu chuyển đổi */}
          <Card title="Phễu chuyển đổi">
            <ul className="space-y-2">
              {report.funnel.map((f) => (
                <li
                  key={f.key}
                  className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-brand-800">
                    {f.label}
                  </span>
                  <span className="text-base font-bold text-brand-900">
                    {f.count === null ? "—" : fmtNum(f.count)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Đội Sale AI + hàng đợi chăm sóc */}
          <Card title="Đội Sale AI">
            {report.ai_sales.available ? (
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Sale AI hoạt động"
                  value={fmtNum(report.ai_sales.active)}
                  sub={`Tổng ${fmtNum(report.ai_sales.total)}`}
                  tone="sky"
                />
                <KpiCard
                  label="Tải đội AI"
                  value={
                    report.ai_sales.load_ratio !== undefined
                      ? `${Math.round((report.ai_sales.load_ratio ?? 0) * 100)}%`
                      : "—"
                  }
                  sub={`Đang chăm ${fmtNum(report.ai_sales.total_assigned)} khách`}
                  tone={
                    (report.ai_sales.load_ratio ?? 0) >= 0.85 ? "red" : "emerald"
                  }
                />
                <KpiCard
                  label="Nháp chăm sóc chờ duyệt"
                  value={
                    report.ai_care.available
                      ? fmtNum(report.ai_care.pending)
                      : "—"
                  }
                  tone="amber"
                />
                <KpiCard
                  label="Còn dư năng lực"
                  value={fmtNum(report.ai_sales.capacity_left)}
                  tone="brand"
                />
              </div>
            ) : (
              <EmptyState text="Chưa khởi tạo đội Sale AI." />
            )}
          </Card>

          {/* Sức khoẻ nền tảng */}
          <Card title="Sức khoẻ nền tảng">
            {report.platforms.length === 0 ? (
              <EmptyState text="Chưa kiểm tra được nền tảng." />
            ) : (
              <ul className="space-y-2">
                {report.platforms.map((p) => {
                  const up = p.status === "up";
                  return (
                    <li
                      key={p.key}
                      className="flex items-center justify-between rounded-lg border border-brand-100 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-brand-800">
                        {p.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          up ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            up ? "bg-emerald-500" : "bg-red-500"
                          }`}
                        />
                        {up ? "Hoạt động" : "Gián đoạn"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
