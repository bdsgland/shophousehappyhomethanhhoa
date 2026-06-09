"use client";

import { useState } from "react";

import type { MatchOutcome, MatchRequest } from "@/lib/match";

// Form sale điền sau khi call kết thúc → POST outcome về backend.
const FEELINGS: { value: MatchOutcome; label: string; emoji: string; color: string }[] = [
  { value: "interested", label: "Quan tâm", emoji: "😊", color: "emerald" },
  { value: "follow_up", label: "Cân nhắc", emoji: "😐", color: "amber" },
  { value: "not_interested", label: "Không phù hợp", emoji: "😞", color: "rose" },
];

const NEXT_STEPS: { value: MatchOutcome; label: string }[] = [
  { value: "booked", label: "Đặt cọc / Hẹn xem nhà" },
  { value: "follow_up", label: "Gọi lại sau" },
  { value: "not_interested", label: "Đóng" },
];

export function PostCallForm({
  match,
  submitting,
  onSubmit,
  onSkip,
}: {
  match: MatchRequest;
  submitting: boolean;
  onSubmit: (outcome: MatchOutcome, note: string) => void;
  onSkip: () => void;
}) {
  const [feeling, setFeeling] = useState<MatchOutcome | null>(null);
  const [step, setStep] = useState<MatchOutcome | null>(null);
  const [note, setNote] = useState("");

  // outcome ưu tiên "bước tiếp theo" (booked/follow_up) nếu chọn, else cảm nhận.
  const outcome = step ?? feeling;

  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
      <h3 className="text-base font-bold text-brand-900">
        Ghi nhận kết quả với {match.customer_name}
      </h3>
      <p className="mt-1 text-sm text-brand-600">
        Vài giây để lưu lại — giúp hệ thống chăm sóc khách tốt hơn.
      </p>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase text-brand-500">
          Cảm nhận của khách
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FEELINGS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFeeling(f.value)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm transition ${
                feeling === f.value
                  ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-700"
                  : "border-brand-100 text-brand-700 hover:bg-brand-50"
              }`}
            >
              <span className="text-2xl">{f.emoji}</span>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase text-brand-500">
          Bước tiếp theo
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {NEXT_STEPS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setStep(s.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                step === s.value
                  ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-700"
                  : "border-brand-100 text-brand-700 hover:bg-brand-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Ghi chú thêm về khách (ngân sách, nhu cầu, hẹn lịch…)"
        className="mt-4 w-full rounded-xl border border-brand-200 p-3 text-sm text-brand-900 outline-none focus:border-indigo-400"
      />

      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-brand-500 hover:text-brand-700"
        >
          Bỏ qua
        </button>
        <button
          type="button"
          disabled={!outcome || submitting}
          onClick={() => outcome && onSubmit(outcome, note)}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Đang lưu…" : "Lưu kết quả"}
        </button>
      </div>
    </div>
  );
}
