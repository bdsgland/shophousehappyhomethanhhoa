import Link from "next/link";

import { fetchAdminOverview } from "@/lib/api";
import { getServerToken } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const token = getServerToken() ?? "";
  const overview = await fetchAdminOverview(token);

  const cards: { label: string; value: string | number; tone: string }[] = [
    {
      label: "Tổng user",
      value: overview?.users_total ?? "—",
      tone: "bg-brand-50 border-brand-100 text-brand-900",
    },
    {
      label: "User đang hoạt động",
      value: overview?.users_active ?? "—",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
    },
    {
      label: "Tổng lead",
      value: overview?.leads_total ?? "—",
      tone: "bg-amber-50 border-amber-200 text-amber-900",
    },
    {
      label: "Trạng thái backend",
      value: overview?.backend_status ?? "không kết nối",
      tone: overview
        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
        : "bg-red-50 border-red-200 text-red-900",
    },
  ];

  const byRole = overview?.users_by_role ?? {};

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">
            Bảng điều khiển quản trị
          </h1>
          <p className="text-sm text-brand-700">
            Theo dõi nhanh số liệu hệ thống. Quản lý user tại{" "}
            <Link href="/admin/users" className="text-brand-600 underline">
              /admin/users
            </Link>
            .
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border p-4 ${c.tone}`}
          >
            <div className="text-xs uppercase tracking-wide opacity-80">
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-brand-100 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          User theo vai trò
        </h2>
        {Object.keys(byRole).length === 0 ? (
          <p className="mt-3 text-sm text-brand-700">
            Chưa có dữ liệu — backend chưa chạy hoặc chưa có user nào.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(byRole).map(([role, count]) => (
              <li
                key={role}
                className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-brand-900">{role}</span>
                <span className="font-semibold text-brand-700">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!overview && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Không lấy được dữ liệu từ backend. Hãy đảm bảo agent-engine đang chạy
          tại <code>NEXT_PUBLIC_AGENT_ENGINE_URL</code> và token admin còn hợp lệ.
        </div>
      )}
    </div>
  );
}
