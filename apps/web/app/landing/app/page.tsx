import Link from "next/link";
import type { Metadata } from "next";

import {
  CONNECTIONS,
  HERO_IMAGES,
  OVERVIEW_ROWS,
  PRICE_TABLE,
  SUBZONES,
} from "@/components/dashboard/project-data";
import { fetchPublicNews } from "@/lib/api";

export const metadata: Metadata = {
  title: {
    absolute:
      "Shophouse Happy Home Thanh Hóa — Cận thị · Cận giang · Cận lộ | Bảng giá & tư vấn AI 24/7",
  },
  description:
    "Shophouse khối đế Happy Home tại trung tâm hành chính mới TP. Thanh Hóa — đại lý BDSG LAND. Nhận bảng giá, quỹ căn realtime, phiếu giá tự động và trợ lý AI tư vấn 24/7 cho khách hàng và chuyên viên kinh doanh.",
};

const PROJECT_HREF = "/dashboard/project/happy-home-thanh-hoa";

// Thanh tab chi tiết dự án (anchor tới các section trong trang — không cần đăng nhập).
const TABS: { id: string; label: string }[] = [
  { id: "tong-quan", label: "Tổng quan" },
  { id: "vi-tri", label: "Vị trí" },
  { id: "phan-khu", label: "Phân khu" },
  { id: "san-pham", label: "Sản phẩm" },
  { id: "thu-vien", label: "Thư viện" },
  { id: "tin-tuc", label: "Tin tức" },
  { id: "lien-he", label: "Liên hệ" },
];

// Điểm mạnh trải nghiệm nền tảng AI.
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
    desc: "Quỹ căn, tầng, hướng và trạng thái còn / giữ / đã bán cập nhật theo thời gian thực.",
  },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
        Happy Home
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide text-brand-900">
          Happy Home Thanh Hóa
        </div>
        <div className="text-[11px] uppercase tracking-widest text-brand-700">
          Cận thị · Cận giang · Cận lộ
        </div>
      </div>
    </Link>
  );
}

// Map bài tin tức (public API) → shape thẻ tin của landing. Fallback project-data.
type LandingNews = { title: string; date: string; excerpt: string; img: string; url: string };

function formatNewsDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function LandingAppPage() {
  const gallery = HERO_IMAGES.slice(0, 6);

  // Tin tức đồng bộ từ news_store (public API). Trống/lỗi → không hiển thị fallback link ngoài.
  const newsData = await fetchPublicNews({ pageSize: 3 });
  const news: LandingNews[] =
    newsData && newsData.items.length > 0
      ? newsData.items.map((n) => ({
          title: n.title,
          date: formatNewsDate(n.published_at),
          excerpt: n.excerpt,
          img: n.cover_image,
          url: `/news/${n.slug}`,
        }))
      : [];

  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      {/* ===== Header sticky + thanh tab chi tiết dự án ===== */}
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <Logo />
          <div className="flex items-center gap-2">
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
        {/* Tab chi tiết dự án — cuộn ngang trên mobile */}
        <nav
          aria-label="Mục dự án"
          className="border-t border-brand-100/70 bg-white/80"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-1.5 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50 hover:text-brand-900"
              >
                {t.label}
              </a>
            ))}
            <Link
              href={PROJECT_HREF}
              className="ml-auto shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Chi tiết dự án →
            </Link>
          </div>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-100 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-5 sm:py-16 lg:grid-cols-2 lg:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
              18 tòa · 2.824 căn hộ · Hạc Thành, Thanh Hóa
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight text-brand-900 sm:text-4xl lg:text-5xl">
              Shophouse Happy Home Thanh Hóa — Cận thị · Cận giang · Cận lộ
            </h1>
            <p className="mt-4 text-base leading-relaxed text-brand-700 sm:text-lg">
              Đại đô thị ánh sáng do Tập đoàn Vingroup phát triển: 7 phân khu đa
              phong cách, đại lộ Ánh Sáng độc bản, tiện ích all-in-one. Tra cứu
              quỹ căn, nhận bảng giá và được trợ lý AI tư vấn 24/7 — ngay trên
              điện thoại.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register?type=client"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Nhận bảng giá &amp; tư vấn
              </Link>
              <a
                href="#lien-he"
                className="inline-flex items-center justify-center rounded-xl border border-brand-500 bg-white px-6 py-3 text-base font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                💬 Chat tư vấn AI
              </a>
            </div>
            <p className="mt-4 text-sm text-brand-600">
              Đã có tài khoản?{" "}
              <Link
                href="/login"
                className="font-semibold text-brand-700 underline"
              >
                Đăng nhập
              </Link>
            </p>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HERO_IMAGES[0]?.src}
                alt={HERO_IMAGES[0]?.caption}
                className="aspect-[4/3] h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 left-4 right-4 rounded-2xl border border-brand-100 bg-white/95 px-4 py-3 shadow-md backdrop-blur sm:left-8 sm:right-8">
              <div className="grid grid-cols-3 divide-x divide-brand-100 text-center">
                <div className="px-1">
                  <div className="text-lg font-bold text-brand-900">18 tòa</div>
                  <div className="text-[11px] text-brand-600">Quy mô</div>
                </div>
                <div className="px-1">
                  <div className="text-lg font-bold text-brand-900">
                    7 phân khu
                  </div>
                  <div className="text-[11px] text-brand-600">Đa phong cách</div>
                </div>
                <div className="px-1">
                  <div className="text-lg font-bold text-brand-900">
                    Q2/2026
                  </div>
                  <div className="text-[11px] text-brand-600">Bàn giao đợt 1</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Tổng quan ===== */}
      <section id="tong-quan" className="scroll-mt-28 border-t border-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            Tổng quan dự án
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-brand-700">
            Happy Home Thanh Hóa là đại đô thị kiểu mẫu bên dòng sông Mã, kiến
            tạo phong cách sống ánh sáng với hệ tiện ích đồng bộ và quy hoạch
            cảnh quan đặc sắc.
          </p>
          <div className="mt-7 overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {OVERVIEW_ROWS.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 ? "bg-white" : "bg-brand-50/40"}
                  >
                    <td className="w-1/3 border-b border-brand-100 px-5 py-3 align-top font-semibold text-brand-900">
                      {row.label}
                    </td>
                    <td className="border-b border-brand-100 px-5 py-3 text-brand-700">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===== Trải nghiệm AI ===== */}
      <section className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            Mua nhà thông minh hơn với nền tảng Proptech AI
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-brand-700">
            Mọi thông tin minh bạch, phản hồi tức thì — dành cho cả khách hàng
            tìm căn ưng ý và chuyên viên muốn chốt nhanh.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AI_FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-brand-100 bg-[#fbf9f5] p-5 shadow-sm"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-2xl">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-base font-semibold text-brand-900">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-brand-700">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Vị trí ===== */}
      <section id="vi-tri" className="scroll-mt-28 border-t border-brand-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-5 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
              Vị trí kết nối
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-700">
              Toạ lạc tại phường Hạc Thành — cửa ngõ phía Bắc TP Thanh Hoá,
              liền kề Quốc lộ 1A và cầu Hoằng Long. Kết nối thuận tiện tới trung
              tâm hành chính, trường học, bệnh viện và hệ thống thương mại dịch
              vụ.
            </p>
            <ul className="mt-5 space-y-2">
              {CONNECTIONS.map((c) => (
                <li
                  key={c.place}
                  className="flex items-center justify-between rounded-xl border border-brand-100 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <span className="font-medium text-brand-900">📍 {c.place}</span>
                  <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {c.time}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-100 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_IMAGES[1]?.src}
              alt="Trục cảnh quan Happy Home Thanh Hóa"
              className="h-full min-h-[280px] w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ===== Phân khu ===== */}
      <section
        id="phan-khu"
        className="scroll-mt-28 border-t border-brand-100 bg-white"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            {SUBZONES.length} phân khu đa phong cách
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-brand-700">
            Mỗi phân khu mang một bản sắc kiến trúc riêng, từ Nhật Bản tối giản
            đến Pháp tân cổ điển và Art Deco hiện đại.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SUBZONES.map((z) => (
              <div
                key={z.name}
                className="group overflow-hidden rounded-2xl border border-brand-100 bg-[#fbf9f5] shadow-sm transition hover:shadow-md"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={z.img}
                    alt={z.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-brand-900">
                      Phân khu {z.name}
                    </h3>
                    <span className="shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {z.units}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-brand-600">
                    {z.style}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-brand-700">
                    {z.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Sản phẩm / Mặt bằng ===== */}
      <section id="san-pham" className="scroll-mt-28 border-t border-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
                Sản phẩm &amp; bảng giá tham khảo
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-brand-700">
                Đa dạng loại hình: nhà liền kề, shophouse, biệt thự. Xem mặt bằng
                quỹ căn realtime và lập phiếu giá ngay trong ứng dụng.
              </p>
            </div>
            <Link
              href={PROJECT_HREF}
              className="rounded-xl border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Xem mặt bằng quỹ căn
            </Link>
          </div>
          <div className="mt-7 overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-sm">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="bg-brand-50 text-left text-xs font-bold uppercase tracking-wide text-brand-900">
                  <th className="px-5 py-3">Loại sản phẩm</th>
                  <th className="px-5 py-3">Diện tích</th>
                  <th className="px-5 py-3">Giá từ</th>
                </tr>
              </thead>
              <tbody>
                {PRICE_TABLE.map((r, i) => (
                  <tr
                    key={r.product}
                    className={`border-t border-brand-100 ${
                      i % 2 ? "bg-white" : "bg-brand-50/30"
                    }`}
                  >
                    <td className="px-5 py-3 font-semibold text-brand-900">
                      {r.product}
                    </td>
                    <td className="px-5 py-3 text-brand-700">{r.area}</td>
                    <td className="px-5 py-3 font-semibold text-brand-600">
                      {r.from}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-brand-100 px-5 py-2.5 text-xs italic text-brand-700">
              * Giá tham khảo, chưa gồm VAT và phí. Bảng giá chính thức theo từng
              đợt mở bán — liên hệ chuyên viên để nhận phiếu giá chi tiết.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Thư viện ảnh ===== */}
      <section
        id="thu-vien"
        className="scroll-mt-28 border-t border-brand-100 bg-white"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            Thư viện hình ảnh
          </h2>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((img, i) => (
              <div
                key={`${img.src}-${i}`}
                className="group overflow-hidden rounded-xl border border-brand-100 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.caption}
                  className="aspect-[4/3] h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Tin tức ===== */}
      <section id="tin-tuc" className="scroll-mt-28 border-t border-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            Tin tức dự án
          </h2>
          {news.length === 0 ? (
            <p className="mt-7 rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-sm text-brand-600">
              Chưa có tin tức.
            </p>
          ) : (
            <>
              <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {news.slice(0, 3).map((n, i) => (
                  <article
                    key={`${n.title}-${i}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="aspect-video overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={n.img}
                        alt={n.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <span className="text-xs font-medium text-brand-600">
                        {n.date}
                      </span>
                      <h3 className="mt-1 font-bold leading-snug text-brand-900">
                        {n.title}
                      </h3>
                      <p className="mt-2 flex-1 text-sm text-brand-700">
                        {n.excerpt}
                      </p>
                      <Link
                        href={n.url}
                        className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-brand-600"
                      >
                        Đọc tiếp →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  href="/news"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600"
                >
                  Xem thêm →
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ===== Mời sale / môi giới ===== */}
      <section className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-amber-50 p-6 sm:p-10">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                  Dành cho môi giới
                </span>
                <h2 className="mt-2 text-2xl font-bold text-brand-900">
                  Bạn là môi giới? Bán Happy Home bằng nền tảng AI
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-700">
                  CRM 360, bảng hàng realtime, phiếu giá tự động, đội Sale AI hỗ
                  trợ chăm khách và chính sách hoa hồng minh bạch — mọi công cụ
                  để bạn chốt deal nhanh hơn mỗi ngày.
                </p>
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
        </div>
      </section>

      {/* ===== Liên hệ / CTA ===== */}
      <section id="lien-he" className="scroll-mt-28 border-t border-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-5">
          <div className="rounded-3xl bg-brand-900 px-6 py-10 text-center sm:py-14">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Nhận bảng giá &amp; tư vấn cùng trợ lý AI
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-brand-100">
              Đăng ký để được chatbot AI tư vấn 24/7, nhận bảng giá mới nhất và
              kết nối chuyên viên kinh doanh phụ trách dự án.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register?type=client"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-600"
              >
                Nhận bảng giá &amp; tư vấn
              </Link>
              <Link
                href={PROJECT_HREF}
                className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Xem chi tiết dự án
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-brand-700 sm:px-5">
          © BDSG LAND — Đại lý phát triển kinh doanh dự án Shophouse Happy Home Thanh Hóa (CĐT: Tập đoàn Vingroup), phường Hạc Thành, tỉnh Thanh Hóa. Nền tảng hỗ trợ bán hàng; thông tin chi tiết (giá,
          chính sách) vui lòng liên hệ chuyên viên kinh doanh.
        </div>
      </footer>
    </div>
  );
}
