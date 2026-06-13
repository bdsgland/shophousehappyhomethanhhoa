"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { agencyRegister } from "@/lib/api";
import { setAuthCookie, setUserCookie } from "@/lib/auth";

const inputCls =
  "mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "block text-sm font-medium text-brand-900";

export default function RegisterAgencyPage() {
  const router = useRouter();

  const [tenSan, setTenSan] = useState("");
  const [nguoiDaiDien, setNguoiDaiDien] = useState("");
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
      const data = await agencyRegister({
        ten_san: tenSan.trim(),
        nguoi_dai_dien: nguoiDaiDien.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
      });
      setAuthCookie(data.access_token, data.expires_in);
      setUserCookie(data.user, data.expires_in);
      router.replace("/agency-onboarding");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Đăng ký thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/landing/agency" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              ELC
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide text-white">
                Eurowindow Light City
              </div>
              <div className="text-[11px] uppercase tracking-widest text-brand-100">
                Đăng ký đại lý phân phối
              </div>
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10"
          >
            Đăng nhập
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-brand-900">
            Đăng ký làm đại lý
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-brand-700">
            Tạo tài khoản trong 1 phút để trải nghiệm ngay nền tảng Proptech AI.
            Hồ sơ điều kiện đại lý F2 (doanh nghiệp, đội sale…) bạn khai báo sau,
            ngay trong khu quản trị sàn.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label className={labelCls}>Tên sàn / doanh nghiệp</label>
              <input
                type="text"
                required
                minLength={2}
                value={tenSan}
                onChange={(e) => setTenSan(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Người đại diện</label>
              <input
                type="text"
                required
                minLength={2}
                value={nguoiDaiDien}
                onChange={(e) => setNguoiDaiDien(e.target.value)}
                autoComplete="name"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Số điện thoại (tuỳ chọn)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Mật khẩu</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className={inputCls}
              />
              <div className="mt-1 text-xs text-brand-700">
                Tối thiểu 8 ký tự.
              </div>
            </div>
            <div>
              <label className={labelCls}>Nhập lại mật khẩu</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Đang tạo tài khoản…" : "Tạo tài khoản & vào trải nghiệm"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-brand-700">
            Đã có tài khoản?{" "}
            <Link
              href="/login"
              className="font-medium text-brand-600 hover:underline"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
