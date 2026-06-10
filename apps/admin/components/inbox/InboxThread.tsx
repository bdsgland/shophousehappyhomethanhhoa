"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import type { InboxConversation, InboxMessage } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { channelLabel } from "./channels";

export function InboxThread({
  conversation,
  messages,
  canReply,
  replyDisabledReason,
  sending,
  onSend,
}: {
  conversation: InboxConversation;
  messages: InboxMessage[];
  canReply: boolean;
  replyDisabledReason?: string;
  sending: boolean;
  onSend: (content: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">
            {conversation.contact?.name || "Khách"}
          </span>
          <Badge variant="muted">{channelLabel(conversation.channel)}</Badge>
          {conversation.is_hot && <Badge variant="danger">HOT</Badge>}
        </div>
        {conversation.assignee && (
          <span className="text-xs text-muted-foreground">
            Phụ trách: {conversation.assignee}
          </span>
        )}
      </div>

      <div className="flex min-h-[280px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Hội thoại chưa có tin nhắn.
          </p>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-1",
                  isUser ? "items-start" : "items-end",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    isUser
                      ? "bg-muted text-foreground"
                      : "bg-primary/10 text-foreground",
                  )}
                >
                  {m.content}
                </div>
                <span className="px-1 text-xs text-muted-foreground">
                  {!isUser && m.sender ? `${m.sender} · ` : ""}
                  {m.at ? shortDate(m.at) : ""}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-3">
        {canReply ? (
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Nhập trả lời… (Ctrl/⌘ + Enter để gửi)"
              className="min-h-[60px] flex-1"
            />
            <Button onClick={submit} disabled={sending || !draft.trim()}>
              <Send className="h-4 w-4" />
              {sending ? "Đang gửi…" : "Gửi"}
            </Button>
          </div>
        ) : (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {replyDisabledReason ??
              "Hội thoại này chưa hỗ trợ trả lời từ đây."}
          </p>
        )}
      </div>
    </div>
  );
}
