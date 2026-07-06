import Link from "next/link";
import type { Metadata } from "next";

import {
  CONNECTIONS,
  HERO_IMAGES,
  OVERVIEW_ROWS,
  POLICIES,
  SUBZONES,
} from "@/components/dashboard/project-data";

export const metadata: Metadata = {
  title:
    "Shophouse Happy Home Thanh Hóa — Cận thị · Cận giang · Cận lộ | BDSG LAND",
  description:
    "Shophouse khối đế Happy Home tại trung tâm hành chính mới TP. Thanh Hóa, bên Đại lộ Nam Sông Mã. CĐT Tập đoàn Vingroup. Đại lý phát triển kinh doanh BDSG LAND — hotline 0967 806 686.",
};

const HOTLINE = "0967 806 686";
const HOTLINE_TEL = "tel:0967806686";

const STATS = [
  { value: "18", label: "tòa căn hộ" },
  { value: "2.824", label: "căn hộ dự kiến" },
  { value: "91.891 m²", label: "diện tích đất" },
  { value: "6%", label: "chiết khấu tối đa" },
];

export default function HomePage() {
  const hero = HERO_IMAGES[0];
  const second = HERO_IMAGES[1];
  const policy = POLICIES[0];

  return (
    <main className="min-h-screen bg-[#fbf7f0] text-brand-900">
      {/* ===== Header landing ===== */}
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-extrabold text-white">
              HH
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">
                Shophouse Happy Home Thanh Hóa
              </div>
              <div className="text-[11px] uppercase tracking-widest text-brand-700">
                Đại lý phát triển kinh doanh BDSG LAND
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={HOTLINE_TEL}
              className="hidden rounded-full border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-800 sm:block"
            >
              ☎ {HOTLINE}
            </a>
            <Link
              href="/login"
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero.src}
          alt={hero.caption}
          className="h-[420px] w-full object-cover sm:h-[520px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-6 pb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              Chủ đầu tư: Tập đoàn Vingroup — Công ty CP
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">
              Shophouse Happy Home Thanh Hóa
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85 sm:text-base">
              Khối đế thương mại giữa trung tâm hành chính mới TP. Thanh Hóa —
              thế &ldquo;Cận thị · Cận giang · Cận lộ&rdquo; bên Đại lộ Nam Sông
              Mã, phục vụ trực tiếp cộng đồng cư dân ~2.824 căn hộ.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={HOTLINE_TEL}
                className="rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-brand-900 hover:bg-amber-300"
              >
                Nhận bảng giá — {HOTLINE}
              </a>
              <Link
                href="/register"
                className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Đăng ký tư vấn
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Số liệu nhanh ===== */}
      <section className="border-b border-brand-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-extrabold text-brand-800 sm:text-3xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-brand-600">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Tổng quan ===== */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Tổng quan dự án</h2>
            <dl className="mt-6 divide-y divide-brand-100 rounded-2xl border border-brand-100 bg-white">
              {OVERVIEW_ROWS.map((r) => (
                <div key={r.label} className="grid grid-cols-3 gap-3 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {r.label}
                  </dt>
                  <dd className="col-span-2 text-sm">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={second.src}
              alt={second.caption}
              className="w-full rounded-2xl border border-brand-100 object-cover"
            />
            <div className="rounded-2xl border border-brand-100 bg-white p-6">
              <h3 className="text-lg font-bold">Kết nối vị trí</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {CONNECTIONS.map((c) => (
                  <li key={c.place} className="flex justify-between gap-4">
                    <span>{c.place}</span>
                    <span className="font-semibold text-brand-700">
                      {c.time}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Quỹ shophouse ===== */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Quỹ shophouse khối đế
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-brand-700">
            Các căn TMDV tầng 1 (SH01 – SH16) tại Block 1 · 2 · 3 — mặt tiền
            lớn, chiều cao vượt trội, mặt đường giao thông nội khu.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {SUBZONES.map((z) => (
              <div
                key={z.name}
                className="overflow-hidden rounded-2xl border border-brand-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={z.img}
                  alt={z.name}
                  className="h-40 w-full object-cover"
                />
                <div className="p-5">
                  <div className="text-lg font-bold">{z.name}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                    {z.units}
                  </div>
                  <p className="mt-2 text-sm text-brand-700">{z.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Chính sách ===== */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="rounded-3xl bg-brand-900 p-8 text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">{policy.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            {policy.summary}
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {policy.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-amber-400">✔</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={HOTLINE_TEL}
              className="rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-brand-900 hover:bg-amber-300"
            >
              Gọi ngay {HOTLINE}
            </a>
            <Link
              href="/register"
              className="rounded-full border border-white/50 px-6 py-3 text-sm font-semibold hover:bg-white/10"
            >
              Để lại thông tin — nhận bảng giá
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl space-y-2 px-6 py-8 text-xs text-brand-700">
          <p className="font-semibold text-brand-900">
            BDSG LAND — Công ty Cổ phần Tập đoàn BDSG, Chi nhánh Thanh Hóa
          </p>
          <p>
            Đại lý phát triển kinh doanh dự án Shophouse Happy Home Thanh Hóa
            (Dự án số 01 Khu đô thị trung tâm TP. Thanh Hóa — CĐT: Tập đoàn
            Vingroup — Công ty CP).
          </p>
          <p>
            Hotline: <a href={HOTLINE_TEL} className="underline">{HOTLINE}</a>{" "}
            · Email:{" "}
            <a href="mailto:info@bdsg.land" className="underline">
              info@bdsg.land
            </a>
          </p>
          <p>
            <Link href="/privacy" className="underline">
              Chính sách quyền riêng tư
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="underline">
              Điều khoản dịch vụ
            </Link>{" "}
            ·{" "}
            <Link href="/data-deletion" className="underline">
              Xóa dữ liệu
            </Link>
          </p>
          <p className="text-brand-500">
            Trang giới thiệu mang tính tham khảo; thông tin chi tiết (giá,
            chính sách) vui lòng liên hệ chuyên viên kinh doanh.
          </p>
        </div>
      </footer>
    </main>
  );
}
