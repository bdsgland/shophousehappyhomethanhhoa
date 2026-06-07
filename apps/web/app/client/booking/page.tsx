"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Calendar } from "@/components/dashboard/icons";
import { readToken } from "@/lib/auth";
import {
  type Booking,
  type BookingStatus,
  STATUS_BADGE,
  STATUS_LABELS,
  fetchMyBookings,
  formatBookingTime,
  isUpcoming,
  updateBookingStatus,
} from "@/lib/booking";

type Tab = "upcoming" | "completed" | "cancelled";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Sắp tới" },
  { key: "completed", label: "Đã hoàn thành" },
  { key: "cancelled", label: "Đã huỷ" },
];

export default function ClientBookingsPage() {
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

  async function cancel(id: string) {
    if (!token) return;
    try {
      const updated = await updateBookingStatus(token, id, "cancelled");
      setBookings((bs) => bs.map((b) => (b.id === id ? updated : b)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const shown = bookings.filter((b) => {
    if (tab === "cancelled") return b.status === "cancelled";
    if (tab === "completed") return b.status === "completed";
    // upcoming: pending/confirmed và còn trong tương lai
    return (
      (b.status === "pending" || b.status === "confirmed") && isUpcoming(b)
    );
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Lịch hẹn của tôi</h1>
          <p className="text-sm text-brand-600">
            Theo dõi các buổi xem nhà bạn đã đặt.
          </p>
        </div>
        <Link
          href="/client/booking/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Calendar size={16} />
          Đặt lịch mới
        </Link>
      </header>

      {!token ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-600">
          Vui lòng{" "}
          <Link href="/login?next=/client/booking" className="font-semibold text-indigo-600">
            đăng nhập
          </Link>{" "}
          để xem lịch hẹn của bạn.
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "border border-brand-100 bg-white text-brand-700 hover:border-indigo-300"
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
              Không có lịch hẹn trong mục này.
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((b) => (
                <ClientBookingCard
                  key={b.id}
                  booking={b}
                  onCancel={() => cancel(b.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClientBookingCard({
  booking,
  onCancel,
}: {
  booking: Booking;
  onCancel: () => void;
}) {
  const status = booking.status as BookingStatus;
  const canCancel =
    (status === "pending" || status === "confirmed") && isUpcoming(booking);
  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-bold text-brand-900">
            {booking.unit_summary || booking.unit_id}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-brand-600">
            <Calendar size={15} className="text-indigo-500" />
            {formatBookingTime(booking.scheduled_at)}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${STATUS_BADGE[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
      {booking.notes && (
        <p className="mt-3 rounded-lg bg-brand-50/50 px-3 py-2 text-sm text-brand-700">
          {booking.notes}
        </p>
      )}
      {canCancel && (
        <div className="mt-4 flex justify-end gap-2">
          <Link
            href={`/client/booking/new?unit=${encodeURIComponent(booking.unit_id)}`}
            className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:border-indigo-300"
          >
            Đặt căn này lần nữa
          </Link>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            Huỷ lịch
          </button>
        </div>
      )}
    </div>
  );
}
