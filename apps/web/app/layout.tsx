import type { Metadata, Viewport } from "next";

import { SiteShell } from "@/components/SiteShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

import "./globals.css";

export const metadata: Metadata = {
  title: "Eurowindow Light City — Bừng sáng bên sông Mã",
  description:
    "Khu đô thị Eurowindow Light City 176ha tại phường Nguyệt Viên, TP Thanh Hoá. Trang giới thiệu chính thức kèm trợ lý tư vấn AI 24/7.",
  applicationName: "Eurowindow Light City",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ELC",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#b8893e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
