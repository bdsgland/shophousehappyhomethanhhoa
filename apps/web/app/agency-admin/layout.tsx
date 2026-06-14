"use client";

/**
 * Layout khu QUẢN TRỊ SÀN F2 (đa-tenant) — tách hẳn khỏi /agency (admin/manager
 * toàn nền tảng). Tự quản toàn bộ chrome: header thương hiệu ELC + sidebar điều
 * hướng (mobile-first: thanh cuộn ngang trên điện thoại, cột dọc trên desktop) +
 * banner "chờ duyệt". Chỉ role "agency" vào được (middleware đã gác cứng).
 *
 * Dữ liệu từng trang gọi /agency-admin/* (backend lọc cứng theo agency_id của
 * token). Layout chỉ đọc hồ sơ sàn (/agency/me) để hiện tên sàn + trạng thái.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchAgencyMe, type Agency } from "@/lib/api";
import { clearAuthCookies, readToken } from "@/lib/auth";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/agency-admin", label: "Tổng quan" },
  { href: "/agency-admin/leads", label: "CRM khách của sàn" },
  { href: "/agency-admin/team", label: "Đội sale" },
  { href: "/agency-admin/ai-sales", label: "Đội Sale AI" },
  { href: "/agency-admin/pipeline", label: "Pipeline" },
  { href: "/agency-admin/report", label: "Báo cáo" },
  { href: "/agency-admin/commission", label: "Hoa hồng" },
  { href: "/agency-admin/assistant", label: "Trợ lý AI" },
  { href: "/agency-admin/inventory", label: "Bảng hàng" },
  { href: "/agency-admin/training", label: "Đào tạo" },
  { href: "/agency-onboarding", label: "Hồ sơ sàn" },
  { href: "/agency-admin/account", label: "Tài khoản" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/agency-admin") return pathname === "/agency-admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AgencyAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    if (!t) {
      router.replace("/login?next=/agency-admin");
      return;
    }
    setReady(true);
    fetchAgencyMe(t)
      .then((a) => setAgency(a))
      .catch(() => setAgency(null));
  }, [router]);

  function logout() {
    clearAuthCookies();
    router.replace("/login");
  }

  const isPending = agency ? agency.status !== "active" : false;

  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/agency-admin" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              ELC
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide text-white">
                Quản trị sàn F2
              </div>
              <div className="text-[11px] uppercase tracking-widest text-brand-100">
                {agency?.ten_san ?? "Đại lý"}
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Nav: cuộn ngang trên điện thoại (mobile-first) */}
      <nav className="sticky top-[57px] z-20 border-b border-brand-100 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex gap-1 overflow-x-auto px-3 py-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-brand-500 text-white"
                    : "text-brand-700 hover:bg-brand-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5">
        {/* Sidebar dọc trên desktop */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <ul className="sticky top-20 space-y-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-brand-500 text-white"
                        : "text-brand-700 hover:bg-brand-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="min-w-0 flex-1">
          {ready && isPending ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Chờ duyệt — hoa hồng ở mức cơ bản tới khi được duyệt làm đại lý F2.{" "}
              <Link
                href="/agency-onboarding"
                className="font-semibold underline hover:text-amber-900"
              >
                Hoàn tất hồ sơ
              </Link>
            </div>
          ) : null}
          {token ? (
            children
          ) : (
            <div className="rounded-2xl border border-brand-100 bg-white p-8 text-center text-sm text-brand-600">
              Đang kiểm tra đăng nhập…
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
