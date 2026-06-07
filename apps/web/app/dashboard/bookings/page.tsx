"use client";

import { useEffect, useMemo, useState } from "react";

import { Calendar, Download } from "@/components/dashboard/icons";
import { fetchAdminUsers, type AuthUser } from "@/lib/api";
import { readToken } from "@/lib/auth";
import {
  type Booking,
  type BookingStatus,
  STATUS_BADGE,
  STATUS_LABELS,
  fetchBookings,
  formatBookingTime,
} from "@/lib/booking";

const STATUS_OPTIONS: (BookingStatus | "")[] = [
  "",
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

export default function AdminBookingsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [sales, setSales] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bộ lọc
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [saleId, setSaleId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const saleName = useMemo(() => {
    const m = new Map<string, string>();
    sales.forEach((s) => m.set(s.id, s.full_name));
    return m;
  }, [sales]);

  function load(t: string) {
    setLoading(true);
    setError(null);
    fetchBookings(t, {
      status: status || undefined,
      sale_id: saleId || undefined,
      date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      date_to: dateTo ? new Date(dateTo).toISOString() : undefined,
      page_size: 200,
    })
      .then((r) => {
        setBookings(r.items);
        setTotal(r.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = readToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    fetchAdminUsers(t).then((us) =>
      setSales(us.filter((u) => u.role === "sale" || u.role === "admin")),
    );
    load(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    if (token) load(token);
  }

  function exportCsv() {
    const header = [
      "id",
      "khach_hang",
      "dien_thoai",
      "email",
      "can_ho",
      "gio_hen",
      "trang_thai",
      "ai_score",
      "sale",
    ];
    const rows = bookings.map((b) => [
      b.id,
      b.customer_name,
      b.customer_phone,
      b.customer_email,
      b.unit_summary || b.unit_id,
      formatBookingTime(b.scheduled_at),
      STATUS_LABELS[b.status],
      String(b.ai_score),
      b.sale_id ? saleName.get(b.sale_id) ?? b.sale_id : "—",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            <Calendar size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-brand-900">
              Quản lý booking
            </h1>
            <p className="text-sm text-brand-600">
              Tổng {total} lịch hẹn xem nhà toàn hệ thống.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={bookings.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-800 transition hover:border-amber-300 disabled:opacity-50"
        >
          <Download size={16} />
          Export CSV
        </button>
      </header>

      {!token ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-600">
          Vui lòng đăng nhập tài khoản quản trị.
        </div>
      ) : (
        <>
          {/* Bộ lọc */}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
            <Filter label="Trạng thái">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BookingStatus | "")}
                className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s ? STATUS_LABELS[s as BookingStatus] : "Tất cả"}
                  </option>
                ))}
              </select>
            </Filter>
            <Filter label="Sale">
              <select
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
                className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm"
              >
                <option value="">Tất cả</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </Filter>
            <Filter label="Từ ngày">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm"
              />
            </Filter>
            <Filter label="Đến ngày">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm"
              />
            </Filter>
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Lọc
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-brand-100 bg-white p-10 text-center text-sm text-brand-500">
              Đang tải…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-500">
              Chưa có booking nào khớp bộ lọc.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-brand-500">
                    <th className="px-4 py-3">Khách hàng</th>
                    <th className="px-4 py-3">Căn hộ</th>
                    <th className="px-4 py-3">Giờ hẹn</th>
                    <th className="px-4 py-3">AI</th>
                    <th className="px-4 py-3">Sale</th>
                    <th className="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-brand-50 last:border-0 hover:bg-brand-50/40"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-brand-900">
                          {b.customer_name}
                        </div>
                        <div className="text-xs text-brand-500">
                          {b.customer_phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-brand-700">
                        {b.unit_summary || b.unit_id}
                      </td>
                      <td className="px-4 py-3 text-brand-700">
                        {formatBookingTime(b.scheduled_at)}
                      </td>
                      <td className="px-4 py-3 font-bold text-brand-900">
                        {b.ai_score}
                      </td>
                      <td className="px-4 py-3 text-brand-700">
                        {b.sale_id ? saleName.get(b.sale_id) ?? "—" : "Chưa gán"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                            STATUS_BADGE[b.status]
                          }`}
                        >
                          {STATUS_LABELS[b.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-brand-500">{label}</span>
      {children}
    </div>
  );
}
