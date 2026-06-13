import Link from "next/link";

export const metadata = {
  title: "Ngoại tuyến — Eurowindow Light City",
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700">
        ELC
      </div>
      <h1 className="mt-5 text-xl font-bold text-brand-900">
        Bạn đang ngoại tuyến
      </h1>
      <p className="mt-2 text-sm text-brand-600">
        Không có kết nối mạng. Một số nội dung cần Internet để tải. Vui lòng kiểm
        tra kết nối rồi thử lại.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Thử lại
      </Link>
    </div>
  );
}
