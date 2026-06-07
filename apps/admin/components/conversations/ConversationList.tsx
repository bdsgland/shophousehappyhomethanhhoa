"use client";

import type { ConversationSummary } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  open: "Đang mở",
  resolved: "Đã xử lý",
};

function statusBadge(status: string) {
  if (status === "resolved") {
    return <Badge variant="success">Đã xử lý</Badge>;
  }
  if (status === "open") {
    return <Badge variant="warning">Đang mở</Badge>;
  }
  return <Badge variant="muted">{STATUS_LABEL[status] ?? status}</Badge>;
}

export function ConversationList({
  items,
  onSelect,
  selectedId,
}: {
  items: ConversationSummary[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((c) => (
        <li key={c.id}>
          <button
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors",
              selectedId === c.id ? "bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">Khách web</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {shortDate(c.updated_at)}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {c.last_message || "—"}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {statusBadge(c.status)}
              {c.is_hot && <Badge variant="danger">HOT</Badge>}
              <Badge variant="muted">Điểm {c.intent_score}</Badge>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
