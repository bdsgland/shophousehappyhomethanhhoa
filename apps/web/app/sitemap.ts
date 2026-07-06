import type { MetadataRoute } from "next";

import { fetchPublicNews } from "@/lib/api";
import { getSeoSettings, normalizeBaseUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSeoSettings();
  const base = normalizeBaseUrl(seo.base_url);
  const now = new Date();

  // Trang chính.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/news`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${base}/dashboard/project/happy-home-thanh-hoa`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  // Bài tin tức đã xuất bản.
  const data = await fetchPublicNews({ pageSize: 100 });
  const articles: MetadataRoute.Sitemap = (data?.items ?? []).map((a) => ({
    url: `${base}/news/${a.slug}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...articles];
}
