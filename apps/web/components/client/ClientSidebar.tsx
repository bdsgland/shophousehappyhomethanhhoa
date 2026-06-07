"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Calculator,
  Calendar,
  DollarSign,
  GitCompare,
  Heart,
  Home,
  MessageCircle,
  User,
} from "@/components/dashboard/icons";
import type { AuthUser } from "@/lib/api";
import { readUserFromCookie } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof User;
};

const NAV: NavItem[] = [
  { href: "/client", label: "Trang chủ", Icon: Home },
  { href: "/client/chat", label: "Chat AI tư vấn", Icon: MessageCircle },
  { href: "/client/pricing", label: "Phiếu tính giá", Icon: Calculator },
  { href: "/client/loan", label: "Tính lãi vay ngân hàng", Icon: DollarSign },
  { href: "/client/compare", label: "So sánh căn hộ", Icon: GitCompare },
  { href: "/client/booking", label: "Đặt lịch xem nhà", Icon: Calendar },
  { href: "/client/favorites", label: "Căn yêu thích", Icon: Heart },
  { href: "/client/profile", label: "Thông tin cá nhân", Icon: User },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ClientSidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(readUserFromCookie());
  }, []);

  return (
    <aside className="w-full shrink-0 lg:w-60">
      <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-brand-100 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-base font-bold text-white">
            {user ? initials(user.full_name) : "··"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-brand-900">
              {user?.full_name ?? "Đang tải…"}
            </div>
            <div className="truncate text-xs text-brand-700">Khách hàng</div>
          </div>
        </div>

        <nav className="mt-3 space-y-1">
          {NAV.map(({ href, label, Icon }) => {
            const active =
              href === "/client"
                ? pathname === "/client"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-gradient-to-r from-sky-50 to-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200"
                    : "text-brand-800 hover:bg-brand-50 hover:text-brand-900"
                }`}
              >
                <Icon
                  size={18}
                  className={active ? "text-indigo-500" : "text-brand-400"}
                />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
