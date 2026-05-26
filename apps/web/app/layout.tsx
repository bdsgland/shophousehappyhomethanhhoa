import type { Metadata } from "next";

import { SiteShell } from "@/components/SiteShell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Eurowindow Light City — Bừng sáng bên sông Mã",
  description:
    "Khu đô thị Eurowindow Light City 176ha tại phường Nguyệt Viên, TP Thanh Hoá. Trang giới thiệu chính thức kèm trợ lý tư vấn AI 24/7.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
