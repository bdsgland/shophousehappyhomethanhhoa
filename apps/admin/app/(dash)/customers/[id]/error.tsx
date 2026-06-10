"use client";

/**
 * Lưới an toàn cấp ROUTE cho trang chi tiết khách (App Router segment error
 * boundary). Bắt MỌI lỗi render trong route này — kể cả lỗi ngoài <ErrorBoundary>
 * của tab (header/tabs/tab Tổng quan) — để KHÔNG bao giờ trắng cả trang.
 * Next.js tự động bọc segment bằng file error.tsx này.
 */
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";

export default function CustomerDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <Link
        href="/customers"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-6 text-sm">
        <h2 className="mb-1 text-base font-semibold text-danger">
          Không tải được trang chi tiết khách
        </h2>
        <p className="text-muted-foreground">
          Đã xảy ra lỗi khi hiển thị. Bạn có thể thử lại hoặc quay về danh sách.
        </p>
        {error?.message && (
          <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        )}
        <button
          onClick={() => reset()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RotateCcw className="h-4 w-4" /> Thử lại
        </button>
      </div>
    </div>
  );
}
