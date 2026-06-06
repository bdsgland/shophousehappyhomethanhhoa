"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getPlatformsHealth } from "@/lib/api";
import { HealthDot } from "./HealthDot";

// Dải 5 chấm trạng thái nền tảng trên topbar. Click → trang /platforms.
export function HealthStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ["platforms-health"],
    queryFn: getPlatformsHealth,
    refetchInterval: 60_000, // tự refresh mỗi 60s
  });

  const platforms = data?.platforms ?? [];

  return (
    <Link
      href="/platforms"
      title="Sức khoẻ nền tảng — bấm để xem chi tiết"
      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 transition-colors hover:bg-accent"
    >
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Nền tảng
      </span>
      <div className="flex items-center gap-1.5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <HealthDot key={i} loading />
            ))
          : platforms.map((p) => (
              <HealthDot
                key={p.key}
                status={p.status}
              />
            ))}
      </div>
    </Link>
  );
}
