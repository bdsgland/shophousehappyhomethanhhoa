import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchPublicArticle } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { buildMetadata, getSeoSettings } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [seo, article] = await Promise.all([
    getSeoSettings(),
    fetchPublicArticle(params.slug),
  ]);
  if (!article) {
    return buildMetadata(seo, {
      title: "Không tìm thấy bài viết",
      description: "Bài viết không tồn tại hoặc chưa được xuất bản.",
      path: `/news/${params.slug}`,
    });
  }
  return buildMetadata(seo, {
    title: article.seo?.meta_title || article.title,
    description: article.seo?.meta_description || article.excerpt,
    ogImage: article.seo?.og_image || article.cover_image,
    keywords: article.seo?.keywords,
    path: `/news/${article.slug}`,
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

export default async function NewsArticlePage({ params }: Params) {
  const article = await fetchPublicArticle(params.slug);
  if (!article) notFound();

  const html = renderMarkdown(article.content);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-5">
      <Link
        href="/news"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ← Tất cả tin tức
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2 text-xs font-medium text-brand-600">
          {article.category ? <span>{article.category}</span> : null}
          {article.published_at ? (
            <span>· {formatDate(article.published_at)}</span>
          ) : null}
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="mt-3 text-lg text-brand-700">{article.excerpt}</p>
        ) : null}
      </header>

      {article.cover_image ? (
        <div className="mt-6 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.cover_image}
            alt={article.title}
            className="w-full object-cover"
          />
        </div>
      ) : null}

      <article
        className="article-content mt-8 max-w-none text-brand-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {article.tags && article.tags.length > 0 ? (
        <div className="mt-8 flex flex-wrap gap-2 border-t border-brand-100 pt-6">
          {article.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </main>
  );
}
