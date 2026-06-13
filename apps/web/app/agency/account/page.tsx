"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AgencyHeader, AgencyLoading, Card } from "@/components/agency/AgencyKit";
import { LogOut, User } from "@/components/dashboard/icons";
import type { AuthUser } from "@/lib/api";
import {
  ADMIN_APP_URL,
  clearAuthCookies,
  readUserFromCookie,
} from "@/lib/auth";

export default function AgencyAccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readUserFromCookie());
    setReady(true);
  }, []);

  function logout() {
    clearAuthCookies();
    router.replace("/login");
    router.refresh();
  }

  if (!ready) return <AgencyLoading />;

  return (
    <div className="space-y-5">
      <AgencyHeader title="Tài khoản" subtitle="Quản lý / Chủ sàn" />

      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-bold text-white">
            {(user?.full_name ?? "?").trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-brand-900">
              {user?.full_name ?? "—"}
            </div>
            <div className="truncate text-sm text-brand-700">
              {user?.email ?? "—"}
            </div>
            <span className="mt-1 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
              {user?.role === "manager" ? "Quản lý sàn" : "Chủ sàn / Quản trị"}
            </span>
          </div>
        </div>
      </Card>

      <Card title="Liên kết nhanh">
        <div className="space-y-2">
          <Link
            href="/agent/profile"
            className="flex items-center gap-3 rounded-lg border border-brand-100 px-3 py-2.5 text-sm font-medium text-brand-800 hover:border-brand-500"
          >
            <User size={18} />
            Hồ sơ & đổi mật khẩu
          </Link>
          <a
            href={ADMIN_APP_URL}
            className="flex items-center gap-3 rounded-lg border border-brand-100 px-3 py-2.5 text-sm font-medium text-brand-800 hover:border-brand-500"
          >
            <span className="text-base">🛠️</span>
            Mở bảng quản trị đầy đủ
          </a>
        </div>
      </Card>

      <button
        type="button"
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <LogOut size={18} />
        Đăng xuất
      </button>
    </div>
  );
}
