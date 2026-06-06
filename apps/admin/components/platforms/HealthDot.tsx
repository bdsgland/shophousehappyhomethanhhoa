import { cn } from "@/lib/utils";
import type { PlatformStatus } from "@/lib/types";

export function HealthDot({
  status,
  loading,
  className,
}: {
  status?: PlatformStatus;
  loading?: boolean;
  className?: string;
}) {
  const color = loading
    ? "bg-muted-foreground/40 animate-pulse"
    : status === "up"
      ? "bg-success"
      : status === "down"
        ? "bg-danger"
        : "bg-muted-foreground/40";

  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full", color, className)}
      aria-label={status === "up" ? "hoạt động" : status === "down" ? "lỗi" : "đang kiểm tra"}
    />
  );
}
