"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Calendar,
  Calculator,
  ClipboardList,
  Grid,
  Home,
  MessageCircle,
  Phone,
  Sparkles,
  User,
  Users,
} from "@/components/dashboard/icons";
import type { AuthUser } from "@/lib/api";
import { readUserFromCookie } from "@/lib/auth";

type Tab = {
  href: string;
  label: string;
  Icon: typeof Home;
  /** prefix để xác định tab đang active (mặc định = href không kèm query) */
  match?: string;
};

// Khách hàng — 5 tab.
const CLIENT_TABS: Tab[] = [
  { href: "/client", label: "Dự án", Icon: Home, match: "/client" },
  {
    href: "/dashboard/project/happy-home-thanh-hoa",
    label: "Bảng hàng",
    Icon: Grid,
    match: "/dashboard/project",
  },
  { href: "/client/chat", label: "Chat AI", Icon: MessageCircle },
  { href: "/client/booking", label: "Đặt lịch", Icon: Calendar },
  { href: "/client/profile", label: "Tài khoản", Icon: User },
];

// Sale — 5 tab.
const AGENT_TABS: Tab[] = [
  { href: "/agent/crm", label: "Khách", Icon: Users, match: "/agent/crm" },
  { href: "/agent/inventory", label: "Bảng hàng", Icon: Grid },
  {
    href: "/agent/learning?tab=policy",
    label: "Báo giá",
    Icon: Calculator,
    match: "/agent/learning",
  },
  {
    href: "/agent/crm?tab=today",
    label: "Chăm sóc",
    Icon: Phone,
    match: "/agent/care-na", // không trùng /agent/crm để tránh cả hai cùng active
  },
  { href: "/agent/profile", label: "Tài khoản", Icon: User },
];

// Quản lý / Chủ sàn (Agency) — 5 tab điều hành trên điện thoại.
const AGENCY_TABS: Tab[] = [
  { href: "/agency/overview", label: "Tổng quan", Icon: Home },
  { href: "/agency/decisions", label: "Quyết định", Icon: ClipboardList },
  { href: "/agency/team", label: "Đội sale", Icon: Users },
  { href: "/agency/ai", label: "AI", Icon: Sparkles },
  { href: "/agency/account", label: "Tài khoản", Icon: User },
];

// Route ẩn bottom nav.
const HIDDEN_PREFIXES = ["/login", "/register", "/auth", "/offline", "/admin"];

function tabsForContext(
  pathname: string,
  role: string | null | undefined,
): Tab[] | null {
  if (pathname === "/") return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return null;

  if (pathname.startsWith("/agency")) return AGENCY_TABS;
  if (pathname.startsWith("/agent")) return AGENT_TABS;
  if (pathname.startsWith("/client")) return CLIENT_TABS;
  // Trang dùng chung (/dashboard/...): quyết định theo role.
  if (pathname.startsWith("/dashboard")) {
    if (role === "sale") return AGENT_TABS;
    if (role === "client") return CLIENT_TABS;
    return null;
  }
  return null;
}

export function BottomNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(readUserFromCookie());
  }, [pathname]);

  const tabs = tabsForContext(pathname, user?.role);
  if (!tabs) return null;

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map(({ href, label, Icon, match }) => {
          const base = match ?? href.split("?")[0];
          const active =
            pathname === base || pathname.startsWith(`${base}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition ${
                  active
                    ? "text-brand-700"
                    : "text-brand-400 hover:text-brand-600"
                }`}
              >
                <Icon size={22} className={active ? "text-brand-600" : ""} />
                <span className="leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
