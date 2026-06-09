"use client";

import type { SaleAvailability } from "@/hooks/useSalePresence";

// Nút bật/tắt trạng thái sẵn sàng nhận khách của sale.
export function AvailabilityToggle({
  availability,
  connected,
  onChange,
}: {
  availability: SaleAvailability;
  connected: boolean;
  onChange: (a: SaleAvailability) => void;
}) {
  const isReady = availability === "online";
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(isReady ? "dnd" : "online")}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
          isReady
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "bg-brand-100 text-brand-600 hover:bg-brand-200"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isReady ? "bg-white" : "bg-rose-500"
          }`}
        />
        {isReady ? "🟢 Sẵn sàng nhận khách" : "🔴 Tạm dừng"}
      </button>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
          connected ? "text-emerald-600" : "text-rose-500"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"
          }`}
        />
        {connected ? "Đã kết nối" : "Mất kết nối…"}
      </span>
    </div>
  );
}
