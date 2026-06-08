"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import GoogleSignInButton from "@/components/GoogleSignInButton";
import { authLogin } from "@/lib/api";
import { redirectByRole, setAuthCookie, setUserCookie } from "@/lib/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await authLogin({ email: email.trim(), password });
      setAuthCookie(data.access_token, data.expires_in);
      setUserCookie(data.user, data.expires_in);
      // Ưu tiên ?next= (deep-link bị chặn), nếu không thì điều hướng theo vai trò.
      router.replace(next || redirectByRole(data.user.role));
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Đăng nhập thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-brand-900">Đăng nhập</h1>
        <p className="mt-2 text-sm text-brand-700">
          Dành cho chuyên viên kinh doanh và khách hàng đã đăng ký. Khách tham quan
          xem trực tiếp{" "}
          <Link href="/" className="text-brand-600 underline">
            trang giới thiệu dự án
          </Link>
          .
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Email công ty
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="ten.ban@congty.vn"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Mật khẩu
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              minLength={8}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-100 disabled:text-brand-700"
          >
            {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-brand-500">
          <span className="h-px flex-1 bg-brand-100" />
          hoặc
          <span className="h-px flex-1 bg-brand-100" />
        </div>

        <GoogleSignInButton role="client" />

        <div className="mt-6 text-center text-sm text-brand-700">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            Đăng ký Sale
          </Link>
          {" · "}
          <Link
            href="/register?type=client"
            className="font-medium text-indigo-600 hover:underline"
          >
            Đăng ký Khách hàng
          </Link>
        </div>
      </div>
    </div>
  );
}
