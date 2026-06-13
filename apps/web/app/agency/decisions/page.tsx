"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
  PriorityBadge,
  fmtTimeAgo,
  useAgencyAuth,
  useToast,
} from "@/components/agency/AgencyKit";
import {
  actOnManagerDecision,
  fetchManagerDecisions,
  type DecisionAction,
  type DecisionItem,
  type DecisionsResponse,
} from "@/lib/api";

const ACTION_LABEL: Record<DecisionAction, string> = {
  approve: "Phê duyệt",
  execute: "Thực hiện",
  reject: "Bỏ qua",
};

const ACTION_STYLE: Record<DecisionAction, string> = {
  approve: "bg-emerald-600 text-white hover:bg-emerald-700",
  execute: "bg-brand-600 text-white hover:bg-brand-700",
  reject: "border border-brand-200 text-brand-700 hover:bg-brand-50",
};

export default function AgencyDecisionsPage() {
  const { token, ready } = useAgencyAuth();
  const { show, node: toastNode } = useToast();
  const [data, setData] = useState<DecisionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchManagerDecisions(token)
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (ready && token) load();
  }, [ready, token, load]);

  async function onAct(item: DecisionItem, action: DecisionAction) {
    if (!token) return;
    const ok = window.confirm(
      `${ACTION_LABEL[action]}: "${item.title}"?\n\nThao tác chỉ đổi trạng thái nội bộ, KHÔNG gửi tin/giao dịch thật cho khách.`,
    );
    if (!ok) return;
    setBusyId(`${item.type}:${item.id}`);
    try {
      const res = await actOnManagerDecision(token, {
        type: item.type,
        id: item.id,
        action,
      });
      show(res.ok !== false, res.message || "Đã xử lý.");
      load();
    } catch (e) {
      show(false, e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || (!token && loading)) return <AgencyLoading />;

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Trung tâm quyết định"
        subtitle={
          data
            ? `${data.total} việc cần xử lý · ${fmtTimeAgo(data.generated_at)}`
            : undefined
        }
        onRefresh={load}
        refreshing={loading}
      />

      <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-800">
        An toàn: “Thực hiện/Phê duyệt” chỉ đổi trạng thái nội bộ (gán sale, đánh
        dấu duyệt) — không tự gửi tin hay giao dịch thật.
      </div>

      {error && <AgencyError error={error} onRetry={load} />}
      {!error && loading && !data && <AgencyLoading />}

      {!error && data && data.total === 0 && (
        <EmptyState text="Tuyệt vời — không có việc nào đang chờ quyết định." />
      )}

      {!error &&
        data &&
        data.groups.map((group) => (
          <Card
            key={group.type}
            title={group.label}
            action={<PriorityBadge priority={group.priority} />}
          >
            <ul className="space-y-3">
              {group.items.map((item) => {
                const busy = busyId === `${item.type}:${item.id}`;
                return (
                  <li
                    key={`${item.type}:${item.id}`}
                    className="rounded-xl border border-brand-100 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-brand-900">
                          {item.title}
                        </div>
                        <p className="mt-0.5 text-xs text-brand-700">
                          {item.context}
                        </p>
                        <div className="mt-1 text-[11px] text-brand-500">
                          {fmtTimeAgo(item.created_at)}
                        </div>
                      </div>
                      <PriorityBadge priority={item.priority} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.actions.map((a) => {
                        const action = a as DecisionAction;
                        if (!ACTION_LABEL[action]) return null;
                        return (
                          <button
                            key={a}
                            type="button"
                            disabled={busy}
                            onClick={() => onAct(item, action)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${ACTION_STYLE[action]}`}
                          >
                            {busy ? "Đang xử lý…" : ACTION_LABEL[action]}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

      {toastNode}
    </div>
  );
}
