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

// ---------------------------------------------------------------------------
// Badges (tầng AI nóng/ấm/lạnh, mức độ ưu tiên đề xuất)
// ---------------------------------------------------------------------------

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  hot: { label: "Nóng", cls: "bg-red-100 text-red-700" },
  warm: { label: "Ấm", cls: "bg-amber-100 text-amber-700" },
  cold: { label: "Lạnh", cls: "bg-sky-100 text-sky-700" },
};

export function TierBadge({ tier }: { tier?: string | null }) {
  const meta = tier ? TIER_BADGE[tier] : undefined;
  if (!meta) {
    return (
      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
        Chưa chấm
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  high: { label: "Khẩn", cls: "bg-red-100 text-red-700" },
  medium: { label: "Vừa", cls: "bg-amber-100 text-amber-700" },
  low: { label: "Thấp", cls: "bg-emerald-100 text-emerald-700" },
};

export function SeverityBadge({ severity }: { severity?: string }) {
  const meta = (severity && SEVERITY[severity]) || SEVERITY.low;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Biểu đồ THUẦN SVG (không phụ thuộc thư viện ngoài) — brand Happy Home
// ---------------------------------------------------------------------------

export type TrendPoint = {
  label: string;
  new_leads: number;
  customers: number;
};

/** Cột nhóm: khách mới vs đã chốt theo tháng. */
export function TrendBarChart({ data }: { data: TrendPoint[] }) {
  if (!data || data.length === 0) {
    return <EmptyState text="Chưa có dữ liệu theo tháng." />;
  }
  const max = Math.max(1, ...data.map((d) => Math.max(d.new_leads, d.customers)));
  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-1">
        {data.map((d) => (
          <div key={d.label} className="flex min-w-[40px] flex-1 flex-col items-center gap-1">
            <div className="flex h-32 items-end gap-1">
              <div
                className="w-3.5 rounded-t bg-brand-500"
                style={{ height: `${(d.new_leads / max) * 100}%` }}
                title={`Khách mới: ${d.new_leads}`}
              />
              <div
                className="w-3.5 rounded-t bg-emerald-500"
                style={{ height: `${(d.customers / max) * 100}%` }}
                title={`Đã chốt: ${d.customers}`}
              />
            </div>
            <div className="text-[10px] text-brand-600">{d.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-brand-700">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" /> Khách mới
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Đã chốt
        </span>
      </div>
    </div>
  );
}

export type FunnelStep = { label: string; count: number };

/** Phễu chuyển đổi: thanh ngang thu hẹp dần. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  if (!steps || steps.length === 0) {
    return <EmptyState text="Chưa có dữ liệu phễu." />;
  }
  const max = Math.max(1, steps[0]?.count ?? 1);
  const COLORS = [
    "bg-brand-500",
    "bg-indigo-500",
    "bg-amber-500",
    "bg-red-500",
    "bg-emerald-500",
  ];
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const pct = Math.round((s.count / max) * 100);
        const conv =
          i === 0 || !steps[0].count
            ? 100
            : Math.round((s.count / steps[0].count) * 100);
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-xs font-medium text-brand-800">
              {s.label}
            </div>
            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-brand-50">
              <div
                className={`flex h-full items-center justify-end rounded-lg px-2 text-[11px] font-semibold text-white ${
                  COLORS[i % COLORS.length]
                }`}
                style={{ width: `${Math.max(pct, 8)}%` }}
              >
                {s.count}
              </div>
            </div>
            <div className="w-10 shrink-0 text-right text-[11px] text-brand-500">
              {conv}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type SourceRow = { source: string; count: number };

/** Danh sách nguồn khách dạng thanh ngang. */
export function SourceBars({ rows }: { rows: SourceRow[] }) {
  if (!rows || rows.length === 0) {
    return <EmptyState text="Chưa có dữ liệu nguồn." />;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((r) => (
        <div key={r.source} className="flex items-center gap-2">
          <div className="w-24 shrink-0 truncate text-xs text-brand-800" title={r.source}>
            {r.source}
          </div>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-50">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <div className="w-8 shrink-0 text-right text-xs font-medium text-brand-700">
            {r.count}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel AI (nền tím/emerald) — tóm tắt + danh sách đề xuất hành động
// ---------------------------------------------------------------------------

export type AiSuggestion = {
  title: string;
  detail?: string;
  severity?: string;
  suggested_action?: string;
};

export function AiPanel({
  title = "Trợ lý AI điều hành sàn",
  summary,
  suggestions,
  loading,
  generatedBy,
  onRefresh,
  emptyText = "Chưa có đề xuất — dữ liệu sàn còn ít.",
}: {
  title?: string;
  summary?: string | null;
  suggestions: AiSuggestion[];
  loading?: boolean;
  generatedBy?: string;
  onRefresh?: () => void;
  emptyText?: string;
}) {
  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            AI
          </span>
          <h2 className="text-sm font-bold text-indigo-900">{title}</h2>
          {generatedBy === "ai" ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              Claude
            </span>
          ) : generatedBy ? (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-600">
              Quy tắc
            </span>
          ) : null}
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:border-indigo-400 disabled:opacity-60"
          >
            {loading ? "Đang phân tích…" : "Phân tích lại"}
          </button>
        ) : null}
      </div>

      {summary ? (
        <p className="mb-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-indigo-900">
          {summary}
        </p>
      ) : null}

      {loading && suggestions.length === 0 ? (
        <div className="rounded-xl bg-white/60 px-3 py-4 text-center text-sm text-indigo-700">
          Đang phân tích dữ liệu sàn…
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl bg-white/60 px-3 py-4 text-center text-sm text-indigo-700">
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li
              key={`${s.title}-${i}`}
              className="rounded-xl border border-indigo-100 bg-white/80 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-indigo-900">
                  {s.title}
                </div>
                <SeverityBadge severity={s.severity} />
              </div>
              {s.detail ? (
                <p className="mt-1 text-xs text-brand-700">{s.detail}</p>
              ) : null}
              {s.suggested_action ? (
                <p className="mt-1.5 text-xs font-medium text-emerald-700">
                  → {s.suggested_action}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Drawer phải (hồ sơ khách 360 / chi tiết) — mobile-first
// ---------------------------------------------------------------------------

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative flex h-full w-full max-w-md flex-col bg-[#fbf9f5] shadow-xl">
        <div className="flex items-center justify-between border-b border-brand-100 bg-white px-4 py-3">
          <h2 className="text-sm font-bold text-brand-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-brand-600 hover:bg-brand-50"
          >
            Đóng ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
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
