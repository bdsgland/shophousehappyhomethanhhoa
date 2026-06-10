"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ApiError,
  getInboxMessages,
  listInboxConversations,
  replyInboxConversation,
} from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { InboxConversationList } from "@/components/inbox/InboxConversationList";
import { InboxThread } from "@/components/inbox/InboxThread";
import { InboxContactPanel } from "@/components/inbox/InboxContactPanel";
import { CHANNEL_FILTERS } from "@/components/inbox/channels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "open", label: "Đang mở" },
  { value: "resolved", label: "Đã xử lý" },
  { value: "all", label: "Tất cả" },
];

export default function InboxPage() {
  const qc = useQueryClient();
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["inbox", channel, status],
    queryFn: () => listInboxConversations(channel, status),
  });

  const messagesQuery = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => getInboxMessages(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const replyMut = useMutation({
    mutationFn: (content: string) =>
      replyInboxConversation(selectedId as string, content),
    onSuccess: () => {
      setBanner(null);
      messagesQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) =>
      setBanner(
        e instanceof ApiError ? e.message : "Gửi trả lời thất bại.",
      ),
  });

  const conversations = listQuery.data?.conversations ?? [];
  const chatwoot = listQuery.data?.chatwoot;

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Chỉ trả lời được hội thoại Chatwoot khi đã cấu hình token.
  const canReply =
    !!selected &&
    selected.source === "chatwoot" &&
    !!chatwoot?.configured;
  const replyDisabledReason =
    selected?.source === "web"
      ? "Hội thoại chat web nội bộ do bot xử lý — đấu kênh qua Chatwoot để trả lời người thật."
      : !chatwoot?.configured
        ? "Chưa cấu hình CHATWOOT_API_TOKEN — không thể gửi trả lời."
        : undefined;

  const isFetching = listQuery.isFetching || messagesQuery.isFetching;

  return (
    <div>
      <PageHeader
        title="Hộp thư đa kênh"
        description="Gộp hội thoại Chatwoot (web/Facebook/Zalo/email) và chat web nội bộ vào một màn hình."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              listQuery.refetch();
              if (selectedId) messagesQuery.refetch();
            }}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Làm mới
          </Button>
        }
      />

      {chatwoot && !chatwoot.configured && (
        <Card className="mb-4 border-warning/40 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(38,92%,38%)]" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Chưa cấu hình Chatwoot</p>
              <p className="text-muted-foreground">
                Đặt{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  CHATWOOT_API_TOKEN
                </code>
                ,{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  CHATWOOT_ACCOUNT_ID
                </code>{" "}
                và{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  CHATWOOT_BASE_URL
                </code>{" "}
                trên backend (Railway) để bật đồng bộ Chatwoot và trả lời đa kênh
                (Facebook/Zalo/email). Hội thoại chat web nội bộ vẫn hiển thị bên
                dưới.
              </p>
            </div>
          </div>
        </Card>
      )}

      {chatwoot?.configured && chatwoot.error && (
        <Card className="mb-4 border-danger/40 bg-danger/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <p className="text-sm text-muted-foreground">
              {chatwoot.detail ?? "Không gọi được Chatwoot."} Đang hiển thị hội
              thoại web nội bộ.
            </p>
          </div>
        </Card>
      )}

      {banner && (
        <Card className="mb-4 border-danger/40 bg-danger/5 p-3">
          <p className="text-sm text-danger">{banner}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr_minmax(0,300px)]">
        {/* Cột 1: danh sách + lọc kênh */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="h-8 flex-1 text-xs"
            >
              {CHANNEL_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 flex-1 text-xs"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Không có hội thoại phù hợp bộ lọc.
              </p>
            ) : (
              <InboxConversationList
                items={conversations}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setBanner(null);
                }}
              />
            )}
          </div>
        </Card>

        {/* Cột 2: khung tin nhắn + trả lời */}
        <Card className="overflow-hidden">
          {!selected ? (
            <p className="flex h-full min-h-[320px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              <span className="flex flex-col items-center gap-2">
                <Inbox className="h-8 w-8 opacity-40" />
                Chọn một hội thoại để xem chi tiết.
              </span>
            </p>
          ) : messagesQuery.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="ml-auto h-12 w-2/3" />
            </div>
          ) : (
            <InboxThread
              conversation={selected}
              messages={messagesQuery.data?.messages ?? []}
              canReply={canReply}
              replyDisabledReason={replyDisabledReason}
              sending={replyMut.isPending}
              onSend={(content) => replyMut.mutate(content)}
            />
          )}
        </Card>

        {/* Cột 3: thông tin khách + link 360 */}
        <Card className="overflow-hidden lg:block">
          {!selected ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">
              Thông tin khách hiện ở đây.
            </p>
          ) : (
            <InboxContactPanel conversation={selected} />
          )}
        </Card>
      </div>
    </div>
  );
}
