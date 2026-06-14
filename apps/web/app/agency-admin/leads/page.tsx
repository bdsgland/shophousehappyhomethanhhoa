"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  Drawer,
  EmptyState,
  TierBadge,
  fmtNum,
  useToast,
} from "@/components/agency/AgencyKit";
import { Customer360Block } from "@/components/agent/crm/Customer360Block";
import {
  assignAgencyLead,
  fetchAgencyAdminLeads,
  fetchAgencyLeadProfile,
  rescoreAgencyLeads,
  type AgencyLeadRow,
  type AgencyLeadsResponse,
  type AgencyTeamOption,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Mọi trạng thái" },
  { value: "hot", label: "Nóng" },
  { value: "warm", label: "Ấm" },
  { value: "cold", label: "Lạnh" },
  { value: "customer", label: "Đã chốt" },
  { value: "lost", label: "Mất" },
];

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Mọi tầng AI" },
  { value: "hot", label: "AI: Nóng" },
  { value: "warm", label: "AI: Ấm" },
  { value: "cold", label: "AI: Lạnh" },
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
  const [tierFilter, setTierFilter] = useState("");
  const [search, setSearch] = useState("");
  const [rescoring, setRescoring] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileToken, setProfileToken] = useState<string | null>(null);

  const { show, node } = useToast();

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyAdminLeads(token, {
      status: statusFilter || undefined,
      tier: tierFilter || undefined,
      search: search.trim() || undefined,
    })
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [statusFilter, tierFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function rescore() {
    const token = readToken();
    if (!token) return;
    setRescoring(true);
    try {
      const r = await rescoreAgencyLeads(token, 60);
      show(true, `Đã chấm điểm AI lại ${r.scored} khách.`);
      load();
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Chấm điểm thất bại.");
    } finally {
      setRescoring(false);
    }
  }

  async function assign(leadId: string, saleId: string) {
    const token = readToken();
    if (!token || !saleId) return;
    setAssigningId(leadId);
    try {
      await assignAgencyLead(token, leadId, saleId);
      show(true, "Đã phân công khách cho sale.");
      load();
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Phân công thất bại.");
    } finally {
      setAssigningId(null);
    }
  }

  function openProfile(lead: AgencyLeadRow) {
    const token = readToken();
    if (!token) return;
    setProfileToken(token);
    setProfileLeadId(lead.id);
    setProfileName(lead.name ?? "Khách hàng");
    setProfileOpen(true);
  }

  const team: AgencyTeamOption[] = data?.team ?? [];

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
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          >
            {TIER_OPTIONS.map((o) => (
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
          <button
            type="button"
            onClick={rescore}
            disabled={rescoring}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {rescoring ? "Đang chấm…" : "AI chấm điểm lại"}
          </button>
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
                    <th className="py-2 pr-3 font-semibold">Trạng thái</th>
                    <th className="py-2 pr-3 font-semibold">AI</th>
                    <th className="py-2 pr-3 font-semibold">Hành động AI gợi ý</th>
                    <th className="py-2 pr-3 font-semibold">Sale phụ trách</th>
                    <th className="py-2 pr-3 font-semibold">Mở</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((l) => {
                    const nba =
                      l.ai_next_action && typeof l.ai_next_action === "object"
                        ? l.ai_next_action.suggested_action
                        : null;
                    return (
                      <tr
                        key={l.id}
                        className="border-b border-brand-50 align-top last:border-0"
                      >
                        <td className="py-2 pr-3">
                          <div className="font-medium text-brand-900">
                            {l.name ?? "—"}
                          </div>
                          <div className="text-xs text-brand-500">
                            {l.phone ?? ""}
                            {l.email ? ` · ${l.email}` : ""}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              STATUS_BADGE[l.status] ??
                              "bg-brand-100 text-brand-600"
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-brand-900">
                              {fmtNum(l.ai_score)}
                            </span>
                            <TierBadge tier={l.ai_tier} />
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-brand-700">
                          {nba ? nba : <span className="text-brand-400">—</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            value={l.assigned_sale_id ?? ""}
                            disabled={assigningId === l.id}
                            onChange={(e) => assign(l.id, e.target.value)}
                            className="max-w-[150px] rounded-lg border border-brand-100 bg-white px-2 py-1 text-xs text-brand-900 outline-none focus:border-brand-500 disabled:opacity-60"
                          >
                            <option value="">(chưa gán)</option>
                            {team.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.full_name ?? s.id}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => openProfile(l)}
                            className="rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700 hover:border-brand-500"
                          >
                            360°
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Drawer
        open={profileOpen}
        title={`Hồ sơ 360° · ${profileName}`}
        onClose={() => setProfileOpen(false)}
      >
        {profileOpen && profileToken && profileLeadId ? (
          <AgencyLead360 token={profileToken} leadId={profileLeadId} />
        ) : (
          <EmptyState text="Chưa có dữ liệu hồ sơ." />
        )}
      </Drawer>
      {node}
    </div>
  );
}

/**
 * Hồ sơ 360° ĐẦY ĐỦ của 1 khách CỦA SÀN — tái dùng Customer360Block (giàu thông
 * tin: hồ sơ, AI score/next-action, dòng thời gian đa kênh, kênh tương tác, giao
 * dịch). readOnly: ẩn thao tác của sale (đăng care/gọi/chấm điểm). Dữ liệu lấy từ
 * endpoint SCOPED của sàn (chống IDOR — không lộ khách của sàn khác).
 */
function AgencyLead360({ token, leadId }: { token: string; leadId: string }) {
  return (
    <Customer360Block
      token={token}
      leadId={leadId}
      readOnly
      loadProfile={() => fetchAgencyLeadProfile(token, leadId)}
    />
  );
}
