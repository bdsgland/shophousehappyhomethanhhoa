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
  useAgencyAuth,
} from "@/components/agency/AgencyKit";
import {
  fetchAiSalesStats,
  fetchCareQueueStats,
  fetchManagerOverview,
  type AiSalesStats,
  type CareQueueStats,
  type ManagerOverview,
} from "@/lib/api";

export default function AgencyTeamPage() {
  const { token, ready } = useAgencyAuth();
  const [overview, setOverview] = useState<ManagerOverview | null>(null);
  const [aiStats, setAiStats] = useState<AiSalesStats | null>(null);
  const [care, setCare] = useState<CareQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    // Tải song song; overview là nguồn chính (quyết định lỗi quyền).
    Promise.all([
      fetchManagerOverview(token),
      fetchAiSalesStats(token).catch(() => null),
      fetchCareQueueStats(token).catch(() => null),
    ])
      .then(([ov, ai, cq]) => {
        setOverview(ov);
        setAiStats(ai);
        setCare(cq);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (ready && token) load();
  }, [ready, token, load]);

  if (!ready || (!token && loading)) return <AgencyLoading />;

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Đội sale"
        subtitle="Hiệu suất sale thật & đội Sale AI"
        onRefresh={load}
        refreshing={loading}
      />

      {error && <AgencyError error={error} onRetry={load} />}
      {!error && loading && !overview && <AgencyLoading />}

      {!error && overview && (
        <>
          {/* Đội Sale AI */}
          <Card title="Đội Sale AI">
            {aiStats ? (
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Sale AI hoạt động"
                  value={fmtNum(aiStats.active)}
                  sub={`Tổng ${fmtNum(aiStats.total)}`}
                  tone="sky"
                />
                <KpiCard
                  label="Khách đang chăm"
                  value={fmtNum(aiStats.total_assigned)}
                  sub={`Tải TB ${fmtNum(aiStats.avg_load)}/sale`}
                  tone="indigo"
                />
                <KpiCard
                  label="Còn dư năng lực"
                  value={fmtNum(aiStats.capacity_left)}
                  tone="emerald"
                />
                <KpiCard
                  label="Nháp chờ duyệt"
                  value={fmtNum(care?.pending)}
                  sub={
                    care ? `Đã duyệt ${fmtNum(care.approved)}` : "Hàng đợi chăm sóc"
                  }
                  tone="amber"
                />
              </div>
            ) : (
              <EmptyState text="Chưa khởi tạo đội Sale AI." />
            )}
          </Card>

          {/* Top hiệu suất sale thật (tuần này) */}
          <Card title="Top hiệu suất sale (tuần này)">
            {overview.top_sales.length === 0 ? (
              <EmptyState text="Chưa có dữ liệu hiệu suất sale tuần này." />
            ) : (
              <ul className="space-y-2">
                {overview.top_sales.map((s, idx) => (
                  <li
                    key={s.sale_id}
                    className="flex items-center gap-3 rounded-xl border border-brand-100 px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                      {s.rank ?? idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-brand-900">
                        {s.sale_name || "—"}
                      </div>
                      <div className="text-[11px] text-brand-600">
                        Lead mới {fmtNum(s.total_leads_added)} · Nóng nhận{" "}
                        {fmtNum(s.total_hot_leads_received)} · Chốt{" "}
                        {fmtNum(s.total_deals_closed)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-bold text-brand-900">
                        {fmtNum(s.eligibility_score)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-brand-500">
                        điểm
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
