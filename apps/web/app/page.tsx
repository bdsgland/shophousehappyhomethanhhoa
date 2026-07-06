import Link from "next/link";
import type { Metadata } from "next";

import {
  CONNECTIONS,
  HERO_IMAGES,
  OVERVIEW_ROWS,
  POLICIES,
} from "@/components/dashboard/project-data";

export const metadata: Metadata = {
  title:
    "Hệ thống bán hàng Shophouse Happy Home Thanh Hóa | BDSG LAND — Proptech AI",
  description:
    "Hệ thống bán hàng dự án Shophouse Happy Home Thanh Hóa (CĐT Tập đoàn Vingroup) — vận hành bởi đại lý BDSG LAND. Chatbot AI 24/7, bảng hàng realtime, phiếu giá tự động cho khách hàng, sale và đại lý. Hotline 0967 806 686.",
};

const HOTLINE = "0967 806 686";
const HOTLINE_TEL = "tel:0967806686";
const PROJECT_HREF = "/dashboard/project/happy-home-thanh-hoa";

// ===== Số liệu dự án (từ brochure chính thức) =====
const PROJECT_STATS = [
  { value: "18", label: "tòa căn hộ" },
  { value: "2.824", label: "căn hộ dự kiến" },
  { value: "91.891 m²", label: "diện tích đất" },
  { value: "6%", label: "chiết khấu tối đa" },
];

// ===== Năng lực nền tảng (đồng bộ landing /landing/app) =====
const AI_FEATURES: { icon: string; title: string; desc: string }[] = [
  {
    icon: "🤖",
    title: "Chatbot AI 24/7",
    desc: "Hỏi giá, chính sách, pháp lý, quỹ căn bất cứ lúc nào — trả lời tức thì như một chuyên viên đã thuộc dự án.",
  },
  {
    icon: "🧾",
    title: "Phiếu giá tự động",
    desc: "Tính giá, chiết khấu nhiều lớp, VAT và lịch thanh toán trong vài giây — xuất phiếu chuẩn gửi khách ngay.",
  },
  {
    icon: "⚡",
    title: "Live Match — xem căn online",
    desc: "Ghép căn phù hợp theo ngân sách và nhu cầu, kết nối chuyên viên xem căn trực tuyến qua video.",
  },
  {
    icon: "🏢",
    title: "Bảng hàng realtime",
    desc: "Quỹ căn shophouse, diện tích, hướng và trạng thái còn / giữ / đã bán cập nhật theo thời gian thực.",
  },
];

// ===== Công cụ cho SALE (đồng bộ mục "Dành cho môi giới" của landing app) =====
const SALE_TOOLS: string[] = [
  "CRM 360 — hồ sơ khách, hội thoại đa kênh, pipeline kanban một nơi",
  "Bảng hàng realtime + phiếu giá tự động gửi khách trong vài giây",
  "Đội Sale AI hỗ trợ chăm khách 24/7, không bỏ lỡ cơ hội",
  "Chính sách hoa hồng minh bạch, đối soát theo từng giao dịch",
];

// ===== Công cụ điều hành cho ĐẠI LÝ / SÀN (đồng bộ landing /landing/agency) =====
const AGENCY_FEATURES: { icon: string; title: string; desc: string }[] = [
  {
    icon: "📊",
    title: "Báo cáo realtime",
    desc: "Doanh thu, phễu lead, hoa hồng và sức khoẻ nền tảng trên một màn hình điều hành — nắm tình hình kinh doanh tức thời.",
  },
  {
    icon: "🎯",
    title: "Trung tâm quyết định",
    desc: "Tổng hợp dữ liệu thành đề xuất hành động rõ ràng: phân bổ lead nóng, nhắc deal sắp tuột, tối ưu nguồn marketing.",
  },
  {
    icon: "🤖",
    title: "Đội Sale AI 1000",
    desc: "Hàng nghìn trợ lý AI chăm khách song song 24/7 — mở rộng năng lực bán hàng mà không tăng chi phí nhân sự.",
  },
  {
    icon: "⚙️",
    title: "Tự động hoá 90%",
    desc: "Phân bổ lead, chăm sóc, nhắc lịch và báo cáo gần như tự động — đội ngũ tập trung vào việc tạo doanh thu.",
  },
  {
    icon: "💰",
    title: "Hoa hồng minh bạch",
    desc: "Cơ chế hoa hồng nhiều bậc, đối soát rõ ràng theo từng giao dịch — đại lý và sale yên tâm bứt tốc doanh số.",
  },
  {
    icon: "🧭",
    title: "CRM 360",
    desc: "Hồ sơ khách 360°, hội thoại đa kênh (web, Zalo, Facebook, cuộc gọi) và pipeline kanban gom về một nơi.",
  },
];

const PLATFORM_STATS: { value: string; label: string }[] = [
  { value: "Realtime", label: "Cập nhật số liệu vận hành" },
  { value: "1000+", label: "Trợ lý Sale AI chăm khách song song" },
  { value: "90%", label: "Tác vụ vận hành được tự động hoá" },
  { value: "360°", label: "Hồ sơ khách hàng đa kênh" },
];

export default function HomePage() {
  const hero = HERO_IMAGES[0];
  const second = HERO_IMAGES[1] ?? HERO_IMAGES[0];
  const policy = POLICIES[0];
  const overviewShort = OVERVIEW_ROWS.slice(0, 6);

  return (
    <main className="min-h-screen bg-[#fbf7f0] text-brand-900">
      {/* ===== Header ===== */}
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
                Hệ thống bán hàng — BDSG LAND
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={HOTLINE_TEL}
              className="hidden rounded-full border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-800 sm:block"
            >
              ☎ {HOTLINE}
            </a>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Hero: hệ thống bán hàng ===== */}
      <section className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero.src}
          alt={hero.caption}
          className="h-[440px] w-full object-cover sm:h-[540px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-6 pb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              CĐT: Tập đoàn Vingroup — Công ty CP · Đại lý phát triển kinh doanh: BDSG LAND
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">
              Hệ thống bán hàng Shophouse Happy Home Thanh Hóa
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85 sm:text-base">
              Một nền tảng Proptech AI cho cả ba: khách hàng tra cứu &amp; nhận tư
              vấn 24/7, sale chốt deal nhanh hơn, đại lý điều hành sàn bằng dữ
              liệu — quanh quỹ shophouse khối đế giữa trung tâm hành chính mới
              TP. Thanh Hóa.
            </p>
            {/* CTA theo 3 đối tượng */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/register?type=client"
                className="rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-brand-900 hover:bg-amber-300"
              >
                🏠 Tôi là khách hàng — nhận bảng giá
              </Link>
              <Link
                href="/register?type=sale"
                className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                💼 Tôi là Sale — đăng ký bán hàng
              </Link>
              <Link
                href="/register-agency"
                className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                🏢 Tôi là Đại lý — hợp tác phân phối
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Số liệu dự án ===== */}
      <section className="border-b border-brand-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
          {PROJECT_STATS.map((s) => (
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

      {/* ===== Nền tảng Proptech AI ===== */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Nền tảng Proptech AI vận hành toàn bộ phễu bán hàng
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-brand-700">
          Mọi thông tin minh bạch, phản hồi tức thì — từ lúc khách quan tâm đến
          khi ký hợp đồng, tất cả trên một hệ thống.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AI_FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-2xl">
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-700">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Dành cho KHÁCH HÀNG ===== */}
      <section className="border-t border-brand-100 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-600">
              Dành cho khách hàng
            </span>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              Tìm căn shophouse ưng ý, tư vấn AI 24/7
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-700">
              Tra cứu quỹ căn SH01 – SH16 tại Block 1 · 2 · 3, xem vị trí, hỏi
              chatbot AI về giá và chính sách bất cứ lúc nào — hoặc để lại thông
              tin để chuyên viên BDSG LAND gọi lại ngay.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {CONNECTIONS.slice(0, 4).map((c) => (
                <li key={c.place} className="flex justify-between gap-4 rounded-xl border border-brand-100 bg-[#fbf7f0] px-4 py-2.5">
                  <span>📍 {c.place}</span>
                  <span className="font-semibold text-brand-700">{c.time}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/landing/app"
                className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Xem trang giới thiệu dự án
              </Link>
              <a
                href={HOTLINE_TEL}
                className="rounded-xl border border-brand-500 px-6 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                Gọi {HOTLINE}
              </a>
            </div>
          </div>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={second.src}
              alt={second.caption}
              className="w-full rounded-2xl border border-brand-100 object-cover shadow-sm"
            />
            <div className="mt-4 rounded-2xl border border-brand-100 bg-[#fbf7f0] p-5 text-sm">
              <div className="font-bold">{policy.title}</div>
              <ul className="mt-2 space-y-1.5">
                {policy.highlights.slice(0, 3).map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-600">✔</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Dành cho SALE ===== */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-amber-50 p-6 sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                Dành cho Sale / môi giới
              </span>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                Bán Happy Home bằng nền tảng AI — chốt deal nhanh hơn mỗi ngày
              </h2>
              <ul className="mt-4 space-y-2.5">
                {SALE_TOOLS.map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-brand-900">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/register?type=sale"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Đăng ký làm Sale
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-brand-500 bg-white px-6 py-3 text-base font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                Đăng nhập Sale
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Dành cho ĐẠI LÝ / SÀN (tông tối như landing agency) ===== */}
      <section className="bg-brand-900 py-14 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-100">
            Dành cho Sàn &amp; Đại lý phân phối
          </span>
          <h2 className="mt-4 max-w-3xl text-2xl font-bold sm:text-3xl">
            Trở thành đại lý phân phối Happy Home — vận hành bằng trung tâm
            điều hành dữ liệu
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-100">
            Theo dõi doanh số tức thời, ra quyết định dựa trên dữ liệu, vận hành
            đội Sale AI quy mô lớn và tự động hoá tới 90% công việc lặp lại — để
            sàn của bạn bán nhanh hơn, kiểm soát tốt hơn.
          </p>

          {/* Stats nền tảng */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {PLATFORM_STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="mt-1 text-sm text-brand-100">{s.label}</div>
              </div>
            ))}
          </div>

          {/* 6 công cụ điều hành */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENCY_FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-brand-100">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register-agency"
              className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-brand-900 hover:bg-amber-300"
            >
              Đăng ký làm đại lý
            </Link>
            <Link
              href="/landing/agency"
              className="rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold hover:bg-white/10"
            >
              Xem trang dành cho sàn →
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Tổng quan dự án (rút gọn) ===== */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-bold sm:text-3xl">Tổng quan dự án</h2>
          <Link
            href={PROJECT_HREF}
            className="rounded-xl border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            Chi tiết dự án →
          </Link>
        </div>
        <dl className="mt-6 divide-y divide-brand-100 rounded-2xl border border-brand-100 bg-white">
          {overviewShort.map((r) => (
            <div key={r.label} className="grid grid-cols-3 gap-3 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                {r.label}
              </dt>
              <dd className="col-span-2 text-sm">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ===== CTA cuối ===== */}
      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-3xl bg-brand-900 px-6 py-10 text-center text-white sm:py-14">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Bắt đầu với hệ thống bán hàng Happy Home
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-brand-100">
            Khách hàng nhận bảng giá — Sale nhận công cụ chốt deal — Đại lý nhận
            trung tâm điều hành. Tất cả trên một nền tảng.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={HOTLINE_TEL}
              className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-6 py-3 text-base font-bold text-brand-900 transition hover:bg-amber-300"
            >
              Gọi ngay {HOTLINE}
            </a>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3 text-base font-semibold transition hover:bg-white/10"
            >
              Tạo tài khoản miễn phí
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
