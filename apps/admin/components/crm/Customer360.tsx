"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Calendar,
  Check,
  Clock,
  Copy,
  Edit3,
  FileText,
  GitBranch,
  Inbox,
  Lightbulb,
  ListChecks,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  StickyNote,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { addCareLog, getProfile360, runAiCareForLead } from "@/lib/api";
import { CallButton, RecordingPlayer } from "./CallButton";
import type {
  AiCareResult,
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

/** Chuẩn hoá số điện thoại VN về dạng 84xxxxxxxxx (cho link Zalo). */
function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "84" + digits.slice(1);
  return digits;
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
    case "call_center":
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
/**
 * Khối "Chăm sóc bằng Sale AI": chạy phân tích qua sale AI phụ trách → hiện phân
 * tích + tin nhắn NHÁP. AN TOÀN: KHÔNG có nút gửi thật — chỉ chép để tự gửi.
 */
function AiCareCard({
  leadId,
  salesmanName,
}: {
  leadId: string;
  salesmanName: string | null;
}) {
  const careMut = useMutation({
    mutationFn: () => runAiCareForLead(leadId, { channel: "zalo" }),
  });
  const res: AiCareResult | undefined = careMut.data;
  const analysis = res?.analysis;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" /> Chăm sóc bằng Sale AI
        </h3>
        <Button size="sm" onClick={() => careMut.mutate()} disabled={careMut.isPending}>
          <Play className={careMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          {careMut.isPending ? "Đang chạy…" : "Chạy chăm sóc"}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Sale AI phụ trách: <span className="font-medium">{salesmanName ?? "sẽ tự gán khi chạy"}</span>.
        Kết quả là phân tích + tin nhắn NHÁP — không tự gửi cho khách.
      </p>

      {careMut.isError && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          Lỗi: {(careMut.error as Error).message}
        </div>
      )}

      {res && !analysis && (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          {res.notes?.length ? res.notes.join(" ") : "Không có kết quả phân tích."}
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* Banner an toàn */}
          <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-[hsl(38,92%,38%)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Cần xác nhận trước khi gửi. Sale AI KHÔNG tự gửi tin / không ghi CRM — hãy duyệt rồi tự
              gửi qua kênh chăm sóc.
            </span>
          </div>

          {/* Phân tích */}
          <div>
            <h4 className="mb-1 text-sm font-semibold">Phân tích</h4>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {analysis.summary}
            </p>
          </div>

          {/* Đề xuất hành động (heuristic) */}
          {analysis.recommended_actions && analysis.recommended_actions.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-primary" /> Đề xuất hành động
              </h4>
              <div className="space-y-2">
                {analysis.recommended_actions.map((a, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="muted">Ưu tiên {a.priority}</Badge>
                      <span className="text-sm font-medium">{a.action}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tin nhắn NHÁP */}
          {analysis.draft_messages && analysis.draft_messages.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" /> Tin nhắn nháp
              </h4>
              <div className="space-y-3">
                {analysis.draft_messages.map((d, i) => (
                  <AiDraftCard key={i} channel={d.channel} draft={d.draft} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Ô tin nhắn nháp (đọc/sửa + chép) — KHÔNG có nút gửi thật. */
function AiDraftCard({ channel, draft }: { channel: string; draft: string }) {
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
        Bạn có thể sửa nội dung rồi tự gửi qua kênh chăm sóc. Trang này không gửi tin thật.
      </p>
    </div>
  );
}

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
  const zaloPhone = normalizePhone(basic.phone);
  const quickBtn =
    "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted";

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
              <span className="inline-flex items-center gap-1">
                <Bot className="h-3.5 w-3.5 text-primary" />
                AI Sale phụ trách: {p.ai_salesman?.name ?? "Chưa gán"}
                {p.ai_salesman?.specialty_label ? ` (${p.ai_salesman.specialty_label})` : ""}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="muted">{STATUS_LABEL[basic.status ?? ""] ?? basic.status}</Badge>
              <Badge variant="default" className="bg-primary/15">
                Giai đoạn: {pipeline.label}
              </Badge>
            </div>
            <CallButton
              leadId={leadId}
              phone={basic.phone}
              onEnded={() => qc.invalidateQueries({ queryKey: ["crm-360", leadId] })}
            />
            {/* Liên hệ nhanh đa kênh — luôn hiện (kể cả chưa có lịch sử) */}
            <div className="flex flex-wrap justify-end gap-1.5">
              {basic.phone && (
                <a
                  href={`https://zalo.me/${zaloPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={quickBtn}
                  title="Nhắn Zalo"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-sky-500" /> Zalo
                </a>
              )}
              {basic.phone && (
                <a href={`sms:${basic.phone}`} className={quickBtn} title="Gửi SMS">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" /> SMS
                </a>
              )}
              {basic.email && (
                <a href={`mailto:${basic.email}`} className={quickBtn} title="Gửi email">
                  <Mail className="h-3.5 w-3.5 text-primary" /> Email
                </a>
              )}
              <Link href="/inbox" className={quickBtn} title="Mở Hộp thư">
                <Inbox className="h-3.5 w-3.5" /> Hộp thư
              </Link>
            </div>
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

      {/* Chăm sóc bằng Sale AI — phân tích + tin NHÁP (không gửi thật) */}
      <AiCareCard leadId={leadId} salesmanName={p.ai_salesman?.name ?? null} />

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
                const recId = (item.ref as { recording_url?: unknown; id?: unknown })
                  ?.recording_url
                  ? String((item.ref as { id?: unknown })?.id ?? "")
                  : "";
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
                    {recId && <RecordingPlayer logId={recId} />}
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
