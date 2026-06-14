"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  EmptyState,
  TierBadge,
  fmtNum,
} from "@/components/agency/AgencyKit";
import {
  fetchAgencyPipeline,
  type AgencyPipelineResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

const STAGE_TONE: Record<string, string> = {
  new: "border-brand-200 bg-brand-50",
  contacted: "border-sky-200 bg-sky-50",
  warm: "border-amber-200 bg-amber-50",
  hot: "border-red-200 bg-red-50",
  booked: "border-indigo-200 bg-indigo-50",
  deposit: "border-violet-200 bg-violet-50",
  contract: "border-teal-200 bg-teal-50",
  customer: "border-emerald-200 bg-emerald-50",
  lost: "border-brand-100 bg-brand-50/40",
};

export default function AgencyPipelinePage() {
  const [data, setData] = useState<AgencyPipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyPipeline(token)
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
        title="Pipeline chuyển đổi"
        subtitle={data ? `${fmtNum(data.total)} khách` : undefined}
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        data.total === 0 ? (
          <EmptyState text="Chưa có khách trong pipeline của sàn." />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {data.stages
              .filter((s) => s.key !== "lost" || s.count > 0)
              .map((stage) => (
                <div
                  key={stage.key}
                  className="flex w-64 shrink-0 flex-col rounded-2xl border border-brand-100 bg-white"
                >
                  <div className="flex items-center justify-between border-b border-brand-100 px-3 py-2">
                    <span className="text-sm font-bold text-brand-900">
                      {stage.label}
                    </span>
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      {stage.count}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {stage.leads.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-brand-100 px-2 py-4 text-center text-xs text-brand-400">
                        Trống
                      </div>
                    ) : (
                      stage.leads.map((card) => (
                        <div
                          key={card.id}
                          className={`rounded-xl border p-2.5 ${
                            STAGE_TONE[stage.key] ?? "border-brand-100 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-sm font-semibold text-brand-900">
                              {card.name ?? "—"}
                            </span>
                            <TierBadge tier={card.ai_tier} />
                          </div>
                          <div className="mt-0.5 text-xs text-brand-500">
                            {card.phone ?? ""}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-brand-600">
                            <span>AI {fmtNum(card.ai_score)}</span>
                            <span className="truncate">
                              {card.assigned_sale_name ?? "(chưa gán)"}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
          </div>
        )
      ) : null}
    </div>
  );
}
