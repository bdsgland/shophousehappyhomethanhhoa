"use client";

import { useEffect, useState } from "react";

import {
  Clock,
  Lightbulb,
  MessageCircle,
  Phone,
  RefreshCw,
  Sparkles,
  X,
} from "@/components/dashboard/icons";
import {
  CHANNEL_LABEL,
  formatDateTime,
  getLeadDetail,
  getLeadInsight,
  OUTCOME_LABEL,
  rescoreLead,
  scoreColor,
  SOURCE_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  tierBadge,
  tierLabel,
  updateLead,
  type ContactLog,
  type CrmLeadDetail,
  type LeadInsight,
  type LeadStatus,
} from "@/lib/crm";
import { ContactLogModal } from "./ContactLogModal";

const STATUSES: LeadStatus[] = ["cold", "warm", "hot", "customer", "lost"];

export function LeadDetailPanel({
  token,
  leadId,
  onClose,
  onChanged,
}: {
  token: string;
  leadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>("cold");
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [insight, setInsight] = useState<LeadInsight | null>(null);
  const [rescoring, setRescoring] = useState(false);

  function load() {
    getLeadDetail(token, leadId).then((d) => {
      setLead(d);
      setLogs(d.contact_logs);
      setNote(d.note ?? "");
      setStatus(d.status);
    });
    getLeadInsight(token, leadId)
      .then(setInsight)
      .catch(() => setInsight(null));
  }

  useEffect(load, [token, leadId]);

  async function rescore() {
    setRescoring(true);
    try {
      const res = await rescoreLead(token, leadId);
      setInsight(res);
      onChanged();
    } finally {
      setRescoring(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await updateLead(token, leadId, { status, note });
      load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (!lead) {
    return (
      <aside className="w-full rounded-2xl border border-brand-100 bg-white p-6 shadow-sm lg:w-96">
        <div className="h-40 animate-pulse rounded-lg bg-brand-50" />
      </aside>
    );
  }

  const zaloLink = `https://zalo.me/${lead.phone.replace(/\D/g, "")}`;

  return (
    <aside className="w-full shrink-0 rounded-2xl border border-brand-100 bg-white shadow-sm lg:w-96">
      <div className="flex items-start justify-between border-b border-brand-100 p-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-brand-900">{lead.name}</h3>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-brand-600">
            <Phone size={14} /> {lead.phone}
          </div>
          {lead.email && <div className="text-sm text-brand-500">{lead.email}</div>}
        </div>
        <button onClick={onClose} className="text-brand-400 hover:text-brand-700">
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {/* AI insight: điểm thật + tier + lý do + best time + next action */}
        <div className="rounded-xl bg-brand-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-brand-700">
              <Sparkles size={16} className="text-amber-500" />
              Phân tích AI
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-2xl font-extrabold ${scoreColor(
                  insight?.ai_score ?? lead.ai_score,
                )}`}
              >
                {insight?.ai_score ?? lead.ai_score}
              </span>
              {insight?.ai_tier && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tierBadge(
                    insight.ai_tier,
                  )}`}
                >
                  {tierLabel(insight.ai_tier)}
                </span>
              )}
            </div>
          </div>

          {insight?.ai_reason && (
            <p className="mt-2 text-sm text-brand-700">{insight.ai_reason}</p>
          )}

          {insight?.ai_best_time && (
            <div className="mt-2 flex items-start gap-1.5 text-sm text-brand-700">
              <Clock size={15} className="mt-0.5 shrink-0 text-brand-500" />
              <span>
                <b>Thời điểm liên hệ tốt nhất:</b> {insight.ai_best_time}
              </span>
            </div>
          )}

          {(insight?.ai_next_action?.summary ||
            insight?.ai_next_action?.suggested_action) && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700">
                <Lightbulb size={15} /> Gợi ý hành động (AI)
              </div>
              {insight?.ai_next_action?.summary && (
                <p className="mt-0.5 text-brand-700">
                  {insight.ai_next_action.summary}
                </p>
              )}
              {insight?.ai_next_action?.suggested_action && (
                <p className="mt-0.5 font-medium text-brand-900">
                  {insight.ai_next_action.suggested_action}
                </p>
              )}
            </div>
          )}

          <button
            onClick={rescore}
            disabled={rescoring}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:border-amber-300 hover:text-amber-600 disabled:opacity-60"
          >
            <RefreshCw size={15} className={rescoring ? "animate-spin" : ""} />
            {rescoring ? "Đang chấm…" : "Chấm điểm lại bằng AI"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-brand-600">
          <div>Nguồn: <b className="text-brand-800">{SOURCE_LABEL[lead.source]}</b></div>
          <div>Lịch hẹn: <b className="text-brand-800">{lead.booking_count}</b></div>
          <div>
            Đăng ký web:{" "}
            <b className="text-brand-800">{lead.registered ? "Có" : "Chưa"}</b>
          </div>
          <div>Lượt liên hệ: <b className="text-brand-800">{lead.contact_count}</b></div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <a
            href={`tel:${lead.phone}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            <Phone size={16} /> Gọi
          </a>
          <a
            href={zaloLink}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            <MessageCircle size={16} /> Zalo
          </a>
          <button
            onClick={() => setLogOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Log
          </button>
        </div>

        {/* Edit form */}
        <div>
          <label className="block text-sm font-medium text-brand-800">Trạng thái</label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
                  status === s ? STATUS_BADGE[s] : "bg-white text-brand-500 ring-brand-200"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-brand-800">Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm text-brand-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>

        {/* Contact log history */}
        <div>
          <h4 className="text-sm font-bold text-brand-900">Lịch sử liên hệ ({logs.length})</h4>
          <ul className="mt-2 space-y-2">
            {logs.length === 0 && (
              <li className="text-sm text-brand-400">Chưa có liên hệ nào.</li>
            )}
            {logs.map((log) => (
              <li key={log.id} className="rounded-lg border border-brand-50 bg-brand-50/40 px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-brand-800">
                    {CHANNEL_LABEL[log.channel]} · {OUTCOME_LABEL[log.outcome]}
                  </span>
                  <span className="text-brand-400">{formatDateTime(log.created_at)}</span>
                </div>
                {log.note && <p className="mt-1 text-sm text-brand-700">{log.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {logOpen && (
        <ContactLogModal
          token={token}
          leadId={leadId}
          leadName={lead.name}
          onClose={() => setLogOpen(false)}
          onLogged={() => {
            load();
            onChanged();
          }}
        />
      )}
    </aside>
  );
}
