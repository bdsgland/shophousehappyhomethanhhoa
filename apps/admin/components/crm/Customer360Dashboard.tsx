"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Gauge,
  Handshake,
  Lightbulb,
  ListChecks,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  Share2,
  ShieldAlert,
  Sparkles,
  Target,
  UserCog,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  getLeadConversations,
  getProfile360,
  runAiCareForLead,
} from "@/lib/api";
import type {
  AiCareResult,
  CrmLead,
  LeadConversationMessage,
  Profile360,
} from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/* ------------------------------------------------------------------ */
/* Bảng nhãn + tiện ích                                                */
/* ------------------------------------------------------------------ */

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

const PURPOSE_LABEL: Record<string, string> = {
  invest: "Đầu tư",
  live: "Để ở",
  rent: "Cho thuê",
};

function dt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN");
}

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

function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "84" + digits.slice(1);
  return digits;
}

/** Chữ cái đầu của tên cho avatar. */
function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Hội thoại đa kênh — phân loại actor + màu kênh                      */
/* ------------------------------------------------------------------ */

type Actor = "ai" | "staff" | "customer";

function actorOf(m: LeadConversationMessage): Actor {
  if (m.direction === "in") return "customer";
  const s = (m.sender ?? "").toLowerCase();
  if (s.includes("ai") || s.includes("bot") || s.includes("trợ lý") || s.includes("assistant"))
    return "ai";
  return "staff";
}

const ACTOR_LABEL: Record<Actor, string> = {
  ai: "AI",
  staff: "Nhân viên",
  customer: "Khách",
};

const CONV_CHANNEL_BADGE: Record<string, string> = {
  zalo: "bg-sky-500/15 text-sky-600",
  facebook: "bg-blue-500/15 text-blue-600",
  email: "bg-violet-500/15 text-violet-600",
  web: "bg-emerald-500/15 text-emerald-600",
  chatwoot: "bg-emerald-500/15 text-emerald-600",
  call: "bg-green-500/15 text-green-600",
  call_center: "bg-green-500/15 text-green-600",
  sms: "bg-amber-500/15 text-amber-600",
  whatsapp: "bg-green-500/15 text-green-600",
  telegram: "bg-sky-500/15 text-sky-600",
  inperson: "bg-orange-500/15 text-orange-600",
};

/* ------------------------------------------------------------------ */
/* Card nhỏ tái dùng                                                   */
/* ------------------------------------------------------------------ */

/** Tiêu đề khối có icon, dùng chung cho mọi card hồ sơ. */
function BlockTitle({
  icon: Icon,
  children,
  color = "text-emerald-600",
  right,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  color?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon className={cn("h-4 w-4", color)} /> {children}
      </h3>
      {right}
    </div>
  );
}

/* ================================================================== */
/* KPI                                                                 */
/* ================================================================== */

function KpiStrip({
  lead,
  profile,
}: {
  lead: CrmLead;
  profile: Profile360;
}) {
  const stats = profile.stats;
  const bookings = profile.deals?.bookings ?? [];
  const quotes = profile.deals?.quotes ?? [];

  // Giá trị giao dịch: cộng total_price các báo giá nếu backend trả; nếu không → "—".
  const dealValue = quotes.reduce<number | null>((acc, q) => {
    const v = (q as { total_price?: unknown }).total_price;
    if (typeof v === "number") return (acc ?? 0) + v;
    return acc;
  }, null);

  const items: {
    icon: LucideIcon;
    label: string;
    value: string;
    accent: string;
    real: boolean;
  }[] = [
    {
      icon: Gauge,
      label: "Điểm tiềm năng",
      value: `${profile.ai?.score ?? 0}/100`,
      accent: "text-emerald-600",
      real: true,
    },
    {
      icon: Wallet,
      label: "Ngân sách",
      value: lead.budget?.trim() ? lead.budget : "—",
      accent: "text-violet-600",
      real: !!lead.budget?.trim(),
    },
    {
      icon: Eye,
      label: "Lượt xem nhà / booking",
      value: String(stats?.booking_count ?? bookings.length ?? 0),
      accent: "text-sky-600",
      real: true,
    },
    {
      icon: MessageSquare,
      label: "Tương tác",
      value: String(stats?.contact_count ?? 0),
      accent: "text-amber-600",
      real: true,
    },
    {
      icon: Handshake,
      label: "Giá trị giao dịch",
      value:
        dealValue !== null
          ? `${dealValue.toLocaleString("vi-VN")} đ`
          : "—",
      accent: "text-rose-600",
      real: dealValue !== null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <it.icon className={cn("h-4 w-4", it.accent)} />
            <span className="truncate">{it.label}</span>
          </div>
          <div
            className={cn(
              "mt-1.5 text-xl font-bold",
              it.real ? "text-slate-800" : "text-slate-400",
            )}
          >
            {it.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Pipeline ngang                                                      */
/* ================================================================== */

function PipelineBar({ profile }: { profile: Profile360 }) {
  const pipeline = profile.pipeline;
  const stages =
    pipeline?.stages && pipeline.stages.length > 0
      ? pipeline.stages
      : [
          { key: "reach", label: "Tiếp cận", rank: 1 },
          { key: "consult", label: "Tư vấn", rank: 2 },
          { key: "viewing", label: "Xem nhà", rank: 3 },
          { key: "negotiation", label: "Đàm phán", rank: 4 },
          { key: "deposit", label: "Chốt cọc", rank: 5 },
        ];
  const currentRank = pipeline?.rank ?? 0;

  return (
    <Card className="p-5">
      <BlockTitle icon={Workflow} color="text-emerald-600">
        Pipeline bán hàng
      </BlockTitle>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {stages.map((s, i) => {
          const done = s.rank < currentRank;
          const active = s.rank === currentRank;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "flex min-w-[84px] flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-xs font-medium transition-colors",
                  active
                    ? "bg-emerald-500 text-white shadow-sm"
                    : done
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-50 text-slate-400",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                    active
                      ? "bg-white/25 text-white"
                      : done
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="leading-tight">{s.label}</span>
              </div>
              {i < stages.length - 1 && (
                <span
                  className={cn(
                    "h-0.5 w-3 shrink-0 rounded",
                    s.rank < currentRank ? "bg-emerald-400" : "bg-slate-200",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ================================================================== */
/* Panel Crew AI                                                       */
/* ================================================================== */

function CrewAiPanel({
  leadId,
  profile,
}: {
  leadId: string;
  profile: Profile360;
}) {
  const ai = profile.ai;
  const salesman = profile.ai_salesman;
  const nba = ai?.next_action;

  const careMut = useMutation({
    mutationFn: () => runAiCareForLead(leadId, { channel: "zalo" }),
  });
  const res: AiCareResult | undefined = careMut.data;
  const analysis = res?.analysis;

  // Trạng thái các agent suy ra từ dữ liệu thật sẵn có (chỉ mang tính chỉ báo —
  // chưa có endpoint crew-status riêng).
  const agents: { icon: LucideIcon; name: string; ok: boolean; note: string }[] = [
    {
      icon: Gauge,
      name: "Lead Scoring",
      ok: (ai?.score ?? 0) > 0,
      note: ai?.scored_at ? `Chấm ${relTime(ai.scored_at)}` : "Chưa chấm",
    },
    {
      icon: Sparkles,
      name: "Nurture",
      ok: !!salesman,
      note: salesman ? "Đang phụ trách" : "Chưa gán",
    },
    {
      icon: Target,
      name: "Matching",
      ok: !!profile.basic?.note || (profile.deals?.quotes?.length ?? 0) > 0,
      note: "Theo nhu cầu",
    },
    {
      icon: Calendar,
      name: "Scheduler",
      ok: (profile.stats?.booking_count ?? 0) > 0,
      note: `${profile.stats?.booking_count ?? 0} lịch`,
    },
  ];

  return (
    <Card className="border-violet-200 bg-violet-50/40 p-5">
      <BlockTitle
        icon={Bot}
        color="text-violet-600"
        right={
          <Button
            size="sm"
            className="bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => careMut.mutate()}
            disabled={careMut.isPending}
          >
            <Play className={careMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {careMut.isPending ? "Đang chạy…" : "Chạy chăm sóc"}
          </Button>
        }
      >
        Crew AI
      </BlockTitle>

      <p className="mb-3 text-xs text-slate-500">
        AI Sale phụ trách:{" "}
        <span className="font-medium text-violet-700">
          {salesman?.name ?? "Chưa gán"}
        </span>
        {salesman?.specialty_label ? ` · ${salesman.specialty_label}` : ""}. Kết quả
        chỉ là phân tích + tin NHÁP, không tự gửi cho khách.
      </p>

      {/* Trạng thái agent */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {agents.map((a) => (
          <div
            key={a.name}
            className="rounded-lg border border-violet-100 bg-white p-2.5"
          >
            <div className="flex items-center gap-1.5">
              <a.icon className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-xs font-medium text-slate-700">{a.name}</span>
              <span
                className={cn(
                  "ml-auto h-2 w-2 rounded-full",
                  a.ok ? "bg-emerald-500" : "bg-slate-300",
                )}
              />
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400">{a.note}</p>
          </div>
        ))}
      </div>

      {/* Hành động kế tiếp */}
      {(nba?.summary || nba?.suggested_action) && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-700">
            <Lightbulb className="h-4 w-4" /> Hành động kế tiếp
          </div>
          {nba?.summary && <p className="text-slate-600">{nba.summary}</p>}
          {nba?.suggested_action && (
            <p className="mt-1 font-medium text-slate-700">{nba.suggested_action}</p>
          )}
        </div>
      )}

      {/* Kết quả chạy chăm sóc (NHÁP) */}
      {careMut.isError && (
        <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-600">
          Lỗi: {(careMut.error as Error).message}
        </div>
      )}
      {res && !analysis && (
        <div className="mt-3 rounded-md border border-dashed border-violet-200 p-3 text-sm text-slate-500">
          {res.notes?.length ? res.notes.join(" ") : "Không có kết quả phân tích."}
        </div>
      )}
      {analysis && (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Cần xác nhận trước khi gửi. AI KHÔNG tự gửi tin — hãy duyệt rồi tự gửi
              qua kênh chăm sóc.
            </span>
          </div>
          {analysis.summary && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {analysis.summary}
            </p>
          )}
          {analysis.recommended_actions && analysis.recommended_actions.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <ListChecks className="h-4 w-4 text-violet-500" /> Đề xuất hành động
              </h4>
              <div className="space-y-2">
                {analysis.recommended_actions.map((a, i) => (
                  <div key={i} className="rounded-md border border-violet-100 bg-white p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="muted">Ưu tiên {a.priority}</Badge>
                      <span className="text-sm font-medium text-slate-700">{a.action}</span>
                    </div>
                    <p className="text-xs text-slate-500">{a.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.draft_messages && analysis.draft_messages.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageSquare className="h-4 w-4 text-violet-500" /> Tin nhắn nháp
              </h4>
              <div className="space-y-3">
                {analysis.draft_messages.map((d, i) => (
                  <DraftCard key={i} channel={d.channel} draft={d.draft} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Tin nhắn nháp (đọc/sửa + chép) — KHÔNG có nút gửi thật. */
function DraftCard({ channel, draft }: { channel: string; draft: string }) {
  const [text, setText] = useState(draft);
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(draft), [draft]);

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
    <div className="rounded-md border border-violet-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="muted">{channel}</Badge>
          <Badge variant="warning">Nháp — chưa gửi</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Đã chép" : "Chép"}
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[110px] text-sm"
      />
    </div>
  );
}

/* ================================================================== */
/* Dòng thời gian chăm sóc đa kênh                                     */
/* ================================================================== */

function MultiChannelTimeline({ leadId }: { leadId: string }) {
  const q = useQuery({
    queryKey: ["lead-conversations", leadId],
    queryFn: () => getLeadConversations(leadId),
  });
  const [actor, setActor] = useState<"all" | Actor>("all");
  const [channel, setChannel] = useState<string>("all");

  const messages = q.data?.messages ?? [];
  const channelOptions = useMemo(
    () => Array.from(new Set(messages.map((m) => m.channel))),
    [messages],
  );
  const filtered = useMemo(
    () =>
      messages.filter(
        (m) =>
          (actor === "all" || actorOf(m) === actor) &&
          (channel === "all" || m.channel === channel),
      ),
    [messages, actor, channel],
  );

  const cw = q.data?.chatwoot;

  return (
    <Card className="p-5">
      <BlockTitle
        icon={MessageCircle}
        color="text-emerald-600"
        right={
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Làm mới
          </Button>
        }
      >
        Dòng thời gian chăm sóc đa kênh{" "}
        {q.data ? (
          <span className="text-xs font-normal text-slate-400">({q.data.count})</span>
        ) : null}
      </BlockTitle>

      {/* Bộ lọc actor + kênh */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", "ai", "staff", "customer"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setActor(a)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              actor === a
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            )}
          >
            {a === "all" ? "Tất cả" : ACTOR_LABEL[a]}
          </button>
        ))}
        {channelOptions.length > 0 && (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
          >
            <option value="all">Mọi kênh</option>
            {channelOptions.map((c) => (
              <option key={c} value={c}>
                {messages.find((m) => m.channel === c)?.channel_label ?? c}
              </option>
            ))}
          </select>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="ml-auto h-12 w-2/3" />
          <Skeleton className="h-12 w-1/2" />
        </div>
      ) : q.isError ? (
        <p className="text-sm text-rose-600">
          Không tải được hội thoại: {(q.error as Error)?.message}
        </p>
      ) : (
        <div className="space-y-3">
          {(!cw?.configured || cw?.error) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-slate-500">
                {cw?.error
                  ? cw?.detail ?? "Không gọi được Chatwoot."
                  : "Chatwoot chưa kết nối — chưa đồng bộ hội thoại Zalo/Facebook/Email/Web."}{" "}
                Đang hiển thị lịch sử liên hệ nội bộ.
              </p>
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {messages.length === 0
                ? "Chưa có hội thoại nào cho khách này."
                : "Không có hội thoại khớp bộ lọc."}
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((m, i) => (
                <Bubble key={i} m={m} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Bubble({ m }: { m: LeadConversationMessage }) {
  const isOut = m.direction === "out";
  const badgeCls = CONV_CHANNEL_BADGE[m.channel] ?? "bg-slate-100 text-slate-500";
  const actor = actorOf(m);
  return (
    <li className={isOut ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            badgeCls,
          )}
        >
          {m.channel_label}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            actor === "ai"
              ? "bg-violet-100 text-violet-600"
              : actor === "staff"
                ? "bg-rose-100 text-rose-600"
                : "bg-slate-100 text-slate-500",
          )}
        >
          {ACTOR_LABEL[actor]}
        </span>
        {m.sender && <span className="text-[11px] text-slate-400">· {m.sender}</span>}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isOut
            ? actor === "ai"
              ? "bg-violet-50 text-slate-700"
              : "bg-emerald-50 text-slate-700"
            : "bg-slate-100 text-slate-700",
        )}
      >
        <p className="whitespace-pre-line break-words">{m.content || "—"}</p>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-[11px] text-slate-400" title={dt(m.time)}>
          {relTime(m.time)}
        </span>
        {m.web_url && (
          <a
            href={m.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Chatwoot
          </a>
        )}
      </div>
    </li>
  );
}

/* ================================================================== */
/* Right rail                                                          */
/* ================================================================== */

function RightRail({
  lead,
  profile,
}: {
  lead: CrmLead;
  profile: Profile360;
}) {
  const channels = profile.channels ?? [];
  const stats = profile.stats;
  const isHot = lead.status === "hot" || !!lead.hot_marker_at;

  // Nhu cầu khách hàng — các field mở rộng (đều tuỳ chọn).
  const needs: { label: string; value: string | null | undefined }[] = [
    { label: "Loại BĐS", value: lead.product_type },
    { label: "Khu vực", value: lead.region },
    { label: "Ngân sách", value: lead.budget },
    { label: "Mục đích", value: lead.purpose ? PURPOSE_LABEL[lead.purpose] ?? lead.purpose : null },
    { label: "Dự án quan tâm", value: lead.project },
    { label: "Nhóm khách", value: lead.customer_group },
  ].filter((n) => n.value && String(n.value).trim());

  // Hiệu quả AI
  const effRate =
    stats && stats.contact_count > 0
      ? Math.round((stats.effective_contact_count / stats.contact_count) * 100)
      : null;

  return (
    <div className="space-y-5">
      {/* Đồng bộ kênh */}
      <Card className="p-5">
        <BlockTitle icon={Share2} color="text-emerald-600">
          Đồng bộ kênh
        </BlockTitle>
        <ul className="space-y-2 text-sm">
          {channels.length === 0 ? (
            <li className="text-slate-400">Chưa có dữ liệu kênh.</li>
          ) : (
            channels.map((c) => (
              <li key={c.channel} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      c.linked ? "bg-emerald-500" : "bg-slate-300",
                    )}
                  />
                  <span className={c.linked ? "text-slate-700" : "text-slate-400"}>
                    {c.label}
                    {c.linked && c.count > 0 && (
                      <span className="ml-1 text-xs text-slate-400">· {c.count}</span>
                    )}
                  </span>
                </span>
                <span className="text-xs text-slate-400">
                  {c.linked ? (c.last_at ? shortDate(c.last_at) : "—") : "Chưa kết nối"}
                </span>
              </li>
            ))
          )}
        </ul>
      </Card>

      {/* Cần con người xử lý — chỉ hiện khi có cờ nóng */}
      {isHot && (
        <Card className="border-rose-200 bg-rose-50/50 p-5">
          <BlockTitle icon={Flame} color="text-rose-500">
            Cần con người xử lý
          </BlockTitle>
          <p className="text-sm text-slate-600">
            Khách đang ở trạng thái <span className="font-medium text-rose-600">nóng</span>
            {lead.hot_marker_at ? ` (đánh dấu ${shortDate(lead.hot_marker_at)})` : ""} — nên có
            sale trực tiếp gọi chốt thay vì để AI chăm tự động.
          </p>
        </Card>
      )}

      {/* Hiệu quả AI */}
      <Card className="p-5">
        <BlockTitle icon={Sparkles} color="text-violet-600">
          Hiệu quả AI
        </BlockTitle>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Lần liên hệ</dt>
            <dd className="font-semibold text-slate-700">{stats?.contact_count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Liên hệ hiệu quả</dt>
            <dd className="font-semibold text-slate-700">
              {stats?.effective_contact_count ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Tỷ lệ hiệu quả</dt>
            <dd className="font-semibold text-emerald-600">
              {effRate !== null ? `${effRate}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Lịch đã đặt</dt>
            <dd className="font-semibold text-slate-700">{stats?.booking_count ?? 0}</dd>
          </div>
        </dl>
      </Card>

      {/* Nhu cầu khách hàng */}
      <Card className="p-5">
        <BlockTitle icon={Target} color="text-emerald-600">
          Nhu cầu khách hàng
        </BlockTitle>
        {needs.length === 0 ? (
          <p className="text-sm text-slate-400">Chưa ghi nhận nhu cầu cụ thể.</p>
        ) : (
          <dl className="space-y-2 text-sm">
            {needs.map((n) => (
              <div key={n.label} className="flex justify-between gap-2">
                <dt className="text-slate-400">{n.label}</dt>
                <dd className="text-right font-medium text-slate-700">{n.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {/* BĐS phù hợp — backend chưa có endpoint matching → placeholder rõ ràng */}
      <Card className="border-dashed p-5">
        <BlockTitle icon={Building2} color="text-slate-400">
          BĐS phù hợp
        </BlockTitle>
        <p className="text-sm text-slate-400">
          Chưa có gợi ý căn tự động — cần endpoint matching theo nhu cầu (loại BĐS / ngân
          sách) ở backend. Khối sẽ hiển thị khi API sẵn sàng.
        </p>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* Header                                                              */
/* ================================================================== */

function ProfileHeader({
  lead,
  profile,
}: {
  lead: CrmLead;
  profile: Profile360;
}) {
  const basic = profile.basic ?? ({} as Profile360["basic"]);
  const ai = profile.ai;
  const salesman = profile.ai_salesman;
  const name = basic.name ?? lead.name;
  const isHot = (ai?.tier ?? "").toString().toLowerCase() === "hot" || lead.status === "hot";
  const zaloPhone = normalizePhone(basic.phone ?? lead.phone);
  const phone = basic.phone ?? lead.phone;
  const quickBtn =
    "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          {/* Avatar chữ cái */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">{name}</h2>
              {isHot && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600">
                  <Flame className="h-3 w-3" /> Khách nóng · {ai?.score ?? lead.ai_score}/100
                </span>
              )}
              <Badge variant="muted">{STATUS_LABEL[basic.status ?? lead.status] ?? lead.status}</Badge>
            </div>
            {/* Dòng meta */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>Mã KH: {lead.id.slice(0, 8)}</span>
              {lead.region && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {lead.region}
                </span>
              )}
              <span>
                Nguồn: {SOURCE_LABEL[basic.source ?? lead.source] ?? basic.source ?? lead.source}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserCog className="h-3 w-3" /> Sale:{" "}
                {basic.assigned_sale_name ?? lead.assigned_sale_name ?? "Chưa phân bổ"}
              </span>
              <span className="inline-flex items-center gap-1 text-violet-600">
                <Bot className="h-3 w-3" /> AI Sale: {salesman?.name ?? "Chưa gán"}
              </span>
            </div>
            {/* Liên hệ nhanh */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {phone && (
                <a href={`tel:${phone}`} className={quickBtn} title="Gọi">
                  <Phone className="h-3.5 w-3.5 text-emerald-600" /> {phone}
                </a>
              )}
              {phone && (
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
              {(basic.email ?? lead.email) && (
                <a href={`mailto:${basic.email ?? lead.email}`} className={quickBtn} title="Email">
                  <Mail className="h-3.5 w-3.5 text-violet-500" /> Email
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Khối hành động chăm sóc */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-violet-100 px-3 py-2 text-xs font-medium text-violet-700">
            <Bot className="h-3.5 w-3.5" /> AI đang chăm sóc tự động
          </span>
          <button
            type="button"
            title="Chuyển cho người phụ trách (cần xác nhận — chưa thực hiện ở bản này)"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-rose-500 px-3 py-2 text-xs font-medium text-white hover:bg-rose-600"
          >
            <UserCog className="h-3.5 w-3.5" /> Chuyển cho người
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* Component chính                                                     */
/* ================================================================== */

/**
 * Hồ sơ 360° (bản dashboard theo mẫu) cho 1 khách — dùng ở trang /customer-360.
 * Layout: header + KPI + pipeline + Crew AI + (timeline đa kênh | right rail).
 * Nhận sẵn `lead` (từ danh sách) để map nhu cầu/ngân sách; đồng thời gọi
 * profile-360 + conversations cho phần còn lại. Không tự gửi tin cho khách.
 */
export function Customer360Dashboard({ lead }: { lead: CrmLead }) {
  const qc = useQueryClient();
  const profileQ = useQuery({
    queryKey: ["crm-360", lead.id],
    queryFn: () => getProfile360(lead.id),
  });

  const rescoreMut = useMutation({
    mutationFn: () => getProfile360(lead.id, true),
    onSuccess: (res) => {
      qc.setQueryData(["crm-360", lead.id], res);
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
  });

  if (profileQ.isLoading) return <Skeleton className="h-[600px] w-full" />;
  if (profileQ.isError || !profileQ.data) {
    return (
      <Card className="p-5">
        <p className="text-sm text-rose-600">
          Không tải được hồ sơ 360°: {(profileQ.error as Error)?.message}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => profileQ.refetch()}>
          Thử lại
        </Button>
      </Card>
    );
  }

  const profile = profileQ.data;

  return (
    <div className="space-y-5">
      <ProfileHeader lead={lead} profile={profile} />
      <KpiStrip lead={lead} profile={profile} />
      <PipelineBar profile={profile} />
      <CrewAiPanel leadId={lead.id} profile={profile} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MultiChannelTimeline leadId={lead.id} />
        </div>
        <RightRail lead={lead} profile={profile} />
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => rescoreMut.mutate()}
          disabled={rescoreMut.isPending}
        >
          <RefreshCw className={rescoreMut.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {rescoreMut.isPending ? "Đang chấm lại…" : "Chấm điểm lại bằng AI"}
        </Button>
      </div>
    </div>
  );
}
