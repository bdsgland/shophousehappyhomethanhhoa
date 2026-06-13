"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthBar } from "@/components/AuthBar";
import { BottomNav } from "@/components/pwa/BottomNav";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // "/" và các trang landing host-based (/landing/app, /landing/agency) render
  // bare, không kèm app chrome (header/AuthBar/BottomNav) để giữ tông marketing.
  const isLanding = pathname === "/" || pathname.startsWith("/landing");

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
          <AuthBar />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 pb-24 lg:pb-10">
        {children}
      </main>
      <footer className="border-t border-brand-100 bg-white pb-16 lg:pb-0">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-brand-700">
          © Eurowindow Holding — Khu đô thị Eurowindow Light City, phường Nguyệt
          Viên, TP Thanh Hoá. Trang giới thiệu mang tính tham khảo; thông tin chi
          tiết (giá, chính sách) vui lòng liên hệ chuyên viên kinh doanh.
        </div>
      </footer>
      <BottomNav />
    </>
  );
}
