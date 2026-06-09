"use client";

import Link from "next/link";

import { MessageCircle } from "@/components/dashboard/icons";

// Hiển thị khi không có sale online — khách được trấn an + mời chat AI.
export function ChatWithAIFallback({ message }: { message: string | null }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="text-sm font-semibold text-amber-800">
        Các chuyên viên đang bận 💛
      </div>
      <p className="mt-1 text-sm text-amber-700">
        {message ??
          "Chuyên viên sẽ liên hệ với bạn qua điện thoại trong ít phút."}{" "}
        Trong lúc chờ, bạn có thể hỏi trợ lý AI bất cứ điều gì.
      </p>
      <Link
        href="/client/chat"
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
      >
        <MessageCircle size={16} /> Chat với trợ lý AI
      </Link>
    </div>
  );
}
