"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Check, X } from "@/components/dashboard/icons";
import type { MatchRequest } from "@/lib/match";

// Modal nổi khi có khách live — đếm ngược 15s + 2 nút Nhận/Bỏ qua.
// Hết giờ tự gọi onExpire (backend cũng tự expire — đây chỉ để UI mượt).
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function IncomingMatchModal({
  match,
  onAccept,
  onDecline,
  onExpire,
}: {
  match: MatchRequest;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onExpire: () => void;
}) {
  const total = useMemo(() => {
    if (!match.invite_expires_at) return 15;
    const ms = new Date(match.invite_expires_at).getTime() - Date.now();
    return Math.max(1, Math.round(ms / 1000));
  }, [match.invite_expires_at]);

  const [remaining, setRemaining] = useState(total);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    setRemaining(total);
    const deadline = match.invite_expires_at
      ? new Date(match.invite_expires_at).getTime()
      : Date.now() + total * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpire();
      }
    }, 250);
    return () => clearInterval(id);
  }, [match.id, match.invite_expires_at, total, onExpire]);

  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-[pop_0.2s_ease-out] rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-2xl font-bold text-white">
              {initials(match.customer_name)}
            </div>
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs text-white">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative">!</span>
            </span>
          </div>
          <div className="mt-4 text-lg font-bold text-brand-900">
            {match.customer_name}
          </div>
          <div className="text-sm text-brand-600">muốn được tư vấn ngay 🎥</div>

          {/* Đếm ngược */}
          <div className="mt-4 w-full">
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-brand-500">
              <span>Tự động bỏ qua sau</span>
              <span className="tabular-nums font-bold text-rose-600">
                {remaining}s
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full bg-rose-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="mt-5 grid w-full grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onDecline(match.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              <X size={18} /> Bỏ qua
            </button>
            <button
              type="button"
              onClick={() => onAccept(match.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Check size={18} /> NHẬN ngay
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes pop {
          from {
            transform: scale(0.92);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
