"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Calendar, Eye } from "@/components/dashboard/icons";
import { readToken } from "@/lib/auth";
import {
  type Booking,
  type BookingStatus,
  STATUS_BADGE,
  STATUS_LABELS,
  fetchMyBookings,
  formatBookingTime,
  isUpcoming,
  isUrgent,
  localToIso,
  rescheduleBooking,
  updateBookingStatus,
} from "@/lib/booking";

type Tab = "upcoming" | "completed" | "overdue";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Sắp tới" },
  { key: "completed", label: "Hoàn thành" },
  { key: "overdue", label: "Quá hạn" },
];

export default function AgentBookingsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    fetchMyBookings(t)
      .then(setBookings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function patch(updated: Booking) {
    setBookings((bs) => bs.map((b) => (b.id === updated.id ? updated : b)));
  }

  const shown = bookings.filter((b) => {
    const active = b.status === "pending" || b.status === "confirmed";
    if (tab === "completed") return b.status === "completed";
    if (tab === "overdue") return (active && !isUpcoming(b)) || b.status === "no_show";
    return active && isUpcoming(b);
  });

  const counts = {
    upcoming: bookings.filter(
      (b) => (b.status === "pending" || b.status === "confirmed") && isUpcoming(b),
    ).length,
    urgent: bookings.filter(
      (b) => (b.status === "pending" || b.status === "confirmed") && isUrgent(b),
    ).length,
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Lịch booking</h1>
        <p className="text-sm text-brand-600">
          {counts.upcoming} lịch sắp tới
          {counts.urgent > 0 && (
            <span className="ml-1 font-semibold text-rose-600">
              · {counts.urgent} cần liên hệ gấp (&lt; 24h)
            </span>
          )}
        </p>
      </header>

      {!token ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-600">
          Vui lòng đăng nhập tài khoản sale để xem lịch booking.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                    : "border border-brand-100 bg-white text-brand-700 hover:border-amber-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-brand-100 bg-white p-10 text-center text-sm text-brand-500">
              Đang tải…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-500">
              Không có lịch booking trong mục này.
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((b) => (
                <SaleBookingRow
                  key={b.id}
                  booking={b}
                  token={token}
                  onChange={patch}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SaleBookingRow({
  booking,
  token,
  onChange,
}: {
  booking: Booking;
  token: string;
  onChange: (b: Booking) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedAt, setReschedAt] = useState("");
  const status = booking.status as BookingStatus;
  const urgent = isUrgent(booking);

  async function setStatus(s: BookingStatus) {
    setBusy(true);
    try {
      onChange(await updateBookingStatus(token, booking.id, s));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveResched() {
    if (!reschedAt) return;
    setBusy(true);
    try {
      onChange(await rescheduleBooking(token, booking.id, localToIso(reschedAt)));
      setReschedOpen(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        urgent ? "border-rose-200 ring-1 ring-rose-100" : "border-brand-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-brand-900">
              {booking.customer_name}
            </span>
            <ScoreBadge score={booking.ai_score} />
          </div>
          <div className="mt-1 text-sm text-brand-600">
            {booking.unit_summary || booking.unit_id}
          </div>
          <div
            className={`mt-1 flex items-center gap-1.5 text-sm ${
              urgent ? "font-semibold text-rose-600" : "text-brand-600"
            }`}
          >
            <Calendar size={15} />
            {formatBookingTime(booking.scheduled_at)}
            {urgent && " · gấp!"}
          </div>
          <a
            href={`tel:${booking.customer_phone}`}
            className="mt-1 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            📞 {booking.customer_phone}
          </a>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${STATUS_BADGE[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {reschedOpen && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-brand-50/60 p-3">
          <input
            type="datetime-local"
            value={reschedAt}
            onChange={(e) => setReschedAt(e.target.value)}
            className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={busy || !reschedAt}
            onClick={saveResched}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-indigo-300"
          >
            Lưu giờ mới
          </button>
          <button
            type="button"
            onClick={() => setReschedOpen(false)}
            className="rounded-lg px-3 py-1.5 text-xs text-brand-600"
          >
            Bỏ
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "pending" && (
          <ActionBtn busy={busy} onClick={() => setStatus("confirmed")} kind="primary">
            Xác nhận
          </ActionBtn>
        )}
        {(status === "pending" || status === "confirmed") && (
          <>
            <ActionBtn busy={busy} onClick={() => setReschedOpen((o) => !o)}>
              Đổi giờ
            </ActionBtn>
            <ActionBtn busy={busy} onClick={() => setStatus("completed")} kind="success">
              Hoàn thành
            </ActionBtn>
            <ActionBtn busy={busy} onClick={() => setStatus("no_show")} kind="danger">
              Khách không đến
            </ActionBtn>
          </>
        )}
        <Link
          href={`/agent/bookings/${booking.id}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:border-amber-300"
        >
          <Eye size={14} />
          Chi tiết
        </Link>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-rose-50 text-rose-700"
      : score >= 60
      ? "bg-amber-50 text-amber-700"
      : "bg-brand-100 text-brand-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`}>
      AI {score}
    </span>
  );
}

function ActionBtn({
  children,
  onClick,
  busy,
  kind = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  kind?: "primary" | "success" | "danger" | "neutral";
}) {
  const styles: Record<string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    danger: "border border-rose-200 text-rose-700 hover:bg-rose-50",
    neutral: "border border-brand-200 text-brand-700 hover:border-amber-300",
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${styles[kind]}`}
    >
      {children}
    </button>
  );
}
