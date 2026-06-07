"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";

import {
  getConversation,
  listChatwootConversations,
  listConversations,
} from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { ConversationList } from "@/components/conversations/ConversationList";
import { MessageThread } from "@/components/conversations/MessageThread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

type TabKey = "web" | "chatwoot";

const TABS: { key: TabKey; label: string }[] = [
  { key: "web", label: "Chatbot Web" },
  { key: "chatwoot", label: "Chatwoot" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Đang mở" },
  { value: "resolved", label: "Đã xử lý" },
  { value: "all", label: "Tất cả" },
];

function chatwootStatusBadge(status: string) {
  if (status === "resolved") return <Badge variant="success">Đã xử lý</Badge>;
  if (status === "open") return <Badge variant="warning">Đang mở</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

export default function ConversationsPage() {
  const [tab, setTab] = useState<TabKey>("web");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("open");

  const webQuery = useQuery({
    queryKey: ["web-convos"],
    queryFn: listConversations,
  });

  const detailQuery = useQuery({
    queryKey: ["web-convo", selectedId],
    queryFn: () => getConversation(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const chatwootQuery = useQuery({
    queryKey: ["chatwoot-convos", status],
    queryFn: () => listChatwootConversations(status),
  });

  const isFetching =
    tab === "web" ? webQuery.isFetching : chatwootQuery.isFetching;

  function refresh() {
    if (tab === "web") {
      webQuery.refetch();
      if (selectedId) detailQuery.refetch();
    } else {
      chatwootQuery.refetch();
    }
  }

  return (
    <div>
      <PageHeader
        title="Hội thoại"
        description="Lịch sử chatbot web và đồng bộ Chatwoot."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isFetching}
          >
            <RefreshCw
              className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Làm mới
          </Button>
        }
      />

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        className="mb-4"
      />

      {tab === "web" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <Card className="overflow-hidden">
            {webQuery.isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (webQuery.data?.conversations ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Chưa có hội thoại web nào. Khi khách chat qua widget, lịch sử sẽ
                hiện ở đây.
              </p>
            ) : (
              <ConversationList
                items={webQuery.data?.conversations ?? []}
                onSelect={setSelectedId}
                selectedId={selectedId}
              />
            )}
          </Card>

          <Card className="overflow-hidden">
            {!selectedId ? (
              <p className="px-4 py-16 text-center text-sm text-muted-foreground">
                Chọn một hội thoại để xem chi tiết.
              </p>
            ) : detailQuery.isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="ml-auto h-12 w-2/3" />
                <Skeleton className="h-12 w-3/4" />
              </div>
            ) : detailQuery.data ? (
              <MessageThread detail={detailQuery.data} />
            ) : (
              <p className="px-4 py-16 text-center text-sm text-muted-foreground">
                Không tải được hội thoại.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trạng thái</span>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-40"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {chatwootQuery.isLoading ? (
            <Card className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </Card>
          ) : chatwootQuery.data?.configured === false ? (
            <Card className="border-warning/40 bg-warning/5 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(38,92%,38%)]" />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">
                    Chưa cấu hình Chatwoot
                  </p>
                  {chatwootQuery.data?.detail && (
                    <p className="text-sm text-muted-foreground">
                      {chatwootQuery.data.detail}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Đặt{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      CHATWOOT_API_TOKEN
                    </code>{" "}
                    trên backend (Railway) để bật đồng bộ.
                  </p>
                </div>
              </div>
            </Card>
          ) : (chatwootQuery.data?.conversations ?? []).length === 0 ? (
            <Card>
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Không có hội thoại Chatwoot phù hợp.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Liên hệ</th>
                      <th className="px-4 py-3 font-medium">Kênh</th>
                      <th className="px-4 py-3 font-medium">Trạng thái</th>
                      <th className="px-4 py-3 font-medium">Tin nhắn cuối</th>
                      <th className="px-4 py-3 font-medium">Phụ trách</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(chatwootQuery.data?.conversations ?? []).map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 font-medium">{c.contact}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.channel}
                        </td>
                        <td className="px-4 py-3">
                          {chatwootStatusBadge(c.status)}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                          {c.last_message || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.assignee ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
