"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  PhoneCall,
  RefreshCw,
  Radio,
  UserCheck,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/kpi/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMatchHistory,
  getMatchPresence,
  getMatchStats,
  type MatchPresenceRow,
  type MatchRecord,
} from "@/lib/api";

const AVAIL: Record<
  string,
  { label: string; variant: "success" | "warning" | "muted" | "danger" }
> = {
  online: { label: "Sẵn sàng", variant: "success" },
  busy: { label: "Đang call", variant: "warning" },
  away: { label: "Offline", variant: "muted" },
  dnd: { label: "Không nhận", variant: "danger" },
};

const STATUS: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "danger" | "muted" }
> = {
  pending: { label: "Đang tìm", variant: "warning" },
  invited: { label: "Đã mời", variant: "warning" },
  accepted: { label: "Đã nhận", variant: "default" },
  live: { label: "Đang call", variant: "success" },
  completed: { label: "Hoàn tất", variant: "success" },
  declined: { label: "Không có sale", variant: "danger" },
  expired: { label: "Hết hạn", variant: "danger" },
  cancelled: { label: "Khách huỷ", variant: "muted" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export default function LiveMatchPage() {
  const statsQuery = useQuery({
    queryKey: ["match-stats"],
    queryFn: () => getMatchStats("today"),
    refetchInterval: 5_000,
  });
  const presenceQuery = useQuery({
    queryKey: ["match-presence"],
    queryFn: getMatchPresence,
    refetchInterval: 5_000,
  });
  const historyQuery = useQuery({
    queryKey: ["match-history"],
    queryFn: () => getMatchHistory(50),
    refetchInterval: 10_000,
  });

  const stats = statsQuery.data;
  const sales: MatchPresenceRow[] = presenceQuery.data?.sales ?? [];
  const history: MatchRecord[] = historyQuery.data ?? [];
  const liveNow = history.filter((m) => m.status === "live" || m.status === "invited");

  return (
    <div>
      <PageHeader
        title="Live Match"
        description="Theo dõi realtime việc ghép khách online với chuyên viên qua Google Meet."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              statsQuery.refetch();
              presenceQuery.refetch();
              historyQuery.refetch();
            }}
            disabled={statsQuery.isFetching}
          >
            <RefreshCw
              className={statsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Làm mới
          </Button>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sale sẵn sàng"
          value={stats?.online_sales ?? 0}
          icon={UserCheck}
          accent="success"
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Khách online"
          value={stats?.online_customers ?? 0}
          icon={Users}
          accent="primary"
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Đang trong call"
          value={stats?.active_calls ?? 0}
          icon={PhoneCall}
          accent="warning"
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Tỉ lệ chốt hôm nay"
          value={`${Math.round((stats?.conversion_rate ?? 0) * 100)}%`}
          icon={Activity}
          hint={`${stats?.completed ?? 0}/${stats?.total ?? 0} cuộc hoàn tất`}
          accent="primary"
          loading={statsQuery.isLoading}
        />
      </div>

      {/* Tổng hợp hôm nay */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          ["Tổng yêu cầu", stats?.total ?? 0],
          ["Đã nhận", stats?.accepted ?? 0],
          ["Đang call", stats?.live ?? 0],
          ["Hết hạn", stats?.expired ?? 0],
          ["Không có sale", stats?.declined ?? 0],
          ["Khách huỷ", stats?.cancelled ?? 0],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="rounded-lg border border-border bg-card p-3 text-center"
          >
            <div className="text-xl font-semibold">{value as number}</div>
            <div className="text-[11px] text-muted-foreground">{label as string}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Live feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-danger" /> Đang diễn ra & lịch sử
              </CardTitle>
            </CardHeader>
            <CardContent>
              {liveNow.length > 0 && (
                <div className="mb-4 space-y-2">
                  {liveNow.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                        </span>
                        <span className="text-sm font-medium">{m.customer_name}</span>
                        <span className="text-xs text-muted-foreground">
                          ↔ {m.sale_name ?? "…"}
                        </span>
                      </div>
                      <Badge variant={STATUS[m.status]?.variant ?? "muted"}>
                        {STATUS[m.status]?.label ?? m.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {history.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Chưa có yêu cầu match nào.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Khách</th>
                        <th className="py-2 font-medium">Chuyên viên</th>
                        <th className="py-2 font-medium">Trạng thái</th>
                        <th className="py-2 font-medium">Bắt đầu</th>
                        <th className="py-2 font-medium">Thời lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((m) => (
                        <tr key={m.id} className="border-b border-border/60">
                          <td className="py-2 font-medium">{m.customer_name}</td>
                          <td className="py-2 text-muted-foreground">
                            {m.sale_name ?? "—"}
                          </td>
                          <td className="py-2">
                            <Badge variant={STATUS[m.status]?.variant ?? "muted"}>
                              {STATUS[m.status]?.label ?? m.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {fmtTime(m.created_at)}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {fmtDuration(m.duration_seconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Presence panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Chuyên viên online</CardTitle>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Chưa có chuyên viên nào online.
                </div>
              ) : (
                <div className="space-y-2">
                  {sales.map((s) => {
                    const a = AVAIL[s.availability] ?? AVAIL.away;
                    return (
                      <div
                        key={s.sale_id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {s.sale_name?.slice(0, 2).toUpperCase() ?? "S"}
                          </span>
                          <div>
                            <div className="text-sm font-medium">{s.sale_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {s.active_calls} call đang xử lý
                            </div>
                          </div>
                        </div>
                        <Badge variant={a.variant}>{a.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
