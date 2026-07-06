import type { Metadata } from "next";

import { fetchPublicNews } from "@/lib/api";
import { NewsList } from "@/components/news/NewsList";
import { buildMetadata, getSeoSettings } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  const override = seo.pages?.news;
  return buildMetadata(seo, {
    pageKey: "news",
    title: override?.title || "Tin tức",
    description:
      override?.description ||
      "Tin tức, cập nhật tiến độ và phân tích thị trường mới nhất từ Happy Home Thanh Hóa.",
    path: "/news",
  });
}

export default async function NewsListPage() {
  const data = await fetchPublicNews({ pageSize: 24 });
  const items = data?.items ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">Tin tức</h1>
        <p className="mt-2 text-brand-700">
          Cập nhật tiến độ, chính sách và phân tích thị trường mới nhất.
        </p>
      </header>

      <NewsList items={items} />
    </main>
  );
}
