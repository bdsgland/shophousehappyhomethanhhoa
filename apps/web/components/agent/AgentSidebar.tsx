"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  BookOpen,
  Calendar,
  DollarSign,
  GraduationCap,
  Grid,
  Heart,
  Radio,
  ShoppingBag,
  Target,
  Trophy,
  User,
  Users,
} from "@/components/dashboard/icons";
import type { AuthUser } from "@/lib/api";
import { readUserFromCookie } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof User;
  live?: boolean; // hiển thị chấm "live" nhấp nháy
};

const NAV: NavItem[] = [
  { href: "/agent/profile", label: "Thông tin cá nhân", Icon: User },
  { href: "/agent/live", label: "Khách live", Icon: Radio, live: true },
  { href: "/agent/crm", label: "CRM khách hàng", Icon: Users },
  { href: "/agent/crm?tab=today", label: "Nhiệm vụ hôm nay", Icon: Target },
  { href: "/agent/crm?tab=leaderboard", label: "Xếp hạng", Icon: Trophy },
  { href: "/agent/commission", label: "Hoa hồng của tôi", Icon: DollarSign },
  { href: "/agent/referrals", label: "Cây giới thiệu", Icon: Users },
  { href: "/agent/orders", label: "Đơn hàng của tôi", Icon: ShoppingBag },
  { href: "/agent/inventory", label: "Bảng hàng", Icon: Grid },
  { href: "/agent/bookings", label: "Lịch booking", Icon: Calendar },
  { href: "/agent/favorites", label: "Căn hộ quan tâm", Icon: Heart },
  { href: "/agent/learning", label: "Kho học tập", Icon: GraduationCap },
  {
    href: "/dashboard/project/happy-home-thanh-hoa",
    label: "Thông tin dự án Happy Home",
    Icon: BookOpen,
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AgentSidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(readUserFromCookie());
  }, []);

  return (
    <aside className="w-full shrink-0 lg:w-60">
      <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-brand-100 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-base font-bold text-white">
            {user ? initials(user.full_name) : "··"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-brand-900">
              {user?.full_name ?? "Đang tải…"}
            </div>
            <div className="truncate text-xs text-brand-700">
              {user?.email ?? ""}
            </div>
          </div>
        </div>

        <nav className="mt-3 space-y-1">
          {NAV.map(({ href, label, Icon, live }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-gradient-to-r from-amber-50 to-orange-50 text-orange-700 shadow-sm ring-1 ring-amber-200"
                    : "text-brand-800 hover:bg-brand-50 hover:text-brand-900"
                }`}
              >
                <Icon
                  size={18}
                  className={active ? "text-orange-500" : "text-brand-400"}
                />
                <span className="flex-1">{label}</span>
                {live && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
