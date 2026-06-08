"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { AuthUser } from "@/lib/api";
import {
  clearAuthCookies,
  getDashboardUrl,
  isExternalUrl,
  readUserFromCookie,
} from "@/lib/auth";

export function AuthBar() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setUser(readUserFromCookie());
    setHydrated(true);
    const onFocus = () => setUser(readUserFromCookie());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  function logout() {
    clearAuthCookies();
    setUser(null);
    router.replace("/");
    router.refresh();
  }

  if (!hydrated) {
    return <div className="h-8 w-40" aria-hidden />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
        >
          Đăng nhập
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          Đăng ký Sale
        </Link>
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const isClient = user.role === "client";
  const accountHref = isClient ? "/client/profile" : "/agent/profile";
  // "Vào dashboard": sale → CRM, client → khu khách hàng, admin → app Admin riêng.
  const portalHref = getDashboardUrl(user.role);
  const portalExternal = isExternalUrl(portalHref);
  const portalLabel = isClient ? "Khu khách hàng" : "Vào dashboard";
  const roleLabel = isAdmin
    ? "Quản trị viên"
    : isClient
    ? "Khách hàng"
    : "Đăng nhập với tư cách";

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="text-xs text-brand-700">{roleLabel}</div>
        <div className="text-sm font-semibold text-brand-900">
          {user.full_name}
        </div>
      </div>
      {isAdmin && (
        <a
          href={portalHref}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:border-amber-400"
        >
          Admin
        </a>
      )}
      <Link
        href={accountHref}
        className="rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
      >
        Tài khoản
      </Link>
      {portalExternal ? (
        <a
          href={portalHref}
          className="rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
        >
          {portalLabel}
        </a>
      ) : (
        <Link
          href={portalHref}
          className="rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
        >
          {portalLabel}
        </Link>
      )}
      <button
        type="button"
        onClick={logout}
        className="rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        Đăng xuất
      </button>
    </div>
  );
}
