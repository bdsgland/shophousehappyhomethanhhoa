"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authRegister } from "@/lib/api";
import { setAuthCookie, setUserCookie } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Hai mật khẩu không khớp.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await authRegister({
        email: email.trim(),
        full_name: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      setAuthCookie(data.access_token, data.expires_in);
      setUserCookie(data.user, data.expires_in);
      router.replace("/leads");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Đăng ký thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-brand-900">
          Đăng ký tài khoản Sale
        </h1>
        <p className="mt-2 text-sm text-brand-700">
          Tài khoản này dành cho chuyên viên kinh doanh nội bộ — truy cập danh sách lead
          và công cụ agent. Khách tham quan vào{" "}
          <Link href="/" className="text-brand-600 underline">
            trang giới thiệu
          </Link>{" "}
          không cần đăng ký.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Họ và tên
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Điện thoại (tuỳ chọn)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Mật khẩu
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <div className="mt-1 text-xs text-brand-700">
              Tối thiểu 8 ký tự, cần có cả chữ và số.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-900">
              Nhập lại mật khẩu
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
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
            {submitting ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-700">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
