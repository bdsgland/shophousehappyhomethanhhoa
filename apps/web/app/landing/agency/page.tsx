import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ELC Agency — Trung tâm điều hành sàn & đại lý",
  description:
    "Báo cáo realtime, trung tâm quyết định, đội Sale AI 1000 và tự động hoá 90% vận hành cho chủ sàn và đại lý phân phối Eurowindow Light City.",
};

const FEATURES = [
  {
    icon: "📊",
    title: "Báo cáo realtime",
    desc: "Doanh thu, phễu lead, hoa hồng và sức khoẻ nền tảng cập nhật tức thời trên một màn hình điều hành.",
  },
  {
    icon: "🎯",
    title: "Trung tâm quyết định",
    desc: "Tổng hợp dữ liệu thành đề xuất hành động rõ ràng để chủ sàn ra quyết định nhanh và chuẩn.",
  },
  {
    icon: "🤖",
    title: "Đội Sale AI 1000",
    desc: "Hàng nghìn trợ lý AI chăm khách song song, mở rộng năng lực bán hàng mà không tăng chi phí nhân sự.",
  },
  {
    icon: "⚙️",
    title: "Tự động hoá 90%",
    desc: "Phân bổ lead, chăm sóc, nhắc lịch và báo cáo gần như tự động — đội ngũ tập trung vào việc tạo doanh thu.",
  },
];

const STATS = [
  { value: "Realtime", label: "Cập nhật số liệu vận hành" },
  { value: "1000+", label: "Trợ lý Sale AI chăm khách song song" },
  { value: "90%", label: "Tác vụ vận hành được tự động hoá" },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
        ELC
      </div>
      <div>
        <div className="text-sm font-semibold tracking-wide text-white">
          Eurowindow Light City
        </div>
        <div className="text-[11px] uppercase tracking-widest text-brand-100">
          Trung tâm điều hành sàn
        </div>
      </div>
    </div>
  );
}

export default function LandingAgencyPage() {
  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      {/* Header (tông tối, chuyên nghiệp) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Logo />
          <Link
            href="/login"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
          >
            Đăng nhập chủ sàn
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-900">
        <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-100">
              Dành cho Sàn & Đại lý phân phối
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              Điều hành sàn bằng dữ liệu realtime và đội Sale AI
            </h1>
            <p className="mt-4 text-base leading-relaxed text-brand-100 sm:text-lg">
              Một trung tâm điều hành duy nhất: theo dõi doanh số tức thời, ra
              quyết định dựa trên dữ liệu, vận hành đội Sale AI quy mô lớn và tự
              động hoá tới 90% công việc lặp lại.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Đăng nhập chủ sàn
              </Link>
              <a
                href="#tinh-nang"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Tìm hiểu tính năng
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      {/* Features */}
      <section id="tinh-nang" className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
          Công cụ điều hành cho chủ sàn
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-700">
          Tất cả những gì cần để giám sát, quyết định và mở rộng năng lực bán
          hàng của sàn.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-3xl border border-brand-100 bg-white px-6 py-10 text-center shadow-sm sm:py-14">
          <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">
            Sẵn sàng điều hành sàn của bạn?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-brand-700">
            Đăng nhập bằng tài khoản chủ sàn để vào trung tâm điều hành. Chưa có
            quyền truy cập? Liên hệ quản trị hệ thống để được cấp tài khoản.
          </p>
          <div className="mt-7 flex justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-7 py-3 text-base font-semibold text-white transition hover:bg-brand-600"
            >
              Đăng nhập chủ sàn
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-6 text-xs leading-relaxed text-brand-700">
          © Eurowindow Holding — Khu đô thị Eurowindow Light City, phường Nguyệt
          Viên, TP Thanh Hoá. Trung tâm điều hành dành cho sàn và đại lý phân
          phối chính thức.
        </div>
      </footer>
    </div>
  );
}
