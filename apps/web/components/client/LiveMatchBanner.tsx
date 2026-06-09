"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { MessageCircle, User } from "@/components/dashboard/icons";
import { useCustomerMatch } from "@/hooks/useCustomerMatch";
import { readToken } from "@/lib/auth";

import { ChatWithAIFallback } from "./ChatWithAIFallback";
import { MeetJoinCard } from "./MeetJoinCard";

// Banner "Sale phụ trách bạn" realtime: tự kết nối WS, hiện trạng thái match.
export function LiveMatchBanner() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(readToken()), []);

  const { phase, saleName, meetLink, fallbackMessage } = useCustomerMatch(token);

  if (phase === "ready") {
    return <MeetJoinCard saleName={saleName} meetLink={meetLink} />;
  }

  if (phase === "no_sale") {
    return <ChatWithAIFallback message={fallbackMessage} />;
  }

  if (phase === "completed") {
    return (
      <div className="rounded-2xl border border-brand-100 bg-white p-5 text-sm text-brand-700 shadow-sm">
        Cảm ơn bạn đã trao đổi với chuyên viên ELC 💙 Bạn có thể đặt lịch xem nhà
        hoặc tiếp tục hỏi trợ lý AI bất cứ lúc nào.
      </div>
    );
  }

  // connecting | assigning | assigned → trạng thái "đang phân công / chuẩn bị"
  const assigned = phase === "assigned";
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-sky-50 p-5 shadow-sm">
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-500">
        <span className="absolute inline-flex h-12 w-12 animate-ping rounded-full bg-indigo-200 opacity-40" />
        <User size={24} className="relative" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-brand-900">
          {assigned
            ? `Chuyên viên ${saleName ?? ""} đang chuẩn bị kết nối với bạn…`
            : "Đang phân công chuyên viên cho bạn…"}
        </div>
        <div className="text-xs text-brand-600">
          Hệ thống đang tìm chuyên viên phù hợp nhất. Trong lúc chờ, bạn có thể{" "}
          <Link
            href="/client/chat"
            className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
          >
            <MessageCircle size={12} /> chat với trợ lý AI
          </Link>
          .
        </div>
      </div>
      <span className="hidden shrink-0 sm:flex">
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
        </span>
      </span>
    </div>
  );
}
