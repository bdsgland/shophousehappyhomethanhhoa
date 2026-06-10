"use client";

import type { InboxConversation } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { channelLabel } from "./channels";

function statusBadge(status: string) {
  if (status === "resolved") return <Badge variant="success">Đã xử lý</Badge>;
  if (status === "open") return <Badge variant="warning">Đang mở</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

export function InboxConversationList({
  items,
  selectedId,
  onSelect,
}: {
  items: InboxConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
              <span className="truncate text-sm font-medium">
                {c.contact?.name || "Khách"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.last_at ? shortDate(c.last_at) : "—"}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {c.last_message || "—"}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="muted">{channelLabel(c.channel)}</Badge>
              {statusBadge(c.status)}
              {c.crm_lead_id && <Badge variant="success">Khách CRM</Badge>}
              {c.is_hot && <Badge variant="danger">HOT</Badge>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
