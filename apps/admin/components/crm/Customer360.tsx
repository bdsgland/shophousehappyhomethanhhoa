"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Edit3,
  FileText,
  GitBranch,
  Inbox,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  StickyNote,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { addCareLog, getProfile360 } from "@/lib/api";
import type {
  CareLogInput,
  ChannelInteraction,
  CrmCareChannel,
  Profile360,
  TimelineItem,
} from "@/lib/types";
import { shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const SOURCE_LABEL: Record<string, string> = {
  imported: "Danh bạ",
  registered: "Tự đăng ký",
  referral: "Giới thiệu",
  fb_ads: "FB Ads",
  zalo: "Zalo",
  email: "Email",
  manual: "Nhập tay",
  google_sheet: "Google Sheet",
  file_upload: "Tải file",
};

const STATUS_LABEL: Record<string, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
  customer: "Khách hàng",
  lost: "Đã mất",
};

const TIER_LABEL: Record<string, string> = { cold: "Lạnh", warm: "Ấm", hot: "Nóng" };
const TIER_VARIANT: Record<string, "default" | "warning" | "danger"> = {
  cold: "default",
  warm: "warning",
  hot: "danger",
};

function dt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN");
}

/** Thời gian tương đối kiểu mạng xã hội ("2 giờ trước"). */
function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

/** Tên người đăng (nếu có) — nằm trong ref cho mục contact/update (care feed). */
function actorName(item: TimelineItem): string | null {
  const n = (item.ref as { actor_name?: unknown } | undefined)?.actor_name;
  return typeof n === "string" && n.trim() ? n : null;
}

/** Kênh chọn khi đăng hoạt động chăm sóc (care feed). */
const CARE_CHANNELS: { value: CrmCareChannel; label: string }[] = [
  { value: "call", label: "Gọi điện" },
  { value: "zalo", label: "Zalo" },
  { value: "sms", label: "SMS" },
  { value: "facebook", label: "Facebook" },
  { value: "email", label: "Email" },
  { value: "inperson", label: "Gặp mặt" },
  { value: "note", label: "Ghi chú" },
];

const CARE_OUTCOMES: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "interested", label: "Quan tâm" },
  { value: "callback", label: "Hẹn gọi lại" },
  { value: "no_answer", label: "Không nghe máy" },
  { value: "not_interested", label: "Không quan tâm" },
  { value: "booked", label: "Đã đặt lịch" },
];

function money(v: unknown): string {
  return typeof v === "number" ? `${v.toLocaleString("vi-VN")} đ` : "—";
}

/** Icon + màu cho 1 mục dòng thời gian theo type/channel. */
function timelineIcon(item: TimelineItem): { Icon: LucideIcon; color: string } {
  if (item.type === "ai") return { Icon: Sparkles, color: "text-warning" };
  if (item.type === "stage") return { Icon: GitBranch, color: "text-primary" };
  if (item.type === "booking") return { Icon: Calendar, color: "text-success" };
  if (item.type === "quote") return { Icon: FileText, color: "text-primary" };
  if (item.type === "update") return { Icon: Edit3, color: "text-primary" };
  if (item.type === "note") return { Icon: StickyNote, color: "text-muted-foreground" };
  if (item.type === "created") return { Icon: UserPlus, color: "text-muted-foreground" };
  switch (item.channel) {
    case "call":
      return { Icon: Phone, color: "text-success" };
    case "sms":
      return { Icon: MessageSquare, color: "text-primary" };
    case "zalo":
      return { Icon: MessageCircle, color: "text-sky-500" };
    case "facebook":
      return { Icon: Share2, color: "text-blue-500" };
    case "email":
      return { Icon: Mail, color: "text-primary" };
    case "inperson":
      return { Icon: MapPin, color: "text-warning" };
    case "chatwoot":
      return { Icon: MessageCircle, color: "text-emerald-600" };
    default:
      return { Icon: Clock, color: "text-muted-foreground" };
  }
}

/**
 * Ô "soạn hoạt động chăm sóc" (care feed) đặt đầu dòng thời gian. Chọn kênh +
 * nội dung + kết quả → POST /crm/leads/{id}/care → prepend item trả về NGAY.
 */
function CareComposer({
  leadId,
  onPosted,
}: {
  leadId: string;
  onPosted: (item: TimelineItem) => void;
}) {
  const [channel, setChannel] = useState<CrmCareChannel>("call");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () => {
      const body: CareLogInput = { channel, note: note.trim(), outcome: outcome || null };
      return addCareLog(leadId, body);
    },
    onSuccess: (res) => {
      onPosted(res.item);
      setNote("");
      setOutcome("");
    },
  });

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap gap-2">
        <Select
          value={channel}
          onChange={(e) => setChannel(e.target.value as CrmCareChannel)}
          className="h-9 w-auto"
        >
          {CARE_CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="h-9 w-auto"
        >
          {CARE_OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label === "—" ? "Kết quả…" : o.label}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi lại nội dung chăm sóc khách…"
      />
      {mut.isError && (
        <p className="mt-1 text-xs text-danger">{(mut.error as Error)?.message}</p>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !note.trim()}>
          <Send className="h-4 w-4" />
          {mut.isPending ? "Đang đăng…" : "Đăng"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Hồ sơ 360° 1 khách: header + khối AI + dòng thời gian đa nguồn + kênh đã
 * tương tác + giao dịch. Lấy dữ liệu qua /crm/leads/{id}/profile-360; nút "Chấm
 * điểm lại bằng AI" gọi lại với rescore=true rồi cập nhật cache.
 */
export function Customer360({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const profileQ = useQuery({
    queryKey: ["crm-360", leadId],
    queryFn: () => getProfile360(leadId),
  });

  /** Prepend 1 mục care mới đăng vào timeline cache (hiện ngay đầu feed). */
  function prependTimeline(item: TimelineItem) {
    qc.setQueryData<Profile360>(["crm-360", leadId], (old) =>
      old ? { ...old, timeline: [item, ...(old.timeline ?? [])] } : old,
    );
    qc.invalidateQueries({ queryKey: ["crm-lead", leadId] });
  }

  const rescoreMut = useMutation({
    mutationFn: () => getProfile360(leadId, true),
    onSuccess: (res) => {
      qc.setQueryData(["crm-360", leadId], res);
      qc.invalidateQueries({ queryKey: ["ai-insight", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
  });

  if (profileQ.isLoading) return <Skeleton className="h-96 w-full" />;
  if (profileQ.isError || !profileQ.data) {
    return (
      <Card className="p-5">
        <p className="text-sm text-danger">
          Không tải được hồ sơ 360°: {(profileQ.error as Error)?.message}
        </p>
      </Card>
    );
  }

  // Guard mọi field: backend có thể trả 200 nhưng thiếu khối → tránh throw làm trắng trang.
  const p: Profile360 = profileQ.data;
  const basic = p.basic ?? ({} as Profile360["basic"]);
  const ai = p.ai ?? ({ score: 0 } as Profile360["ai"]);
  const pipeline =
    p.pipeline ?? ({ stage: "", label: "—", rank: 0, stages: [] } as Profile360["pipeline"]);
  const timeline = p.timeline ?? [];
  const channels = p.channels ?? [];
  const bookings = p.deals?.bookings ?? [];
  const quotes = p.deals?.quotes ?? [];
  const tierKey = (ai.tier ?? "").toString().toLowerCase();
  const nba = ai.next_action;

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-bold">{basic.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <a href={`tel:${basic.phone}`} className="inline-flex items-center gap-1 text-primary">
                <Phone className="h-3.5 w-3.5" />
                {basic.phone}
              </a>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {basic.email ?? "—"}
              </span>
              <span>Nguồn: {SOURCE_LABEL[basic.source ?? ""] ?? basic.source ?? "—"}</span>
              <span>Sale: {basic.assigned_sale_name ?? "Chưa phân bổ"}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="muted">{STATUS_LABEL[basic.status ?? ""] ?? basic.status}</Badge>
            <Badge variant="default" className="bg-primary/15">
              Giai đoạn: {pipeline.label}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Khối AI */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-warning" /> Phân tích AI
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rescoreMut.mutate()}
            disabled={rescoreMut.isPending}
          >
            <RefreshCw className={rescoreMut.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {rescoreMut.isPending ? "Đang chấm…" : "Chấm điểm lại bằng AI"}
          </Button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="leading-none">
              <span className="text-3xl font-bold text-primary">{ai.score ?? 0}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
            <Badge variant={TIER_VARIANT[tierKey] ?? "default"} className="text-xs">
              {TIER_LABEL[tierKey] ?? "Chưa xếp"}
            </Badge>
          </div>
          {ai.reason && <p className="text-sm text-muted-foreground">{ai.reason}</p>}
          {ai.best_time && (
            <div className="flex items-start gap-2 text-sm">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">Thời điểm liên hệ tốt nhất:</span> {ai.best_time}
              </span>
            </div>
          )}
          {(nba?.summary || nba?.suggested_action) && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Lightbulb className="h-4 w-4 text-warning" /> Gợi ý hành động (AI)
              </div>
              {nba?.summary && <p className="text-muted-foreground">{nba.summary}</p>}
              {nba?.suggested_action && <p className="mt-1 font-medium">{nba.suggested_action}</p>}
            </div>
          )}
          {ai.scored_at && (
            <p className="text-xs text-muted-foreground">Chấm lúc: {dt(ai.scored_at)}</p>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Dòng thời gian + tường hoạt động chăm sóc */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold">Dòng thời gian ({timeline.length})</h3>
          <CareComposer leadId={leadId} onPosted={prependTimeline} />
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có hoạt động nào.</p>
          ) : (
            <ol className="relative border-l border-border pl-6">
              {timeline.map((item, i) => {
                const { Icon, color } = timelineIcon(item);
                const who = actorName(item);
                return (
                  <li key={i} className="mb-5 last:mb-0">
                    <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card">
                      <Icon className={`h-3.5 w-3.5 ${color}`} />
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm">{item.summary}</span>
                      <span
                        className="shrink-0 text-xs text-muted-foreground"
                        title={dt(item.time)}
                      >
                        {relTime(item.time)}
                      </span>
                    </div>
                    {who && (
                      <p className="mt-0.5 text-xs text-muted-foreground">— {who}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="space-y-5">
          {/* Kênh đã tương tác */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Kênh đã tương tác</h3>
            <ul className="space-y-2 text-sm">
              {channels.map((c: ChannelInteraction) => {
                const isChatwoot = c.channel === "chatwoot";
                if (c.linked) {
                  return (
                    <li
                      key={c.channel}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-foreground">
                        {c.label}
                        {c.count > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {c.count} {isChatwoot ? "hội thoại" : "lần"}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {c.last_at ? shortDate(c.last_at) : "—"}
                        </span>
                        {isChatwoot && (
                          <Link
                            href="/inbox"
                            className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                          >
                            <Inbox className="h-3 w-3" /> Xem trong Hộp thư
                          </Link>
                        )}
                      </span>
                    </li>
                  );
                }
                return (
                  <li
                    key={c.channel}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="text-xs italic text-muted-foreground">
                      {isChatwoot ? "Chưa kết nối" : "Chưa tích hợp"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!channels.some((c) => c.channel === "chatwoot" && c.linked) && (
              <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                Chưa kết nối Chatwoot — cấu hình{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  CHATWOOT_API_TOKEN
                </code>{" "}
                trên server để đồng bộ hội thoại đa kênh (web/Facebook/Zalo/email)
                vào hồ sơ.
              </p>
            )}
          </Card>

          {/* Giao dịch */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">
              Giao dịch ({bookings.length + quotes.length})
            </h3>
            {bookings.length + quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có giao dịch.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bookings.map((b, i) => (
                  <li key={`bk-${i}`} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-success" />
                      Lịch xem {String(b.unit_summary ?? b.unit_id ?? "căn hộ")}
                    </span>
                    <Badge variant="muted" className="text-xs">
                      {String(b.status ?? "pending")}
                    </Badge>
                  </li>
                ))}
                {quotes.map((q, i) => (
                  <li key={`qt-${i}`} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      Báo giá {String(q.unit_id ?? "")}
                    </span>
                    <span className="text-xs text-muted-foreground">{money(q.total_price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
