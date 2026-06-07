"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChevronLeft } from "@/components/dashboard/icons";
import { readToken } from "@/lib/auth";
import {
  type Booking,
  type BookingStatus,
  STATUS_BADGE,
  STATUS_LABELS,
  fetchBooking,
  formatBookingTime,
} from "@/lib/booking";

const CHATWOOT_URL = "https://chat.eurowindowlightcity.net";

export default function AgentBookingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = readToken();
    if (!t) {
      setError("Vui lòng đăng nhập");
      setLoading(false);
      return;
    }
    fetchBooking(t, params.id)
      .then(setBooking)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading)
    return (
      <div className="rounded-2xl border border-brand-100 bg-white p-10 text-center text-sm text-brand-500">
        Đang tải…
      </div>
    );
  if (error || !booking)
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error ?? "Không tìm thấy booking"}
        </div>
      </div>
    );

  const status = booking.status as BookingStatus;

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">
            {booking.customer_name}
          </h1>
          <p className="text-sm text-brand-600">
            Lịch xem {booking.unit_summary || booking.unit_id}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${STATUS_BADGE[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Khách hàng */}
        <Card title="Thông tin khách hàng">
          <Field label="Họ tên" value={booking.customer_name} />
          <Field label="Điện thoại" value={booking.customer_phone} />
          <Field label="Email" value={booking.customer_email} />
          <Field
            label="AI score"
            value={`${booking.ai_score}/100`}
          />
          <div className="mt-3 flex gap-2">
            <a
              href={`tel:${booking.customer_phone}`}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-700"
            >
              📞 Gọi khách
            </a>
            <a
              href={CHATWOOT_URL}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-lg border border-brand-200 px-3 py-2 text-center text-sm font-semibold text-brand-800 hover:border-indigo-300"
            >
              💬 Mở Chatwoot
            </a>
          </div>
        </Card>

        {/* Căn hộ */}
        <Card title="Thông tin căn hộ">
          <Field label="Mã căn" value={booking.unit_id} />
          <Field label="Mô tả" value={booking.unit_summary || "—"} />
          <Field label="Giờ hẹn" value={formatBookingTime(booking.scheduled_at)} />
          {booking.notes && <Field label="Ghi chú khách" value={booking.notes} />}
        </Card>
      </div>

      {/* Lịch sử */}
      <Card title="Lịch sử">
        <ul className="space-y-2 text-sm text-brand-700">
          <li className="flex justify-between">
            <span>Khách tạo booking</span>
            <span className="text-brand-500">
              {formatBookingTime(booking.created_at)}
            </span>
          </li>
          <li className="flex justify-between">
            <span>Cập nhật gần nhất ({STATUS_LABELS[status]})</span>
            <span className="text-brand-500">
              {formatBookingTime(booking.updated_at)}
            </span>
          </li>
          {booking.referral_code && (
            <li className="flex justify-between">
              <span>Mã giới thiệu</span>
              <span className="font-mono text-brand-700">
                {booking.referral_code}
              </span>
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/agent/bookings"
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-900"
    >
      <ChevronLeft size={16} />
      Về danh sách booking
    </Link>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-500">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-brand-500">{label}</span>
      <span className="text-right font-medium text-brand-900">{value}</span>
    </div>
  );
}
