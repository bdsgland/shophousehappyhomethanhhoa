import Link from "next/link";
import type { Metadata } from "next";

import { HERO_IMAGES, SUBZONES } from "@/components/dashboard/elc-data";

export const metadata: Metadata = {
  title:
    "ELC Agency — Trở thành đại lý phân phối Eurowindow Light City | Nền tảng Proptech AI",
  description:
    "Báo cáo realtime, trung tâm quyết định, đội Sale AI 1000 chăm khách tự động, tự động hoá 90% vận hành, hoa hồng minh bạch và CRM 360 cho sàn và đại lý phân phối Eurowindow Light City.",
};

const PROJECT_HREF = "/dashboard/project/eurowindow-light-city";

// Công cụ điều hành cho chủ sàn / đại lý — nhấn lợi ích kinh doanh.
const FEATURES: { icon: string; title: string; desc: string }[] = [
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

const STATS: { value: string; label: string }[] = [
  { value: "Realtime", label: "Cập nhật số liệu vận hành" },
  { value: "1000+", label: "Trợ lý Sale AI chăm khách song song" },
  { value: "90%", label: "Tác vụ vận hành được tự động hoá" },
  { value: "360°", label: "Hồ sơ khách hàng đa kênh" },
];

const BENEFITS: string[] = [
  "Sản phẩm độc quyền 176ha — biên hoa hồng hấp dẫn",
  "Bộ tài liệu, bảng hàng và phiếu giá chuẩn hoá sẵn",
  "Đội Sale AI hỗ trợ chăm khách, không bỏ lỡ cơ hội",
  "Báo cáo & đối soát hoa hồng minh bạch theo thời gian thực",
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
        ELC
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide text-white">
          Eurowindow Light City
        </div>
        <div className="text-[11px] uppercase tracking-widest text-brand-100">
          Trung tâm điều hành sàn
        </div>
      </div>
    </Link>
  );
}

export default function LandingAgencyPage() {
  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      {/* ===== Header (tông tối, chuyên nghiệp) ===== */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Logo />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10"
            >
              Đăng nhập chủ sàn
            </Link>
            <Link
              href="/register?type=sale"
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Đăng ký làm đại lý
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-brand-900">
        <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5 sm:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-100">
              Dành cho Sàn &amp; Đại lý phân phối
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              Trở thành đại lý phân phối ELC — vận hành bằng nền tảng Proptech AI
              mạnh nhất
            </h1>
            <p className="mt-4 text-base leading-relaxed text-brand-100 sm:text-lg">
              Một trung tâm điều hành duy nhất: theo dõi doanh số tức thời, ra
              quyết định dựa trên dữ liệu, vận hành đội Sale AI quy mô lớn và tự
              động hoá tới 90% công việc lặp lại — để sàn của bạn bán nhanh hơn,
              kiểm soát tốt hơn.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register?type=sale"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Đăng ký làm đại lý
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Đăng nhập chủ sàn
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="mt-1 text-sm text-brand-100">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Công cụ điều hành ===== */}
      <section id="tinh-nang" className="scroll-mt-24 border-t border-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
            Công cụ điều hành cho chủ sàn
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-brand-700">
            Tất cả những gì cần để giám sát, ra quyết định và mở rộng năng lực
            bán hàng của sàn — đo bằng doanh thu, không phải bằng số giờ làm việc.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm"
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

      {/* ===== Lợi ích hợp tác ===== */}
      <section className="border-t border-brand-100 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-5 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
              Vì sao hợp tác phân phối ELC?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-700">
              Một đại đô thị 176ha do Eurowindow Holding phát triển, kết hợp nền
              tảng công nghệ giúp sàn vận hành tinh gọn và bứt tốc doanh số.
            </p>
            <ul className="mt-5 space-y-3">
              {BENEFITS.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 rounded-xl border border-brand-100 bg-[#fbf9f5] px-4 py-3 text-sm text-brand-900"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-100 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_IMAGES[7]?.src ?? HERO_IMAGES[0]?.src}
              alt="Tổng quan Eurowindow Light City"
              className="h-full min-h-[280px] w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ===== Sản phẩm phân phối ===== */}
      <section id="san-pham" className="scroll-mt-24 border-t border-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
                Sản phẩm phân phối — {SUBZONES.length} phân khu
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-brand-700">
                Đại lý xem nhanh các phân khu, quỹ căn và tài liệu bán hàng ngay
                trong nền tảng.
              </p>
            </div>
            <Link
              href={PROJECT_HREF}
              className="rounded-xl border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Xem chi tiết dự án
            </Link>
          </div>
          <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SUBZONES.slice(0, 6).map((z) => (
              <div
                key={z.name}
                className="group overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition hover:shadow-md"
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-5">
          <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-amber-50 px-6 py-10 text-center sm:py-14">
            <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">
              Sẵn sàng điều hành sàn của bạn?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-brand-700">
              Đăng nhập bằng tài khoản chủ sàn để vào trung tâm điều hành, hoặc
              đăng ký làm đại lý phân phối để bắt đầu bán ELC bằng nền tảng AI.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl bg-brand-900 px-7 py-3 text-base font-semibold text-white transition hover:bg-brand-700"
              >
                Đăng nhập chủ sàn
              </Link>
              <Link
                href="/register?type=sale"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-7 py-3 text-base font-semibold text-white transition hover:bg-brand-600"
              >
                Đăng ký làm đại lý
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-brand-700 sm:px-5">
          © Eurowindow Holding — Khu đô thị Eurowindow Light City, phường Nguyệt
          Viên, TP Thanh Hoá. Trung tâm điều hành dành cho sàn và đại lý phân
          phối chính thức.
        </div>
      </footer>
    </div>
  );
}
