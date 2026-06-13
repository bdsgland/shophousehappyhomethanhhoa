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
  fetchAgencyAdminTeam,
  type AgencyTeamResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

export default function AgencyAdminTeamPage() {
  const [data, setData] = useState<AgencyTeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyAdminTeam(token)
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
        title="Đội sale của sàn"
        subtitle={data ? `${fmtNum(data.total)} sale` : undefined}
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        <Card>
          {data.items.length === 0 ? (
            <EmptyState text="Chưa có sale nào được gắn vào sàn. Khai báo đội sale trong Hồ sơ sàn; sale đã có tài khoản sẽ tự được nhận diện." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-left text-brand-700">
                    <th className="py-2 pr-3 font-semibold">Họ tên</th>
                    <th className="py-2 pr-3 font-semibold">Liên hệ</th>
                    <th className="py-2 pr-3 font-semibold">Khách</th>
                    <th className="py-2 pr-3 font-semibold">Đã chốt</th>
                    <th className="py-2 pr-3 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-brand-50 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium text-brand-900">
                        {m.full_name ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-brand-700">
                        <div>{m.phone ?? "—"}</div>
                        <div className="text-xs text-brand-500">
                          {m.email ?? ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{fmtNum(m.leads_count)}</td>
                      <td className="py-2 pr-3">{fmtNum(m.customers_count)}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            m.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {m.is_active ? "Hoạt động" : "Đã khoá"}
                        </span>
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
