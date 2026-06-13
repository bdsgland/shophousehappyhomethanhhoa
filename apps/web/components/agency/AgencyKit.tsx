"use client";

/**
 * Bộ UI + tiện ích dùng chung cho khu điều hành chủ sàn (Agency, mobile-first).
 *
 * - useAgencyAuth(): đọc token/JWT phía client; nếu chưa đăng nhập → đẩy về /login.
 * - Các component thẻ KPI lớn, tiêu đề, trạng thái tải/lỗi/thiếu quyền.
 * - Hàm format số/tiền gọn cho màn hình điện thoại.
 *
 * Mọi API quản lý gọi qua lib/api (managerRequest) — backend gác bằng require_admin.
 * Lỗi 401/403 → <AgencyError> hiển thị "Tài khoản không có quyền quản lý".
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { AuthUser } from "@/lib/api";
import { isPermissionError } from "@/lib/api";
import { readToken, readUserFromCookie } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Auth hook
// ---------------------------------------------------------------------------

export function useAgencyAuth(): {
  token: string | null;
  user: AuthUser | null;
  ready: boolean;
} {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    setUser(readUserFromCookie());
    setReady(true);
    if (!t) {
      router.replace("/login?next=/agency/overview");
    }
  }, [router]);

  return { token, user, ready };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("vi-VN");
}

/** Tiền VNĐ rút gọn: tỷ / triệu / nghìn cho dễ đọc trên điện thoại. */
export function fmtMoneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)} N`;
  return n.toLocaleString("vi-VN");
}

export function fmtTy(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("vi-VN")} tỷ`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n}%`;
}

/** "vừa xong / 3 phút trước / 13/06 14:20" từ ISO. */
export function fmtTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

export function AgencyHeader({
  title,
  subtitle,
  onRefresh,
  refreshing,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-brand-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-brand-700">{subtitle}</p>}
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0 rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-800 hover:border-brand-500 disabled:opacity-60"
        >
          {refreshing ? "Đang tải…" : "Làm mới"}
        </button>
      )}
    </header>
  );
}

const TONES: Record<string, string> = {
  brand: "border-brand-100 bg-brand-50 text-brand-900",
  red: "border-red-200 bg-red-50 text-red-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
};

/** Thẻ KPI lớn, dễ đọc trên điện thoại. */
export function KpiCard({
  label,
  value,
  sub,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof TONES | string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${TONES[tone] ?? TONES.brand}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs opacity-70">{sub}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-brand-100 text-brand-700",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const label =
    priority === "high" ? "Khẩn" : priority === "medium" ? "Vừa" : "Thấp";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.low
      }`}
    >
      {label}
    </span>
  );
}

export function AgencyLoading({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-6 text-center text-sm text-brand-700">
      {label}
    </div>
  );
}

/** Hiển thị lỗi: 401/403 → thông báo thiếu quyền; còn lại → thông báo lỗi chung. */
export function AgencyError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (isPermissionError(error)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="text-base font-semibold text-amber-900">
          Tài khoản không có quyền quản lý
        </div>
        <p className="mt-1 text-sm text-amber-800">
          Khu điều hành chỉ dành cho tài khoản Quản lý / Chủ sàn. Vui lòng đăng
          nhập bằng tài khoản có quyền phù hợp.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Đăng nhập lại
        </Link>
      </div>
    );
  }
  const message =
    error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <div className="text-base font-semibold text-red-900">
        Không tải được dữ liệu
      </div>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-brand-100 bg-brand-50/40 p-6 text-center text-sm text-brand-600">
      {text}
    </div>
  );
}

/** Toast nhẹ (tự ẩn) cho phản hồi hành động. */
export function useToast() {
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const show = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 3500);
  }, []);
  const node = toast ? (
    <div
      className={`fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[90%] rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
        toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {toast.text}
    </div>
  ) : null;
  return { show, node };
}
