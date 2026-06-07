"use client";

import type { InventoryUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAP_WIDTH = 2001;
const MAP_HEIGHT = 1126;

function markerColor(trangThai: string): string {
  if (trangThai === "Còn hàng") return "bg-success";
  if (trangThai === "Đặt cọc") return "bg-warning";
  return "bg-muted-foreground";
}

export function InventoryMap({
  units,
  onSelect,
}: {
  units: InventoryUnit[];
  onSelect: (unit: InventoryUnit) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Sơ đồ mặt bằng (vị trí tương đối)
        </span>
        <LegendDot className="bg-success" label="Còn hàng" />
        <LegendDot className="bg-warning" label="Đặt cọc" />
        <LegendDot className="bg-muted-foreground" label="Đã bán" />
      </div>
      <div
        className="relative w-full overflow-hidden rounded-lg border border-border bg-muted"
        style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
      >
        {units.map((u) => (
          <button
            key={u.id}
            type="button"
            title={`${u.id} • ${u.gia} • ${u.trang_thai}`}
            onClick={() => onSelect(u)}
            style={{
              left: `${(u.position.x / MAP_WIDTH) * 100}%`,
              top: `${(u.position.y / MAP_HEIGHT) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
            className={cn(
              "absolute h-3 w-3 rounded-full border border-white/70 shadow-sm transition-transform hover:z-10 hover:scale-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              markerColor(u.trang_thai),
            )}
          >
            <span className="sr-only">{u.id}</span>
          </button>
        ))}
        {units.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Không có căn phù hợp.
          </div>
        )}
      </div>
    </div>
  );
}

function LegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}
