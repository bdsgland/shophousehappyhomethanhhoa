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

type Profile360 = {
  basic?: Record<string, unknown>;
  ai?: {
    score?: number;
    tier?: string | null;
    reason?: string | null;
    best_time?: string | null;
    next_action?: { summary?: string; suggested_action?: string } | null;
  };
  stats?: Record<string, number | null>;
  timeline?: Array<{ kind?: string; title?: string; note?: string; at?: string }>;
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
  const [profile, setProfile] = useState<Profile360 | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileName, setProfileName] = useState("");

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

  async function openProfile(lead: AgencyLeadRow) {
    const token = readToken();
    if (!token) return;
    setProfileOpen(true);
    setProfile(null);
    setProfileName(lead.name ?? "Khách hàng");
    setProfileLoading(true);
    try {
      const p = (await fetchAgencyLeadProfile(token, lead.id)) as Profile360;
      setProfile(p);
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Không mở được hồ sơ.");
      setProfileOpen(false);
    } finally {
      setProfileLoading(false);
    }
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
        {profileLoading ? (
          <AgencyLoading label="Đang dựng hồ sơ 360°…" />
        ) : profile ? (
          <Profile360View profile={profile} />
        ) : (
          <EmptyState text="Chưa có dữ liệu hồ sơ." />
        )}
      </Drawer>
      {node}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const text =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-brand-500">{label}</span>
      <span className="text-right font-medium text-brand-900">{text}</span>
    </div>
  );
}

function Profile360View({ profile }: { profile: Profile360 }) {
  const basic = profile.basic ?? {};
  const ai = profile.ai ?? {};
  const stats = profile.stats ?? {};
  const nba = ai.next_action;
  const timeline = profile.timeline ?? [];
  return (
    <div className="space-y-4">
      <Card title="Thông tin khách">
        <Field label="Tên" value={basic.name} />
        <Field label="SĐT" value={basic.phone} />
        <Field label="Email" value={basic.email} />
        <Field label="Nguồn" value={basic.source} />
        <Field label="Khu vực" value={basic.region} />
        <Field label="Sản phẩm" value={basic.product_type} />
        <Field label="Ngân sách" value={basic.budget} />
        <Field label="Sale phụ trách" value={basic.assigned_sale_name} />
      </Card>

      <Card title="Phân tích AI">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-brand-900">
            {fmtNum(ai.score ?? 0)}
          </span>
          <TierBadge tier={ai.tier} />
        </div>
        {ai.reason ? (
          <p className="mt-2 text-sm text-brand-700">Lý do: {ai.reason}</p>
        ) : null}
        {ai.best_time ? (
          <p className="mt-1 text-sm text-brand-700">
            Giờ liên hệ tốt: {ai.best_time}
          </p>
        ) : null}
        {nba?.suggested_action ? (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            → {nba.suggested_action}
          </p>
        ) : null}
      </Card>

      <Card title="Chỉ số tương tác">
        <Field label="Tổng liên hệ" value={stats.contact_count} />
        <Field
          label="Liên hệ hiệu quả"
          value={stats.effective_contact_count}
        />
        <Field label="Lượt đặt lịch" value={stats.booking_count} />
        <Field label="Số ngày từ lần cuối" value={stats.days_since_contact} />
      </Card>

      {timeline.length > 0 ? (
        <Card title="Dòng thời gian">
          <ul className="space-y-2">
            {timeline.slice(0, 12).map((t, i) => (
              <li
                key={i}
                className="rounded-lg border border-brand-50 bg-brand-50/40 px-3 py-2 text-xs text-brand-700"
              >
                <div className="font-medium text-brand-900">
                  {t.title ?? t.kind ?? "Hoạt động"}
                </div>
                {t.note ? <div className="mt-0.5">{t.note}</div> : null}
                {t.at ? (
                  <div className="mt-0.5 text-brand-400">{t.at}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
