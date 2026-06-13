"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
  fmtNum,
} from "@/components/agency/AgencyKit";
import {
  fetchAgencyAdminLeads,
  type AgencyLeadsResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "hot", label: "Nóng" },
  { value: "warm", label: "Ấm" },
  { value: "cold", label: "Lạnh" },
  { value: "customer", label: "Đã chốt" },
  { value: "lost", label: "Mất" },
];

const STATUS_BADGE: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-sky-100 text-sky-700",
  customer: "bg-emerald-100 text-emerald-700",
  lost: "bg-brand-100 text-brand-600",
};

export default function AgencyAdminLeadsPage() {
  const [data, setData] = useState<AgencyLeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyAdminLeads(token, {
      status: statusFilter || undefined,
      search: search.trim() || undefined,
    })
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="CRM khách của sàn"
        subtitle={data ? `${fmtNum(data.total)} khách` : undefined}
        onRefresh={load}
        refreshing={loading}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên / SĐT / email"
            className="min-w-[180px] flex-1 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </div>
      </Card>

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        <Card>
          {data.items.length === 0 ? (
            <EmptyState text="Không có khách phù hợp bộ lọc." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-left text-brand-700">
                    <th className="py-2 pr-3 font-semibold">Khách</th>
                    <th className="py-2 pr-3 font-semibold">Liên hệ</th>
                    <th className="py-2 pr-3 font-semibold">Trạng thái</th>
                    <th className="py-2 pr-3 font-semibold">Điểm AI</th>
                    <th className="py-2 pr-3 font-semibold">Nguồn</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-brand-50 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium text-brand-900">
                        {l.name ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-brand-700">
                        <div>{l.phone ?? "—"}</div>
                        <div className="text-xs text-brand-500">
                          {l.email ?? ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            STATUS_BADGE[l.status] ?? "bg-brand-100 text-brand-600"
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{fmtNum(l.ai_score)}</td>
                      <td className="py-2 pr-3 text-brand-700">
                        {l.source ?? "—"}
                      </td>
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
