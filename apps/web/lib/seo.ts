import type { Metadata } from "next";

import { fetchSeoSettings, type SeoSettings } from "@/lib/api";

// Fallback tĩnh khi API SEO chưa cấu hình / không kết nối (giữ tương thích cũ).
export const SEO_FALLBACK: SeoSettings = {
  site_name: "Shophouse Happy Home Thanh Hóa",
  title_template: "%s | Shophouse Happy Home Thanh Hóa",
  default_title: "Shophouse Happy Home Thanh Hóa — Cận thị · Cận giang · Cận lộ",
  default_description:
    "Shophouse khối đế Happy Home tại trung tâm hành chính mới TP. Thanh Hóa, bên Đại lộ Nam Sông Mã. Đại lý phát triển kinh doanh BDSG LAND — tư vấn AI 24/7, hotline 0967 806 686.",
  default_keywords: [],
  default_og_image: "",
  base_url: "https://happyhomethanhhoa.bdsg.land",
  twitter_handle: "",
  robots: "index, follow",
  pages: {},
  version: 0,
  updated_at: null,
  updated_by: null,
};

/** Đọc cấu hình SEO (public) với fallback tĩnh — không bao giờ throw. */
export async function getSeoSettings(): Promise<SeoSettings> {
  const s = await fetchSeoSettings();
  return s ?? SEO_FALLBACK;
}

/** Chuẩn hoá base URL: thêm https nếu thiếu scheme, bỏ dấu / cuối. Không throw. */
export function normalizeBaseUrl(raw: string | null | undefined): string {
  let base = (raw || SEO_FALLBACK.base_url).trim();
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/$/, "");
  try {
    // Validate; nếu hỏng → fallback.
    return new URL(base).toString().replace(/\/$/, "");
  } catch {
    return SEO_FALLBACK.base_url;
  }
}

function robotsFromString(robots: string): Metadata["robots"] {
  const r = (robots || "index, follow").toLowerCase();
  return { index: !r.includes("noindex"), follow: !r.includes("nofollow") };
}

/**
 * Dựng Metadata Next.js từ cấu hình SEO + tuỳ biến từng trang.
 *
 * - pageKey: lấy override trong seo.pages[pageKey] (nếu có).
 * - title/description/ogImage: ưu tiên cao nhất (vd bài viết cụ thể).
 * - asicTemplate=false → đặt title tuyệt đối (không nối title_template).
 */
export function buildMetadata(
  seo: SeoSettings,
  opts: {
    pageKey?: string;
    title?: string;
    description?: string;
    ogImage?: string;
    keywords?: string[];
    path?: string;
    absoluteTitle?: boolean;
  } = {},
): Metadata {
  const override = (opts.pageKey && seo.pages?.[opts.pageKey]) || null;
  const title =
    opts.title || override?.title || seo.default_title;
  const description =
    opts.description || override?.description || seo.default_description;
  const keywords =
    opts.keywords ||
    (override?.keywords?.length ? override.keywords : seo.default_keywords);
  const ogImage = opts.ogImage || override?.og_image || seo.default_og_image;
  const base = normalizeBaseUrl(seo.base_url);

  const images = ogImage ? [{ url: ogImage }] : undefined;

  const meta: Metadata = {
    metadataBase: new URL(base),
    title: opts.absoluteTitle
      ? { absolute: title }
      : title,
    description,
    keywords: keywords && keywords.length ? keywords : undefined,
    robots: robotsFromString(seo.robots),
    alternates: opts.path ? { canonical: opts.path } : undefined,
    openGraph: {
      type: "website",
      siteName: seo.site_name,
      title,
      description,
      url: opts.path ? `${base}${opts.path}` : base,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: seo.twitter_handle || undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  };
  return meta;
}
