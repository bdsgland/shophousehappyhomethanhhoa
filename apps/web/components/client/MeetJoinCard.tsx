"use client";

import { Video } from "@/components/dashboard/icons";

// Thẻ khách bấm vào Google Meet khi sale đã sẵn sàng.
export function MeetJoinCard({
  saleName,
  meetLink,
}: {
  saleName: string | null;
  meetLink: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500 to-teal-500 p-6 text-white shadow-md">
      <div className="flex items-center gap-2 text-emerald-50">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <span className="text-sm font-semibold uppercase tracking-wide">
          Sẵn sàng kết nối
        </span>
      </div>
      <h3 className="mt-2 text-xl font-bold">
        🎥 {saleName ? `Chuyên viên ${saleName}` : "Chuyên viên"} đã sẵn sàng tư vấn!
      </h3>
      <p className="mt-1 text-sm text-emerald-50">
        Bấm nút bên dưới để vào phòng họp Google Meet ngay bây giờ.
      </p>
      {meetLink ? (
        <a
          href={meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
        >
          <Video size={20} /> Vào ngay
        </a>
      ) : (
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/20 px-6 py-3 text-sm font-medium">
          Đang chuẩn bị phòng họp…
        </div>
      )}
    </div>
  );
}
