"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gauge,
  Inbox,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  ThumbsUp,
  UserCheck,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  approveCareItem,
  getAiSalesStats,
  getCareQueueStats,
  getCrewStatus,
  listAiSalesmen,
  listCareQueue,
  listCrewAgents,
  runCareCycle,
  runCrewForLead,
  seedAiSales,
  skipCareItem,
} from "@/lib/api";
import type {
  AiSalesman,
  CareQueueItem,
  CrewAgentTemplate,
  CrewMode,
  CrewRunChannel,
  CrewRunResult,
  CrewStatus,
  MatchedUnit,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Nhãn tiếng Việt
// ---------------------------------------------------------------------------

const MODE_META: Record<
  CrewMode,
  { label: string; variant: "success" | "warning" | "muted"; hint: string }
> = {
  live: {
    label: "Live (LLM thật)",
    variant: "success",
    hint: "Đội sale chạy bằng CrewAI + Claude.",
  },
  fallback: {
    label: "Fallback (heuristic)",
    variant: "warning",
    hint: "Đang bật nhưng thiếu điều kiện LLM — dùng phân tích theo quy tắc.",
  },
  disabled: {
    label: "Đang tắt",
    variant: "muted",
    hint: "Tính năng đang tắt (CREW_ENABLED=false).",
  },
};

const CHANNELS: { value: CrewRunChannel; label: string }[] = [
  { value: "zalo", label: "Zalo" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "muted"> = {
  cao: "danger",
  "trung bình": "warning",
  thường: "muted",
};

const ENGINE_LABEL: Record<string, string> = {
  crewai: "CrewAI",
  "claude-direct": "Claude (trực tiếp)",
  heuristic: "Heuristic",
};

// Khối "BĐS phù hợp" — dùng lại cho panel crew + Customer 360.
function MatchedUnitsList({ units }: { units: MatchedUnit[] }) {
  if (!units || units.length === 0) return null;
  return (
    <div className="space-y-2">
      {units.map((u, i) => (
        <div key={u.id ?? i} className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{u.id}</span>
            {u.loai && <Badge variant="muted">{u.loai}</Badge>}
            {u.phan_khu && <span className="text-xs text-muted-foreground">{u.phan_khu}</span>}
            {u.gia && <Badge variant="default">{u.gia}</Badge>}
            {typeof u.match_percent === "number" && (
              <Badge variant="success">Khớp {u.match_percent}%</Badge>
            )}
            {u.trang_thai && <Badge variant="muted">{u.trang_thai}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {typeof u.dien_tich === "number" && <span>DT {u.dien_tich} m²</span>}
            {u.huong && <span>Hướng {u.huong}</span>}
            {u.reasons && u.reasons.length > 0 && <span>· {u.reasons.join(" · ")}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Trang chính
// ===========================================================================

export default function CrewPage() {
  const qc = useQueryClient();

  return (
    <div>
      <PageHeader
        title="Đội Sale AI"
        description="Đội sale ảo (CrewAI) phân tích lead và soạn tin nhắn NHÁP. Chỉ đề xuất — không tự gửi tin, không tự ghi CRM."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["crew-status"] });
              qc.invalidateQueries({ queryKey: ["crew-agents"] });
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        }
      />

      <div className="space-y-6">
        <RosterCard />
        <CareQueueCard />
        <StatusCard />
        <AgentsCard />
        <RunCard />
      </div>
    </div>
  );
}

// ===========================================================================
// Đội 1000 Sale AI — thống kê + khởi tạo + danh sách roster
// ===========================================================================

const SPECIALTY_VARIANT: Record<string, "default" | "warning" | "success"> = {
  lien_ke: "default",
  shophouse: "warning",
  can_ho: "success",
};

function StatBox({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RosterCard() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const statsQ = useQuery({ queryKey: ["ai-sales-stats"], queryFn: getAiSalesStats });
  const listQ = useQuery({
    queryKey: ["ai-sales-list", debounced, page],
    queryFn: () =>
      listAiSalesmen({ search: debounced || undefined, page, page_size: pageSize }),
  });

  const seedMut = useMutation({
    mutationFn: () => seedAiSales(1000),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-sales-stats"] });
      qc.invalidateQueries({ queryKey: ["ai-sales-list"] });
    },
  });

  const stats = statsQ.data;
  const isEmpty = !!stats && stats.total === 0;
  const list = listQ.data;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" />
              Đội 1000 Sale AI
            </CardTitle>
            <CardDescription>
              Đội sale AI tự động gán vào khách để chăm sóc. Gán là dữ liệu nội bộ; mọi tin ra khách
              vẫn chỉ là NHÁP cần duyệt.
            </CardDescription>
          </div>
          {isEmpty && (
            <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
              <Sparkles className={seedMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              {seedMut.isPending ? "Đang khởi tạo…" : "Khởi tạo 1000 Sale AI"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thẻ thống kê */}
        {statsQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : statsQ.isError || !stats ? (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Không tải được thống kê: {(statsQ.error as Error)?.message ?? "lỗi"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatBox icon={Users} label="Tổng Sale AI" value={stats.total.toLocaleString("vi-VN")} />
            <StatBox icon={UserCheck} label="Đang hoạt động" value={stats.active.toLocaleString("vi-VN")} />
            <StatBox
              icon={Bot}
              label="Tổng khách đã gán"
              value={stats.total_assigned.toLocaleString("vi-VN")}
              hint={`Còn chỗ: ${stats.capacity_left.toLocaleString("vi-VN")}`}
            />
            <StatBox icon={Gauge} label="Tải trung bình" value={`${stats.avg_load}`} hint="khách / sale AI" />
          </div>
        )}

        {/* Trạng thái roster trống */}
        {isEmpty && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Roster đang trống. Nhấn <span className="font-medium">"Khởi tạo 1000 Sale AI"</span> để tạo
            đội. Sau khi tạo, khách mới sẽ được tự động gán cho sale AI phù hợp (cân tải + khớp chuyên
            môn).
          </div>
        )}
        {seedMut.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi khởi tạo: {(seedMut.error as Error).message}
          </div>
        )}
        {seedMut.data && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Đã tạo {seedMut.data.created.toLocaleString("vi-VN")} sale AI (tổng{" "}
            {seedMut.data.total.toLocaleString("vi-VN")}).
          </div>
        )}

        {/* Phân bổ theo chuyên môn */}
        {stats && stats.total > 0 && (
          <div className="flex flex-wrap gap-2">
            {stats.by_specialty.map((s) => (
              <Badge key={s.key} variant={SPECIALTY_VARIANT[s.key] ?? "muted"}>
                {s.label}: {s.count.toLocaleString("vi-VN")} · gán {s.assigned.toLocaleString("vi-VN")}
              </Badge>
            ))}
          </div>
        )}

        {/* Danh sách roster (tìm kiếm + phân trang) */}
        {!isEmpty && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên / mã sale AI…"
                className="pl-8"
              />
            </div>

            {listQ.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : listQ.isError || !list ? (
              <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
                Không tải được danh sách: {(listQ.error as Error)?.message ?? "lỗi"}
              </div>
            ) : list.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Không có sale AI phù hợp.</p>
            ) : (
              <>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Sale AI</th>
                        <th className="px-3 py-2 font-medium">Chuyên môn</th>
                        <th className="px-3 py-2 text-right font-medium">Đang chăm</th>
                        <th className="px-3 py-2 text-center font-medium">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.items.map((s: AiSalesman) => (
                        <tr key={s.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.code}</div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={SPECIALTY_VARIANT[s.specialty] ?? "muted"}>
                              {s.specialty_label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.assigned_count}
                            <span className="text-muted-foreground"> / {s.capacity}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={s.status === "active" ? "success" : "muted"}>
                              {s.status === "active" ? "Hoạt động" : "Tạm dừng"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {list.total.toLocaleString("vi-VN")} sale AI · trang {list.page}/{totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Trước
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Sau
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Hàng đợi hành động — NHÁP chăm sóc tự động chờ duyệt + chạy chu kỳ
// ===========================================================================

const ACTION_TYPE_LABEL: Record<string, string> = {
  hot_follow_up: "Khách nóng",
  reengage: "Tái kết nối",
  first_touch: "Tiếp cận lần đầu",
  nurture: "Chăm sóc",
};

function CareQueueCard() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const statsQ = useQuery({ queryKey: ["care-queue-stats"], queryFn: getCareQueueStats });
  const listQ = useQuery({
    queryKey: ["care-queue", page],
    queryFn: () => listCareQueue({ status: "pending", page, page_size: pageSize }),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["care-queue"] });
    qc.invalidateQueries({ queryKey: ["care-queue-stats"] });
  }

  const runMut = useMutation({
    mutationFn: () => runCareCycle({ channel: "zalo" }),
    onSuccess: () => {
      setPage(1);
      refresh();
    },
  });

  const stats = statsQ.data;
  const list = listQ.data;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / pageSize)) : 1;
  const autoSend = stats?.config?.ai_care_auto_send ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              Hàng đợi hành động
            </CardTitle>
            <CardDescription>
              Đội Sale AI tự động quét khách cần chăm và soạn tin NHÁP. Duyệt rồi tự gửi — hệ thống
              KHÔNG tự gửi tin cho khách.
            </CardDescription>
          </div>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className={runMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {runMut.isPending ? "Đang chạy…" : "Chạy chu kỳ chăm sóc ngay"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thống kê nhanh + cấu hình an toàn */}
        {stats && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="warning">Chờ duyệt: {stats.pending}</Badge>
            <Badge variant="success">Đã duyệt: {stats.approved}</Badge>
            <Badge variant="muted">Bỏ qua: {stats.skipped}</Badge>
            <Badge variant={autoSend ? "danger" : "muted"}>
              {autoSend ? "Tự động gửi: BẬT" : "Tự động gửi: TẮT (an toàn)"}
            </Badge>
            {stats.config && (
              <span className="text-muted-foreground">
                Ngưỡng chăm: {stats.config.ai_care_due_days} ngày · mỗi lần tối đa{" "}
                {stats.config.ai_care_batch_limit} khách
              </span>
            )}
          </div>
        )}

        {runMut.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi chạy chu kỳ: {(runMut.error as Error).message}
          </div>
        )}
        {runMut.data && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Chu kỳ xong: quét {runMut.data.scanned_candidates} khách cần chăm · tạo{" "}
            {runMut.data.queued} nháp mới
            {runMut.data.errors.length > 0 && ` · ${runMut.data.errors.length} lỗi`}.
            {!runMut.data.enabled && " (Auto-Care đang TẮT — đặt AI_CARE_ENABLED=true để bật.)"}
          </div>
        )}

        {/* Danh sách NHÁP chờ duyệt */}
        {listQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : listQ.isError || !list ? (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Không tải được hàng đợi: {(listQ.error as Error)?.message ?? "lỗi"}
          </div>
        ) : list.items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Chưa có nháp nào chờ duyệt. Nhấn{" "}
            <span className="font-medium">"Chạy chu kỳ chăm sóc ngay"</span> để đội AI quét khách cần
            chăm và soạn tin.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {list.items.map((item) => (
                <CareQueueRow key={item.id} item={item} onChanged={refresh} />
              ))}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {list.total.toLocaleString("vi-VN")} nháp chờ duyệt · trang {list.page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CareQueueRow({ item, onChanged }: { item: CareQueueItem; onChanged: () => void }) {
  const [draft, setDraft] = useState(item.draft);
  const [copied, setCopied] = useState(false);

  const approveMut = useMutation({
    mutationFn: () => approveCareItem(item.id),
    onSuccess: onChanged,
  });
  const skipMut = useMutation({
    mutationFn: () => skipCareItem(item.id),
    onSuccess: onChanged,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard không khả dụng */
    }
  }

  const busy = approveMut.isPending || skipMut.isPending;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="default">{item.channel}</Badge>
        <Badge variant="muted">{ACTION_TYPE_LABEL[item.action_type] ?? item.action_type}</Badge>
        <span className="text-sm font-medium">{item.lead_name ?? item.lead_id}</span>
        {item.ai_salesman_name && (
          <span className="text-xs text-muted-foreground">· {item.ai_salesman_name}</span>
        )}
        {typeof item.potential_score === "number" && (
          <Badge variant="warning">Tiềm năng {item.potential_score}/100</Badge>
        )}
        {item.suggested_time && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {item.suggested_time}
          </span>
        )}
      </div>

      {item.summary && (
        <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
      )}

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[90px] text-sm"
      />

      {item.matched_units && item.matched_units.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.matched_units.map((u, i) => (
            <Badge key={i} variant="muted" className="gap-1">
              <Building2 className="h-3 w-3" />
              {u.id} · {u.gia ?? "—"}
              {typeof u.match_percent === "number" && ` · ${u.match_percent}%`}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => approveMut.mutate()} disabled={busy}>
          <ThumbsUp className="h-4 w-4" />
          Duyệt
        </Button>
        <Button variant="outline" size="sm" onClick={() => skipMut.mutate()} disabled={busy}>
          <XCircle className="h-4 w-4" />
          Bỏ qua
        </Button>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Đã chép" : "Chép tin"}
        </Button>
        {(approveMut.isError || skipMut.isError) && (
          <span className="text-xs text-danger">
            {((approveMut.error || skipMut.error) as Error)?.message}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Duyệt = đánh dấu đã xử lý. Hệ thống KHÔNG tự gửi — bạn tự gửi tin qua kênh chăm sóc.
      </p>
    </div>
  );
}

// ===========================================================================
// Thẻ trạng thái
// ===========================================================================

function ConditionRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function StatusCard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["crew-status"],
    queryFn: getCrewStatus,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trạng thái đội sale</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Không tải được trạng thái: {(error as Error)?.message ?? "lỗi không xác định"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const meta = MODE_META[(data.mode as CrewMode)] ?? MODE_META.disabled;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Trạng thái đội sale
            </CardTitle>
            <CardDescription>{meta.hint}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={data.enabled ? "success" : "muted"}>
              {data.enabled ? "Bật" : "Tắt"}
            </Badge>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Điều kiện kỹ thuật */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ConditionRow ok={data.crewai_installed} label="CrewAI đã cài" />
          <ConditionRow ok={data.anthropic_key_present} label="ANTHROPIC_API_KEY có" />
          <ConditionRow ok={!data.use_mock_llm} label="Không ở chế độ mock LLM" />
          <ConditionRow ok={data.dify_dataset_configured} label="Dify Knowledge Base đã cấu hình" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="muted">Model: {data.model || "—"}</Badge>
          <Badge variant="muted">Tối đa {data.max_agents} agent</Badge>
          <Badge variant="muted">{data.max_tokens} tokens</Badge>
          <Badge variant={data.will_use_llm ? "success" : "warning"}>
            {data.will_use_llm ? "Sẽ gọi LLM thật" : "Dùng heuristic"}
          </Badge>
        </div>

        {/* Ghi chú / lý do từ backend */}
        {data.notes.length > 0 && (
          <div className="space-y-1.5 rounded-md bg-muted/40 p-3">
            {data.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        )}

        {/* Hướng dẫn bật khi disabled — CHỈ TEXT, không tự đổi */}
        {data.mode === "disabled" && <EnableGuide status={data} />}
      </CardContent>
    </Card>
  );
}

function EnableGuide({ status }: { status: CrewStatus }) {
  return (
    <div className="rounded-md border border-dashed border-border p-3 text-sm">
      <p className="mb-2 font-medium">Cách bật đội sale AI</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>
          Đặt biến môi trường <code className="rounded bg-muted px-1">CREW_ENABLED=true</code> cho backend.
        </li>
        <li>
          Cài phụ thuộc:{" "}
          <code className="rounded bg-muted px-1">pip install -r requirements-crew.txt</code>.
        </li>
        {!status.anthropic_key_present && (
          <li>
            Cấu hình <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> để chạy LLM thật.
          </li>
        )}
        <li>Khởi động lại agent-engine và làm mới trang này.</li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        Khi chưa đủ điều kiện LLM, đội sale vẫn chạy ở chế độ heuristic (không gọi AI) và luôn trả về
        bản nháp cần admin duyệt.
      </p>
    </div>
  );
}

// ===========================================================================
// Danh sách agent
// ===========================================================================

function AgentsCard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["crew-agents"],
    queryFn: listCrewAgents,
  });

  const agents = data?.agents ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Các vai trò trong đội
        </CardTitle>
        <CardDescription>
          Đội gồm 3 agent phối hợp: tư vấn, chăm sóc và đề xuất bước chốt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Không tải được danh sách agent: {(error as Error)?.message}
          </div>
        ) : agents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chưa có agent nào.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {agents.map((a) => (
              <AgentCard key={a.key} agent={a} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent }: { agent: CrewAgentTemplate }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">{agent.name}</span>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{agent.role}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{agent.goal}</p>
    </div>
  );
}

// ===========================================================================
// Chạy thử cho 1 khách
// ===========================================================================

function RunCard() {
  const [leadId, setLeadId] = useState("");
  const [channel, setChannel] = useState<CrewRunChannel>("zalo");

  const runMut = useMutation({
    mutationFn: (id: string) => runCrewForLead(id, { channel }),
  });

  function submit() {
    const id = leadId.trim();
    if (!id) return;
    runMut.mutate(id);
  }

  const result = runMut.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Chạy thử cho 1 khách
        </CardTitle>
        <CardDescription>
          Nhập ID lead để đội sale phân tích và soạn tin NHÁP. Kết quả chỉ để tham khảo — không gửi
          tự động.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium">ID khách (lead)</label>
            <Input
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="VD: lead_abc123"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-sm font-medium">Kênh nháp</label>
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value as CrewRunChannel)}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={submit} disabled={runMut.isPending || !leadId.trim()}>
            <Play className={runMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {runMut.isPending ? "Đang chạy…" : "Chạy đội sale"}
          </Button>
        </div>

        {runMut.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi: {(runMut.error as Error).message}
          </div>
        )}

        {result && <RunResult result={result} />}
      </CardContent>
    </Card>
  );
}

function RunResult({ result }: { result: CrewRunResult }) {
  const meta = MODE_META[(result.mode as CrewMode)] ?? MODE_META.disabled;
  const analysis = result.analysis;

  // Crew tắt hoặc không có phân tích → chỉ hiển thị lý do.
  if (!result.ok || !analysis) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-4">
        <div className="flex items-center gap-2">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          {result.lead_name && <span className="text-sm font-medium">{result.lead_name}</span>}
        </div>
        {result.notes.length > 0 ? (
          result.notes.map((n, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {n}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Không có kết quả phân tích.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      {/* Header kết quả */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        <Badge variant="muted">Engine: {ENGINE_LABEL[analysis.engine] ?? analysis.engine}</Badge>
        {result.lead_name && <span className="text-sm font-medium">{result.lead_name}</span>}
        {typeof analysis.potential_score === "number" && (
          <Badge variant="warning">Tiềm năng {analysis.potential_score}/100</Badge>
        )}
        {typeof analysis.readiness === "number" && (
          <Badge variant="default">Sẵn sàng {analysis.readiness}/5</Badge>
        )}
        {result.knowledge?.configured && (
          <Badge variant="muted">Tri thức: {result.knowledge.records ?? 0} bản ghi</Badge>
        )}
      </div>

      {/* Banner an toàn */}
      {result.requires_confirmation && (
        <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-[hsl(38,92%,38%)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Cần xác nhận trước khi gửi. Đội sale KHÔNG tự gửi tin / không ghi CRM — hãy duyệt và tự
            thực hiện bằng công cụ chăm sóc khách.
          </span>
        </div>
      )}

      {/* Phân tích */}
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Phân tích tình hình
        </h3>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {analysis.summary}
        </p>
        {analysis.potential_reason && (
          <p className="mt-1 text-xs text-muted-foreground">
            Điểm tiềm năng: {analysis.potential_reason}
          </p>
        )}
      </section>

      {/* Hành động kế tiếp tốt nhất (next-best-action) */}
      {analysis.next_best_action && analysis.next_best_action.action && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" />
            Hành động kế tiếp tốt nhất
          </h3>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium">{analysis.next_best_action.action}</p>
            {analysis.next_best_action.reason && (
              <p className="mt-1 text-xs text-muted-foreground">
                {analysis.next_best_action.reason}
              </p>
            )}
            {analysis.next_best_action.timing && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> Thời điểm: {analysis.next_best_action.timing}
              </p>
            )}
          </div>
        </section>
      )}

      {/* BĐS phù hợp nhu cầu khách */}
      {((result.matched_units && result.matched_units.length > 0) ||
        (analysis.matched_units && analysis.matched_units.length > 0)) && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" />
            BĐS phù hợp
          </h3>
          <MatchedUnitsList units={result.matched_units ?? analysis.matched_units ?? []} />
        </section>
      )}

      {/* Đề xuất hành động (heuristic) */}
      {analysis.recommended_actions && analysis.recommended_actions.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            Đề xuất hành động
          </h3>
          <div className="space-y-2">
            {analysis.recommended_actions.map((a, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={PRIORITY_VARIANT[a.priority] ?? "muted"}>Ưu tiên {a.priority}</Badge>
                  <span className="text-sm font-medium">{a.action}</span>
                </div>
                <p className="text-xs text-muted-foreground">{a.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Output từng task (crewai live) */}
      {analysis.task_outputs && analysis.task_outputs.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            Kết quả từng vai trò
          </h3>
          <div className="space-y-2">
            {analysis.task_outputs.map((t, i) => (
              <div key={i} className="rounded-md border border-border bg-muted/30 p-3">
                <p className="whitespace-pre-line text-sm leading-relaxed">{t}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tin nhắn nháp */}
      {analysis.draft_messages && analysis.draft_messages.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" />
            Tin nhắn nháp
          </h3>
          <div className="space-y-3">
            {analysis.draft_messages.map((d, i) => (
              <DraftCard key={i} channel={d.channel} draft={d.draft} suggestedTime={d.suggested_time} />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Tạo lúc {new Date(result.generated_at).toLocaleString("vi-VN")} · auto_executed={" "}
        {String(result.auto_executed)}
      </p>
    </div>
  );
}

function DraftCard({
  channel,
  draft,
  suggestedTime,
}: {
  channel: string;
  draft: string;
  suggestedTime?: string;
}) {
  const [text, setText] = useState(draft);
  const [copied, setCopied] = useState(false);

  // Đồng bộ lại khi backend trả nháp mới.
  useEffect(() => {
    setText(draft);
  }, [draft]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard không khả dụng */
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="muted">{channel}</Badge>
          <Badge variant="warning">Nháp — chưa gửi</Badge>
          {suggestedTime && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> {suggestedTime}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Đã chép" : "Chép"}
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[120px] text-sm"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Bạn có thể sửa nội dung rồi tự gửi qua kênh chăm sóc khách. Trang này không gửi tin thật.
      </p>
    </div>
  );
}
