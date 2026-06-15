"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import FacebookSignInButton from "@/components/FacebookSignInButton";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { authRegister } from "@/lib/api";
import { isExternalUrl, redirectByRole, setAuthCookie, setUserCookie } from "@/lib/auth";

type Tab = "sale" | "client";

const PROJECTS = ["Eurowindow Light City", "Khác"];

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md" />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("type") === "client" ? "client" : "sale";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ref, setRef] = useState(searchParams.get("ref") ?? "");
  const [project, setProject] = useState(PROJECTS[0]);
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
        role: tab,
        ...(tab === "sale" && ref.trim() ? { ref: ref.trim() } : {}),
        ...(tab === "client" ? { projects_interested: [project] } : {}),
      });
      setAuthCookie(data.access_token, data.expires_in);
      setUserCookie(data.user, data.expires_in);
      const dest = redirectByRole(data.user.role);
      if (isExternalUrl(dest)) {
        window.location.href = dest;
        return;
      }
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Đăng ký thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
  const labelCls = "block text-sm font-medium text-brand-900";
  const isClient = tab === "client";

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-brand-900">Đăng ký tài khoản</h1>
        <p className="mt-2 text-sm text-brand-700">
          Chọn loại tài khoản phù hợp với bạn.
        </p>

        {/* Tabs */}
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-brand-50 p-1">
          <button
            type="button"
            onClick={() => setTab("sale")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "sale"
                ? "bg-white text-brand-900 shadow-sm"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            Tôi là Sale
          </button>
          <button
            type="button"
            onClick={() => setTab("client")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "client"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            Tôi là Khách hàng
          </button>
        </div>

        <p className="mt-3 text-xs text-brand-600">
          {isClient
            ? "Tài khoản khách hàng: tra cứu quỹ căn, tính giá, lãi vay và chat AI tư vấn dự án."
            : "Tài khoản chuyên viên kinh doanh: quản lý lead, hoa hồng và công cụ bán hàng."}
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className={labelCls}>Họ và tên</label>
            <input
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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
            <label className={labelCls}>
              Số điện thoại {isClient ? "" : "(tuỳ chọn)"}
            </label>
            <input
              type="tel"
              required={isClient}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className={inputCls}
            />
          </div>

          {isClient ? (
            <div>
              <label className={labelCls}>Dự án quan tâm</label>
              <select
                className={inputCls}
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                {PROJECTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Mã giới thiệu (tuỳ chọn)</label>
              <input
                type="text"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="VD: RAI-THU-1234"
                className={`${inputCls} font-mono uppercase`}
              />
            </div>
          )}

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
              Tối thiểu 8 ký tự, cần có cả chữ và số.
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

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isClient
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-brand-500 hover:bg-brand-600"
            }`}
          >
            {submitting
              ? "Đang tạo tài khoản…"
              : isClient
              ? "Đăng ký khách hàng"
              : "Đăng ký Sale"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-brand-500">
          <span className="h-px flex-1 bg-brand-100" />
          hoặc
          <span className="h-px flex-1 bg-brand-100" />
        </div>

        <div className="space-y-2">
          <GoogleSignInButton
            role={tab}
            referralCode={tab === "sale" ? ref.trim() || undefined : undefined}
            label={isClient ? "Đăng ký với Google" : "Đăng ký Sale với Google"}
          />
          <FacebookSignInButton
            role={tab === "sale" ? "sale" : "client"}
            refCode={tab === "sale" ? ref.trim() || undefined : undefined}
          />
        </div>

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
