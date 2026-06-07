"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { readToken } from "@/lib/auth";
import {
  type Booking,
  fetchBooking,
  formatBookingTime,
} from "@/lib/booking";

export default function BookingSuccessPage({
  params,
}: {
  params: { id: string };
}) {
  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    const token = readToken();
    if (!token) return; // khách ẩn danh: hiển thị xác nhận chung
    fetchBooking(token, params.id)
      .then(setBooking)
      .catch(() => undefined);
  }, [params.id]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">
          🎉
        </div>
        <h1 className="mt-4 text-2xl font-bold text-brand-900">
          Đặt lịch thành công!
        </h1>
        <p className="mt-2 text-sm text-brand-600">
          Saleman sẽ liên hệ với bạn trong{" "}
          <b className="text-emerald-700">30 giây</b> để xác nhận lịch hẹn.
        </p>

        {booking && (
          <div className="mt-6 space-y-2 rounded-xl border border-brand-100 bg-brand-50/40 p-5 text-left text-sm">
            <Row label="Căn hộ" value={booking.unit_summary || booking.unit_id} />
            <Row
              label="Thời gian"
              value={formatBookingTime(booking.scheduled_at)}
            />
            <Row label="Họ tên" value={booking.customer_name} />
            <Row label="Điện thoại" value={booking.customer_phone} />
            <Row label="Email" value={booking.customer_email} />
            {booking.notes && <Row label="Ghi chú" value={booking.notes} />}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard/project/eurowindow-light-city"
            className="rounded-lg border border-brand-200 px-5 py-2.5 text-sm font-semibold text-brand-800 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            Xem căn khác
          </Link>
          <Link
            href="/client/booking"
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Lịch hẹn của tôi
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-brand-500">{label}</span>
      <span className="text-right font-medium text-brand-900">{value}</span>
    </div>
  );
}
