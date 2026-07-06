"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Calendar } from "@/components/dashboard/icons";
import {
  fetchInventory,
  type AuthUser,
  type InventoryUnit,
} from "@/lib/api";
import { readUserFromCookie } from "@/lib/auth";
import { createBooking, defaultSlot, localToIso } from "@/lib/booking";

export default function BookingNewPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl" />}>
      <BookingForm />
    </Suspense>
  );
}

function BookingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialUnit = params.get("unit") ?? "";
  const ref = params.get("ref") ?? "";

  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [unitId, setUnitId] = useState(initialUnit);
  const [scheduledLocal, setScheduledLocal] = useState(defaultSlot());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const u: AuthUser | null = readUserFromCookie();
    if (u) {
      setName(u.full_name ?? "");
      setPhone(u.phone ?? "");
      setEmail(u.email ?? "");
    }
    fetchInventory()
      .then((list) => {
        if (!list) return;
        setUnits(list);
        if (!initialUnit && list[0]) setUnitId(list[0].code);
      })
      .catch(() => undefined);
  }, [initialUnit]);

  const selected = units.find((u) => u.code === unitId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!unitId) {
      setError("Vui lòng chọn căn muốn xem");
      return;
    }
    setSubmitting(true);
    try {
      const booking = await createBooking({
        unit_id: unitId,
        scheduled_at: localToIso(scheduledLocal),
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim(),
        notes: notes.trim() || undefined,
        referral_code: ref || undefined,
      });
      router.push(`/client/booking/${booking.id}/success`);
    } catch (err) {
      setError((err as Error).message || "Đặt lịch thất bại, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white">
          <Calendar size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Đặt lịch xem nhà</h1>
          <p className="text-sm text-brand-600">
            Chuyên viên Happy Home sẽ liên hệ xác nhận trong ít phút.
          </p>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-brand-100 bg-white p-6 shadow-sm"
      >
        {/* Căn */}
        <div>
          <label className="block text-sm font-medium text-brand-900">
            Căn muốn xem
          </label>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {!unitId && <option value="">— Chọn căn —</option>}
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} · {u.zone} · {u.type} · {u.price}
              </option>
            ))}
            {/* Giữ căn từ link kể cả khi chưa load xong danh sách */}
            {unitId && !units.some((u) => u.code === unitId) && (
              <option value={unitId}>{unitId}</option>
            )}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-brand-600">
              {selected.area} m² · mặt tiền {selected.facade} m · {selected.status}
            </p>
          )}
        </div>

        {/* Ngày giờ */}
        <div>
          <label className="block text-sm font-medium text-brand-900">
            Ngày &amp; giờ xem
          </label>
          <input
            type="datetime-local"
            required
            value={scheduledLocal}
            onChange={(e) => setScheduledLocal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-brand-500">
            Khuyến nghị xem nhà trong giờ hành chính các ngày trong tuần.
          </p>
        </div>

        {/* Họ tên + SĐT */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-brand-900">Họ tên</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Số điện thoại
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="09xx xxx xxx"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-brand-900">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="email@cua.ban"
          />
        </div>

        {/* Ghi chú */}
        <div>
          <label className="block text-sm font-medium text-brand-900">
            Ghi chú (tuỳ chọn)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="VD: muốn xem thêm căn góc, quan tâm chính sách vay 70%…"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {submitting ? "Đang gửi…" : "Xác nhận đặt lịch"}
        </button>
      </form>
    </div>
  );
}
