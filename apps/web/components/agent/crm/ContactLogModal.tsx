"use client";

import { useState } from "react";

import { X } from "@/components/dashboard/icons";
import {
  addContactLog,
  CHANNEL_LABEL,
  OUTCOME_LABEL,
  type ContactChannel,
  type ContactLog,
  type ContactOutcome,
} from "@/lib/crm";

const CHANNELS: ContactChannel[] = [
  "call",
  "zalo",
  "sms",
  "facebook",
  "email",
  "inperson",
];
const OUTCOMES: ContactOutcome[] = [
  "interested",
  "callback",
  "no_answer",
  "not_interested",
  "booked",
];

export function ContactLogModal({
  token,
  leadId,
  leadName,
  onClose,
  onLogged,
}: {
  token: string;
  leadId: string;
  leadName: string;
  onClose: () => void;
  onLogged: (log: ContactLog) => void;
}) {
  const [channel, setChannel] = useState<ContactChannel>("call");
  const [outcome, setOutcome] = useState<ContactOutcome>("interested");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const log = await addContactLog(token, leadId, { channel, note, outcome });
      onLogged(log);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-900">Ghi nhận liên hệ</h3>
          <button onClick={onClose} className="text-brand-400 hover:text-brand-700">
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-sm text-brand-600">Khách: {leadName}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-800">Kênh liên hệ</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    channel === c
                      ? "bg-orange-500 text-white"
                      : "border border-brand-100 bg-white text-brand-700 hover:border-amber-300"
                  }`}
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-800">Kết quả</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-800">Ghi chú</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Nội dung trao đổi, nhu cầu khách…"
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={saving || !note.trim()}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? "Đang lưu…" : "Lưu liên hệ"}
          </button>
        </div>
      </div>
    </div>
  );
}
