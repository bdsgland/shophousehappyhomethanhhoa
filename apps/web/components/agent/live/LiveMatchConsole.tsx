"use client";

import { useEffect, useState } from "react";

import { Radio, Sparkles } from "@/components/dashboard/icons";
import { useSalePresence } from "@/hooks/useSalePresence";
import {
  type MatchOutcome,
  type MatchRequest,
  completeMatch,
} from "@/lib/match";
import { readToken } from "@/lib/auth";

import { AvailabilityToggle } from "./AvailabilityToggle";
import { IncomingMatchModal } from "./IncomingMatchModal";
import { MeetReadyCard } from "./MeetReadyCard";
import { PostCallForm } from "./PostCallForm";

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white px-4 py-2 text-center shadow-sm">
      <div className="text-lg font-bold text-brand-900">{value}</div>
      <div className="text-[11px] text-brand-500">{label}</div>
    </div>
  );
}

export function LiveMatchConsole() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(readToken()), []);

  const {
    connected,
    availability,
    incoming,
    live,
    stats,
    setAvailability,
    accept,
    decline,
    clearLive,
  } = useSalePresence(token);

  const [completing, setCompleting] = useState<MatchRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function startCompleting() {
    if (live) {
      setCompleting(live);
      clearLive();
    }
  }

  async function submitOutcome(outcome: MatchOutcome, note: string) {
    if (!token || !completing) return;
    setSubmitting(true);
    try {
      await completeMatch(token, completing.id, outcome, note);
      setCompleting(null);
    } catch {
      /* giữ form để thử lại */
    } finally {
      setSubmitting(false);
    }
  }

  const acceptRate =
    stats && stats.total > 0
      ? `${Math.round((stats.accepted / stats.total) * 100)}%`
      : "—";

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-brand-900">
              <Radio size={22} className="text-rose-500" /> Khách live
            </h1>
            <p className="mt-0.5 text-sm text-brand-600">
              Nhận khách online tức thì qua Google Meet.
            </p>
          </div>
          <AvailabilityToggle
            availability={availability}
            connected={connected}
            onChange={setAvailability}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatPill label="Khách hôm nay" value={stats?.total ?? 0} />
          <StatPill label="Tỉ lệ nhận" value={acceptRate} />
          <StatPill label="Hoàn tất" value={stats?.completed ?? 0} />
        </div>
      </div>

      {/* Main area */}
      {completing ? (
        <PostCallForm
          match={completing}
          submitting={submitting}
          onSubmit={submitOutcome}
          onSkip={() => setCompleting(null)}
        />
      ) : live ? (
        <MeetReadyCard match={live} onEnd={startCompleting} />
      ) : (
        <WaitingState ready={availability === "online"} />
      )}

      {/* Incoming modal (luôn nổi trên cùng nếu có) */}
      {incoming && (
        <IncomingMatchModal
          match={incoming}
          onAccept={accept}
          onDecline={decline}
          onExpire={() => decline(incoming.id)}
        />
      )}
    </div>
  );
}

function WaitingState({ ready }: { ready: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
        {ready ? (
          <span className="flex h-4 w-4">
            <span className="absolute inline-flex h-4 w-4 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <span className="h-4 w-4 rounded-full bg-brand-300" />
        )}
      </div>
      <div className="mt-4 text-base font-semibold text-brand-900">
        {ready ? "Đang chờ khách…" : "Bạn đang tạm dừng nhận khách"}
      </div>
      <p className="mt-1 text-sm text-brand-600">
        {ready
          ? "Khi có khách online, lời mời sẽ hiện ngay tại đây kèm âm báo."
          : "Bật “Sẵn sàng” ở góc trên để bắt đầu nhận khách live."}
      </p>
      <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
        <Sparkles size={14} /> Mẹo: luôn online giờ vàng 18–22h để nhận nhiều khách
        nhất.
      </div>
    </div>
  );
}
