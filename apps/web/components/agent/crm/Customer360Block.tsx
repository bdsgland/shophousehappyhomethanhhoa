"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Calendar,
  Clock,
  FileText,
  Lightbulb,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  TrendingUp,
  User,
} from "@/components/dashboard/icons";
import {
  formatDate,
  formatDateTime,
  getProfile360,
  scoreColor,
  SOURCE_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  tierBadge,
  tierLabel,
  type ChannelInteraction,
  type LeadSource,
  type LeadStatus,
  type Profile360,
  type TimelineItem,
} from "@/lib/crm";

type IconCmp = (props: { size?: number; className?: string }) => JSX.Element;

function money(v: unknown): string {
  return typeof v === "number" ? `${v.toLocaleString("vi-VN")} đ` : "—";
}

/** Icon + màu cho 1 mục dòng thời gian theo type/channel. */
function timelineIcon(item: TimelineItem): { Icon: IconCmp; color: string } {
  if (item.type === "ai") return { Icon: Sparkles, color: "text-amber-500" };
  if (item.type === "stage") return { Icon: TrendingUp, color: "text-orange-500" };
  if (item.type === "booking") return { Icon: Calendar, color: "text-emerald-500" };
  if (item.type === "quote") return { Icon: FileText, color: "text-sky-500" };
  if (item.type === "note") return { Icon: FileText, color: "text-brand-400" };
  if (item.type === "created") return { Icon: User, color: "text-brand-400" };
  switch (item.channel) {
    case "call":
      return { Icon: Phone, color: "text-emerald-500" };
    case "sms":
    case "zalo":
      return { Icon: MessageCircle, color: "text-sky-500" };
    case "facebook":
      return { Icon: Share2, color: "text-blue-500" };
    case "email":
      return { Icon: Send, color: "text-sky-600" };
    case "inperson":
      return { Icon: MapPin, color: "text-amber-500" };
    default:
      return { Icon: Clock, color: "text-brand-400" };
  }
}

/**
 * Hồ sơ 360° (portal sale): header + AI + dòng thời gian đa nguồn + kênh đã
 * tương tác + giao dịch. Gọi /crm/leads/{id}/profile-360; nút chấm điểm lại
 * gọi với rescore=true.
 */
export function Customer360Block({
  token,
  leadId,
}: {
  token: string;
  leadId: string;
}) {
  const [p, setP] = useState<Profile360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);

  const load = useCallback(
    (rescore = false) => {
      return getProfile360(token, leadId, rescore)
        .then((d) => {
          setP(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    },
    [token, leadId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function rescore() {
    setRescoring(true);
    try {
      await load(true);
    } finally {
      setRescoring(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
        Không tải được hồ sơ 360°: {error}
      </p>
    );
  }
  if (!p) {
    return <div className="h-40 animate-pulse rounded-xl bg-brand-50" />;
  }

  const { basic, ai, pipeline, timeline, channels, deals } = p;
  const nba = ai.next_action;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-brand-100 p-4">
        <h3 className="text-base font-bold text-brand-900">{basic.name}</h3>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-brand-600">
          <span className="inline-flex items-center gap-1">
            <Phone size={13} /> {basic.phone}
          </span>
          <span>Email: {basic.email ?? "—"}</span>
          <span>
            Nguồn: {SOURCE_LABEL[(basic.source ?? "") as LeadSource] ?? basic.source ?? "—"}
          </span>
          <span>Sale: {basic.assigned_sale_name ?? "Chưa phân bổ"}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
              STATUS_BADGE[(basic.status ?? "cold") as LeadStatus]
            }`}
          >
            {STATUS_LABEL[(basic.status ?? "cold") as LeadStatus] ?? basic.status}
          </span>
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
            Giai đoạn: {pipeline.label}
          </span>
        </div>
      </div>

      {/* AI */}
      <div className="rounded-xl bg-brand-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-brand-700">
            <Sparkles size={16} className="text-amber-500" /> Phân tích AI
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-extrabold ${scoreColor(ai.score)}`}>{ai.score}</span>
            {ai.tier && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tierBadge(ai.tier)}`}
              >
                {tierLabel(ai.tier)}
              </span>
            )}
          </div>
        </div>
        {ai.reason && <p className="mt-2 text-sm text-brand-700">{ai.reason}</p>}
        {ai.best_time && (
          <div className="mt-2 flex items-start gap-1.5 text-sm text-brand-700">
            <Clock size={15} className="mt-0.5 shrink-0 text-brand-500" />
            <span>
              <b>Thời điểm liên hệ tốt nhất:</b> {ai.best_time}
            </span>
          </div>
        )}
        {(nba?.summary || nba?.suggested_action) && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-amber-700">
              <Lightbulb size={15} /> Gợi ý hành động (AI)
            </div>
            {nba?.summary && <p className="mt-0.5 text-brand-700">{nba.summary}</p>}
            {nba?.suggested_action && (
              <p className="mt-0.5 font-medium text-brand-900">{nba.suggested_action}</p>
            )}
          </div>
        )}
        <button
          onClick={rescore}
          disabled={rescoring}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:border-amber-300 hover:text-amber-600 disabled:opacity-60"
        >
          <RefreshCw size={15} className={rescoring ? "animate-spin" : ""} />
          {rescoring ? "Đang chấm…" : "Chấm điểm lại bằng AI"}
        </button>
      </div>

      {/* Dòng thời gian */}
      <div>
        <h4 className="text-sm font-bold text-brand-900">Dòng thời gian ({timeline.length})</h4>
        {timeline.length === 0 ? (
          <p className="mt-2 text-sm text-brand-400">Chưa có hoạt động nào.</p>
        ) : (
          <ol className="relative mt-3 border-l border-brand-100 pl-5">
            {timeline.map((item, i) => {
              const { Icon, color } = timelineIcon(item);
              return (
                <li key={i} className="mb-4 last:mb-0">
                  <span className="absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full border border-brand-100 bg-white">
                    <Icon size={12} className={color} />
                  </span>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-brand-700">{item.summary}</span>
                    <span className="shrink-0 text-xs text-brand-400">
                      {formatDateTime(item.time)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Kênh đã tương tác */}
      <div>
        <h4 className="text-sm font-bold text-brand-900">Kênh đã tương tác</h4>
        <ul className="mt-2 space-y-1.5 text-sm">
          {channels.map((c: ChannelInteraction) => (
            <li key={c.channel} className="flex items-center justify-between gap-2">
              <span className={c.linked ? "text-brand-700" : "text-brand-400"}>
                {c.label}
                {!c.linked && <span className="ml-1 text-xs italic">(sắp tích hợp)</span>}
              </span>
              <span className="text-xs text-brand-400">
                {c.linked ? (c.last_at ? formatDate(c.last_at) : "—") : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-brand-50 pt-2 text-xs text-brand-400">
          Chatwoot / Tổng đài: sắp tích hợp.
        </p>
      </div>

      {/* Giao dịch */}
      <div>
        <h4 className="text-sm font-bold text-brand-900">
          Giao dịch ({deals.bookings.length + deals.quotes.length})
        </h4>
        {deals.bookings.length + deals.quotes.length === 0 ? (
          <p className="mt-2 text-sm text-brand-400">Chưa có giao dịch.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {deals.bookings.map((b, i) => (
              <li key={`bk-${i}`} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-brand-700">
                  <Calendar size={14} className="text-emerald-500" />
                  Lịch xem {String(b.unit_summary ?? b.unit_id ?? "căn hộ")}
                </span>
                <span className="text-xs text-brand-500">{String(b.status ?? "pending")}</span>
              </li>
            ))}
            {deals.quotes.map((q, i) => (
              <li key={`qt-${i}`} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-brand-700">
                  <FileText size={14} className="text-sky-500" />
                  Báo giá {String(q.unit_id ?? "")}
                </span>
                <span className="text-xs text-brand-400">{money(q.total_price)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
