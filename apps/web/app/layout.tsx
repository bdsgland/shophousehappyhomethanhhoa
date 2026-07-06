import type { Metadata, Viewport } from "next";

import { SiteShell } from "@/components/SiteShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { getSeoSettings, normalizeBaseUrl } from "@/lib/seo";

import "./globals.css";

/**
 * Metadata site-wide đọc từ cấu hình SEO (admin) qua API công khai. title
 * template áp cho mọi trang con đặt title dạng chuỗi. Lỗi/không kết nối →
 * fallback tĩnh (giữ tương thích cũ). Không bao giờ throw.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  const base = normalizeBaseUrl(seo.base_url);
  const ogImage = seo.default_og_image || undefined;
  return {
    metadataBase: new URL(base),
    title: { default: seo.default_title, template: seo.title_template },
    description: seo.default_description,
    keywords:
      seo.default_keywords && seo.default_keywords.length
        ? seo.default_keywords
        : undefined,
    applicationName: seo.site_name,
    manifest: "/manifest.webmanifest",
    robots: {
      index: !seo.robots.toLowerCase().includes("noindex"),
      follow: !seo.robots.toLowerCase().includes("nofollow"),
    },
    openGraph: {
      type: "website",
      siteName: seo.site_name,
      title: seo.default_title,
      description: seo.default_description,
      url: base,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      site: seo.twitter_handle || undefined,
      images: ogImage ? [ogImage] : undefined,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Happy Home",
    },
    icons: {
      icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.svg" }],
    },
  };
}

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
