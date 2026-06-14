import type { Metadata } from "next";
import Link from "next/link";

import { fetchPublicNews, type NewsListItem } from "@/lib/api";
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
      "Tin tức, cập nhật tiến độ và phân tích thị trường mới nhất từ Eurowindow Light City.",
    path: "/news",
  });
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function NewsCard({ item }: { item: NewsListItem }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/news/${item.slug}`} className="block">
        <div className="aspect-video overflow-hidden bg-brand-50">
          {item.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover_image}
              alt={item.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-brand-300">
              Eurowindow Light City
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-brand-600">
          {item.category ? <span>{item.category}</span> : null}
          {item.published_at ? <span>· {formatDate(item.published_at)}</span> : null}
        </div>
        <h2 className="mt-1 font-bold leading-snug text-brand-900">
          <Link href={`/news/${item.slug}`} className="hover:text-brand-600">
            {item.title}
          </Link>
        </h2>
        <p className="mt-2 flex-1 text-sm text-brand-700">{item.excerpt}</p>
        <Link
          href={`/news/${item.slug}`}
          className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-brand-600"
        >
          Đọc tiếp →
        </Link>
      </div>
    </article>
  );
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

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-12 text-center text-brand-600">
          Chưa có bài viết nào được xuất bản.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
