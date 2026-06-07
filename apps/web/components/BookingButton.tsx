"use client";

import Link from "next/link";

import { Calendar } from "@/components/dashboard/icons";

/**
 * Nút "Đặt lịch xem nhà" tái dùng — chèn vào unit card / popup map / trang chi
 * tiết căn. Bấm → điều hướng tới form đặt lịch với căn auto-fill.
 */
export function BookingButton({
  unitId,
  unitName,
  variant = "primary",
  className = "",
}: {
  unitId: string;
  unitName?: string;
  variant?: "primary" | "outline" | "compact";
  className?: string;
}) {
  const href = `/client/booking/new?unit=${encodeURIComponent(unitId)}`;

  if (variant === "compact") {
    return (
      <Link
        href={href}
        title={`Đặt lịch xem ${unitName ?? unitId}`}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 ${className}`}
      >
        <Calendar size={14} />
        Đặt lịch
      </Link>
    );
  }

  if (variant === "outline") {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 ${className}`}
      >
        <Calendar size={16} />
        Đặt lịch xem nhà
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 ${className}`}
    >
      <Calendar size={18} />
      📅 Đặt lịch xem nhà
    </Link>
  );
}
