import type { MetadataRoute } from "next";

import { getSeoSettings, normalizeBaseUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSeoSettings();
  const base = normalizeBaseUrl(seo.base_url);
  const allowAll = !seo.robots.toLowerCase().includes("noindex");

  return {
    rules: allowAll
      ? {
          userAgent: "*",
          allow: "/",
          disallow: ["/admin", "/api", "/dashboard/learning"],
        }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
