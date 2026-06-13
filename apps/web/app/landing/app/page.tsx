import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ELC App — Nền tảng Proptech AI bán dự án Eurowindow Light City",
  description:
    "Trợ lý AI 24/7, bảng hàng realtime, phiếu giá tự động, Live Match và chăm sóc khách hàng tự động cho khách hàng và chuyên viên kinh doanh Eurowindow Light City.",
};

const FEATURES = [
  {
    icon: "🤖",
    title: "Chatbot AI 24/7",
    desc: "Tư vấn dự án, giải đáp chính sách và quỹ căn bất cứ lúc nào — không cần chờ giờ hành chính.",
  },
  {
    icon: "🏢",
    title: "Bảng hàng realtime",
    desc: "Tra cứu quỹ căn, tầng, view và trạng thái còn/giữ/đã bán cập nhật theo thời gian thực.",
  },
  {
    icon: "🧾",
    title: "Phiếu giá tự động",
    desc: "Tính giá, chiết khấu và lịch thanh toán chỉ trong vài giây, xuất phiếu chuẩn để gửi khách.",
  },
  {
    icon: "⚡",
    title: "Live Match",
    desc: "Ghép khách với căn hộ phù hợp nhất theo nhu cầu, ngân sách và khẩu vị đầu tư.",
  },
  {
    icon: "💬",
    title: "Chăm sóc AI",
    desc: "Tự động nhắc lịch, gửi tin và theo sát hành trình khách hàng, không bỏ lỡ cơ hội nào.",
  },
  {
    icon: "📈",
    title: "Công cụ cho Sale",
    desc: "Quản lý lead, hoa hồng và tài liệu bán hàng tập trung — chốt deal nhanh hơn.",
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
        ELC
      </div>
      <div>
        <div className="text-sm font-semibold tracking-wide text-brand-900">
          Eurowindow Light City
        </div>
        <div className="text-[11px] uppercase tracking-widest text-brand-700">
          Bừng sáng bên sông Mã
        </div>
      </div>
    </div>
  );
}

export default function LandingAppPage() {
  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
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
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-100 blur-3xl" />
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16 lg:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
              Nền tảng Proptech AI · Eurowindow Light City
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight text-brand-900 sm:text-4xl lg:text-5xl">
              Bán dự án ELC nhanh hơn với trợ lý AI đồng hành 24/7
            </h1>
            <p className="mt-4 text-base leading-relaxed text-brand-700 sm:text-lg">
              Chatbot AI tư vấn tức thì, bảng hàng realtime, phiếu giá tự động,
              Live Match ghép căn và chăm sóc khách hàng tự động — tất cả trong
              một ứng dụng, dùng mượt trên điện thoại.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register?type=client"
                className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Đăng ký khách hàng
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl border border-brand-500 bg-white px-6 py-3 text-base font-semibold text-brand-700 transition hover:bg-brand-50"
              >
                Đăng ký Sale
              </Link>
            </div>
            <p className="mt-4 text-sm text-brand-600">
              Đã có tài khoản?{" "}
              <Link href="/login" className="font-semibold text-brand-700 underline">
                Đăng nhập tại đây
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 pb-14">
        <h2 className="text-xl font-bold text-brand-900 sm:text-2xl">
          Mọi công cụ để chốt deal trong tầm tay
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-700">
          Thiết kế cho cả khách hàng tìm căn ưng ý và chuyên viên kinh doanh
          muốn bán nhanh, bán đúng.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm"
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

      {/* Audience split */}
      <section className="mx-auto max-w-6xl px-5 pb-14">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Dành cho khách hàng
            </div>
            <h3 className="mt-2 text-lg font-bold text-brand-900">
              Tìm căn hộ ưng ý, minh bạch giá
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-brand-700">
              Tra cứu quỹ căn, tính giá và lãi vay, so sánh căn và chat AI tư vấn
              dự án bất cứ lúc nào.
            </p>
            <Link
              href="/register?type=client"
              className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Đăng ký khách hàng
            </Link>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Dành cho chuyên viên kinh doanh
            </div>
            <h3 className="mt-2 text-lg font-bold text-brand-900">
              Quản lý lead & hoa hồng tập trung
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-brand-700">
              CRM, công cụ bán hàng, tài liệu dự án và phiếu giá tự động giúp bạn
              chốt khách nhanh hơn mỗi ngày.
            </p>
            <Link
              href="/register"
              className="mt-5 inline-flex rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Đăng ký Sale
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-3xl bg-brand-900 px-6 py-10 text-center sm:py-14">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Bắt đầu cùng ELC ngay hôm nay
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-brand-100">
            Cài ứng dụng ra màn hình chính để mở nhanh và dùng như app. Trình
            duyệt sẽ gợi ý cài đặt khi đủ điều kiện.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-600"
            >
              Đăng ký miễn phí
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-6 text-xs leading-relaxed text-brand-700">
          © Eurowindow Holding — Khu đô thị Eurowindow Light City, phường Nguyệt
          Viên, TP Thanh Hoá. Nền tảng hỗ trợ bán hàng; thông tin chi tiết (giá,
          chính sách) vui lòng liên hệ chuyên viên kinh doanh.
        </div>
      </footer>
    </div>
  );
}
