import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Proptech — Dashboard",
  description:
    "Hệ thống AI-agent tự động hoá đầu phễu bán bất động sản cao cấp.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">
        <header className="border-b border-brand-100 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-brand-500" />
              <div>
                <div className="text-sm font-semibold text-brand-900">
                  Agent Proptech
                </div>
                <div className="text-xs text-brand-700">
                  AI saleman cho bất động sản cao cấp
                </div>
              </div>
            </div>
            <nav className="flex gap-6 text-sm">
              <a href="/" className="text-brand-900 hover:text-brand-600">
                Tổng quan
              </a>
              <a href="/leads" className="text-brand-900 hover:text-brand-600">
                Lead
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
