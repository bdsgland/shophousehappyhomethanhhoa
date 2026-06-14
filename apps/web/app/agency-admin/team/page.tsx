"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  AiPanel,
  Card,
  EmptyState,
  fmtNum,
  fmtPct,
  useToast,
} from "@/components/agency/AgencyKit";
import {
  createAgencySaleRequest,
  fetchAgencyAdminTeam,
  fetchAgencySaleRequests,
  type AgencySaleRequest,
  type AgencyTeamResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

const REQ_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xử lý",
  contacted: "Đã liên hệ",
  joined: "Đã vào sàn",
  rejected: "Từ chối",
};

export default function AgencyAdminTeamPage() {
  const [data, setData] = useState<AgencyTeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [requests, setRequests] = useState<AgencySaleRequest[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { show, node } = useToast();

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyAdminTeam(token)
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
    fetchAgencySaleRequests(token)
      .then((r) => setRequests(r.items))
      .catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitInvite() {
    const token = readToken();
    if (!token) return;
    if (!fullName.trim()) {
      show(false, "Vui lòng nhập họ tên sale.");
      return;
    }
    setSaving(true);
    try {
      await createAgencySaleRequest(token, {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        note: note.trim() || undefined,
      });
      show(true, "Đã ghi nhận phiếu mời sale.");
      setFullName("");
      setPhone("");
      setEmail("");
      setNote("");
      load();
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Ghi nhận thất bại.");
    } finally {
      setSaving(false);
    }
  }

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
        <>
          <AiPanel
            title="Trợ lý AI quản lý đội sale"
            suggestions={(data.suggestions ?? []).map((s) => ({
              title: s.title,
              detail: s.detail,
              severity: s.severity,
            }))}
            emptyText="Chưa có gợi ý — đội sale đang cân bằng."
          />

          <Card title="Hiệu suất đội sale">
            {data.items.length === 0 ? (
              <EmptyState text="Chưa có sale nào được gắn vào sàn. Dùng form bên dưới để ghi nhận sale cần thêm; sale đã có tài khoản gắn sàn sẽ tự được nhận diện." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-100 text-left text-brand-700">
                      <th className="py-2 pr-3 font-semibold">Họ tên</th>
                      <th className="py-2 pr-3 font-semibold">Liên hệ</th>
                      <th className="py-2 pr-3 font-semibold">Khách</th>
                      <th className="py-2 pr-3 font-semibold">Nóng</th>
                      <th className="py-2 pr-3 font-semibold">Chốt</th>
                      <th className="py-2 pr-3 font-semibold">Tỉ lệ</th>
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
                        <td className="py-2 pr-3">{fmtNum(m.hot_count ?? 0)}</td>
                        <td className="py-2 pr-3">
                          {fmtNum(m.customers_count)}
                        </td>
                        <td className="py-2 pr-3">
                          {fmtPct(m.conversion_rate ?? 0)}
                        </td>
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

          <Card title="Thêm / mời sale (ghi nhận)">
            <p className="mb-3 text-xs text-brand-600">
              Bước nền: ghi nhận sale cần thêm để quản trị xử lý. Sale có tài
              khoản gắn sàn sẽ tự hiện ở bảng trên.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Họ tên sale *"
                className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Số điện thoại"
                className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú"
                className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={submitInvite}
              disabled={saving}
              className="mt-3 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Ghi nhận phiếu mời"}
            </button>

            {requests.length > 0 ? (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  Phiếu đã ghi nhận
                </div>
                {requests.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-brand-50 bg-brand-50/40 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-brand-900">
                        {r.full_name}
                      </div>
                      <div className="text-xs text-brand-500">
                        {[r.phone, r.email].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                      {REQ_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </>
      ) : null}
      {node}
    </div>
  );
}
