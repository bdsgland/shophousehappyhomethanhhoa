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
  useToast,
} from "@/components/agency/AgencyKit";
import {
  approveAgencyCareItem,
  fetchAgencyCareQueue,
  runAgencyCareCycle,
  skipAgencyCareItem,
  type AgencyCareQueueResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "skipped", label: "Đã bỏ qua" },
  { value: "all", label: "Tất cả" },
];

export default function AgencyAiSalesPage() {
  const [data, setData] = useState<AgencyCareQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState("pending");
  const [running, setRunning] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const { show, node } = useToast();

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyCareQueue(token, tab)
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function runCycle() {
    const token = readToken();
    if (!token) return;
    setRunning(true);
    try {
      const r = await runAgencyCareCycle(token, { batch_limit: 10 });
      if (r.enabled === false) {
        show(false, r.note ?? "Đội Sale AI chưa được bật.");
      } else {
        show(true, `Đã tạo ${r.queued ?? 0} nháp chăm sóc (quét ${r.scanned_candidates ?? 0} khách).`);
      }
      load();
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Chạy chu kỳ thất bại.");
    } finally {
      setRunning(false);
    }
  }

  async function act(itemId: string, kind: "approve" | "skip") {
    const token = readToken();
    if (!token) return;
    setActingId(itemId);
    try {
      if (kind === "approve") {
        await approveAgencyCareItem(token, itemId);
        show(true, "Đã duyệt nháp (không tự gửi).");
      } else {
        await skipAgencyCareItem(token, itemId);
        show(true, "Đã bỏ qua nháp.");
      }
      load();
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setActingId(null);
    }
  }

  const stats = data?.stats;

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Đội Sale AI"
        subtitle="Hàng đợi chăm sóc khách tự động (nháp — không tự gửi)"
        onRefresh={load}
        refreshing={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runCycle}
          disabled={running}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {running ? "Đang chạy…" : "Chạy chu kỳ chăm sóc"}
        </button>
        <span className="text-xs text-brand-600">
          AI quét khách cần chăm của sàn → tạo tin nháp để sale duyệt.
        </span>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Chờ duyệt" value={fmtNum(stats.pending)} tone="amber" />
          <KpiCard label="Đã duyệt" value={fmtNum(stats.approved)} tone="emerald" />
          <KpiCard label="Đã bỏ qua" value={fmtNum(stats.skipped)} tone="brand" />
          <KpiCard label="Tổng nháp" value={fmtNum(stats.total)} tone="indigo" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.value
                ? "bg-brand-500 text-white"
                : "text-brand-700 hover:bg-brand-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        data.items.length === 0 ? (
          <EmptyState text="Chưa có nháp chăm sóc nào. Bấm “Chạy chu kỳ chăm sóc” để Đội Sale AI tạo tin nháp cho khách cần chăm." />
        ) : (
          <div className="space-y-3">
            {data.items.map((it) => (
              <Card key={it.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-brand-900">
                      {it.lead_name ?? "Khách hàng"}
                    </div>
                    <div className="text-xs text-brand-500">
                      {it.action_type ?? "chăm sóc"} · {it.channel ?? "zalo"}
                      {it.ai_salesman_name ? ` · ${it.ai_salesman_name}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {it.status}
                  </span>
                </div>

                {it.summary ? (
                  <p className="mt-2 text-xs text-brand-600">{it.summary}</p>
                ) : null}

                {it.draft ? (
                  <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-sm text-brand-800">
                    {it.draft}
                  </div>
                ) : null}

                {it.suggested_time ? (
                  <div className="mt-1 text-xs text-brand-500">
                    Gợi ý gửi: {it.suggested_time}
                  </div>
                ) : null}

                {it.status === "pending" ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => act(it.id, "approve")}
                      disabled={actingId === it.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => act(it.id, "skip")}
                      disabled={actingId === it.id}
                      className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:border-brand-500 disabled:opacity-60"
                    >
                      Bỏ qua
                    </button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )
      ) : null}
      {node}
    </div>
  );
}
