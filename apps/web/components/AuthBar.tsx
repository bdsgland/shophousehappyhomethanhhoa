"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { AuthUser } from "@/lib/api";
import { clearAuthCookies, readUserFromCookie } from "@/lib/auth";

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

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="text-xs text-brand-700">Đăng nhập với tư cách</div>
        <div className="text-sm font-semibold text-brand-900">
          {user.full_name}
        </div>
      </div>
      <Link
        href="/leads"
        className="rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
      >
        Vào dashboard
      </Link>
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
