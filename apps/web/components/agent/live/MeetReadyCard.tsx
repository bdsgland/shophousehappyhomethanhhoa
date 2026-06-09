"use client";

import { Video } from "@/components/dashboard/icons";
import type { MatchRequest } from "@/lib/match";

// Thẻ hiển thị khi Meet đã sẵn sàng — nút mở Google Meet + nút Kết thúc call.
export function MeetReadyCard({
  match,
  onEnd,
}: {
  match: MatchRequest;
  onEnd: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
      <div className="flex items-center gap-2 text-emerald-700">
        <span className="flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-sm font-bold uppercase tracking-wide">
          Phòng họp đã sẵn sàng
        </span>
      </div>

      <h3 className="mt-3 text-lg font-bold text-brand-900">
        Khách {match.customer_name} đang chờ bạn 🎥
      </h3>
      <p className="mt-1 text-sm text-brand-600">
        Anh/chị chuẩn bị tinh thần rồi bấm vào phòng họp Google Meet.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {match.meet_link ? (
          <a
            href={match.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Video size={20} /> Mở Google Meet
          </a>
        ) : (
          <span className="flex-1 rounded-xl bg-brand-100 px-5 py-3 text-center text-sm text-brand-500">
            Đang tạo phòng họp…
          </span>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="inline-flex items-center justify-center rounded-xl border border-brand-200 px-5 py-3 text-sm font-semibold text-brand-700 transition hover:bg-white"
        >
          Kết thúc & ghi nhận
        </button>
      </div>
    </div>
  );
}
