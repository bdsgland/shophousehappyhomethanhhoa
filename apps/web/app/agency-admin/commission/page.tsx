"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  useToast,
} from "@/components/agency/AgencyKit";
import {
  fetchAgencyCommission,
  updateAgencyCommission,
  type AgencyCommissionResponse,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

export default function AgencyAdminCommissionPage() {
  const [data, setData] = useState<AgencyCommissionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [frontlinePct, setFrontlinePct] = useState("");
  const [note, setNote] = useState("");
  const { show, node } = useToast();

  const load = useCallback(() => {
    const token = readToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAgencyCommission(token)
      .then((d) => {
        setData(d);
        setFrontlinePct(String(d.config.frontline_pct ?? ""));
        setNote(d.config.note ?? "");
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const token = readToken();
    if (!token) return;
    setSaving(true);
    try {
      const pct = Number(frontlinePct);
      const updated = await updateAgencyCommission(token, {
        frontline_pct: Number.isNaN(pct) ? undefined : pct,
        note: note.trim() || undefined,
      });
      setData(updated);
      show(true, "Đã lưu cấu hình hoa hồng.");
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  const canConfig = data?.can_config ?? false;

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Hoa hồng đội sale (nền)"
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <AgencyError error={error} onRetry={load} /> : null}
      {!error && loading && !data ? <AgencyLoading /> : null}

      {!error && data ? (
        <>
          {!canConfig ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {data.locked_reason ??
                "Cần được duyệt làm đại lý F2 để cấu hình hoa hồng cho đội sale."}
            </div>
          ) : null}

          <Card title="Cấu hình chia cho sale frontline">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-brand-900">
                  % chia cho sale frontline (trong phần sàn được hưởng)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={frontlinePct}
                  onChange={(e) => setFrontlinePct(e.target.value)}
                  disabled={!canConfig}
                  className="mt-1 w-40 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 disabled:bg-brand-50 disabled:text-brand-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-900">
                  Ghi chú
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!canConfig}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 disabled:bg-brand-50 disabled:text-brand-400"
                />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={!canConfig || saving}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Đang lưu…" : "Lưu cấu hình"}
              </button>
            </div>
          </Card>

          <Card title="Ghi chú">
            <p className="text-sm text-brand-700">
              {data.note ??
                "Bước nền: cấu hình này chưa áp dụng vào dòng tiền thực tế."}
            </p>
          </Card>
        </>
      ) : null}
      {node}
    </div>
  );
}
