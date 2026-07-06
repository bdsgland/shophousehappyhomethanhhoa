import Link from "next/link";

import type { NewsListItem } from "@/lib/api";

/** Định dạng ngày kiểu VN; rỗng/không hợp lệ → "" hoặc giữ nguyên. */
export function formatNewsDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Thẻ tin tức TÁI DÙNG — đọc 1 NewsListItem từ public API `/news`.
 * Dùng ở: trang /news, tab "Tin tức" trong chi tiết dự án, các khối tin tức.
 * Link luôn nội bộ (/news/{slug}).
 */
export function NewsCard({ item }: { item: NewsListItem }) {
  const date = formatNewsDate(item.published_at);
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
              Happy Home Thanh Hóa
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-brand-600">
          {item.category ? <span>{item.category}</span> : null}
          {date ? <span>· {date}</span> : null}
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

/** Lưới tin tức TÁI DÙNG — rỗng → thông báo (không vỡ layout). */
export function NewsList({
  items,
  emptyText = "Chưa có bài viết nào được xuất bản.",
}: {
  items: NewsListItem[];
  emptyText?: string;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-12 text-center text-brand-600">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <NewsCard key={item.id} item={item} />
      ))}
    </div>
  );
}
