"use client";

import type { ConversationDetail } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MessageThread({ detail }: { detail: ConversationDetail }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">#{detail.id}</span>
          <Badge variant="muted">{detail.channel}</Badge>
          {detail.is_hot && <Badge variant="danger">HOT</Badge>}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => alert("Tính năng gán sale sẽ bổ sung")}
        >
          Take over (gán sale)
        </Button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4">
        {detail.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Hội thoại chưa có tin nhắn.
          </p>
        ) : (
          detail.messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-1",
                  isUser ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    isUser
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.content}
                </div>
                <span className="px-1 text-xs text-muted-foreground">
                  {shortDate(m.at)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
