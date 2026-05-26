"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthBar } from "@/components/AuthBar";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-500" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-brand-900">
                Eurowindow Light City
              </div>
              <div className="text-[11px] uppercase tracking-widest text-brand-700">
                Bừng sáng bên sông Mã
              </div>
            </div>
          </Link>
          <nav className="hidden gap-6 text-sm md:flex">
            <a href="/#tong-quan" className="text-brand-900 hover:text-brand-600">
              Tổng quan
            </a>
            <a href="/#san-pham" className="text-brand-900 hover:text-brand-600">
              Sản phẩm
            </a>
            <a href="/#tien-ich" className="text-brand-900 hover:text-brand-600">
              Tiện ích
            </a>
            <a href="/#phap-ly" className="text-brand-900 hover:text-brand-600">
              Pháp lý
            </a>
          </nav>
          <AuthBar />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      <footer className="border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-brand-700">
          © Eurowindow Holding — Khu đô thị Eurowindow Light City, phường Nguyệt
          Viên, TP Thanh Hoá. Trang giới thiệu mang tính tham khảo; thông tin chi
          tiết (giá, chính sách) vui lòng liên hệ chuyên viên kinh doanh.
        </div>
      </footer>
    </>
  );
}
