"use client";

// ---------------------------------------------------------------------------
// "Giới thiệu hệ thống" — mục trong Trung tâm điều hành.
//   (1) MÔ TẢ / SƠ ĐỒ hệ thống (FE tĩnh, theme tối card).
//   (2) BÁO CÁO DỮ LIỆU TRỰC TUYẾN (số thật, react-query refetch).
//   (3) ĐỀ XUẤT CẢI TIẾN do AI/OpenClaw tạo (chỉ gợi ý, không tự thực thi).
// ---------------------------------------------------------------------------

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  BadgeDollarSign,
  Bot,
  Flame,
  Layers,
  Lightbulb,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { getManagerSystemReport, managerGenerateImprovements } from "@/lib/api";
import type {
  ManagerImprovement,
  ManagerSystemReport,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

// ===========================================================================
// PHẦN 1 — SƠ ĐỒ HỆ THỐNG (nội dung tĩnh theo bản v2)
// ===========================================================================
type Stage = {
  no: number;
  phase: string;
  title: string;
  cards: string[];
};

const STAGES: Stage[] = [
  {
    no: 1,
    phase: "ĐẦU VÀO",
    title: "Nguồn khách",
    cards: [
      "Quảng cáo đa kênh FB / Zalo / Google / TikTok",
      "Website Portal",
      "Nhập đa nguồn Sheet / CSV / Hotline",
    ],
  },
  {
    no: 2,
    phase: "LÀM SẠCH",
    title: "Lead Hub",
    cards: [
      "Chuẩn hóa & khử trùng theo SĐT / Zalo ID",
      "Làm giàu dữ liệu UTM / chiến dịch",
      "Lọc rác & số ảo",
    ],
  },
  {
    no: 3,
    phase: "TIẾP XÚC",
    title: "Tư vấn 24/7",
    cards: [
      "Chatbot AI Dify (RAG)",
      "Bảng hàng & phiếu giá",
      "Phản hồi < 5 phút",
      "Guardrail AI — chỉ trả lời trong tri thức đã duyệt; câu hỏi pháp lý / chiết khấu đặc biệt → chuyển người",
    ],
  },
  {
    no: 4,
    phase: "PHÂN LOẠI",
    title: "CRM AI",
    cards: [
      "Chấm điểm Nóng / Ấm / Lạnh",
      "Gợi ý next-best-action",
      "Tự phân bổ sale qua n8n",
      'Tiêu chí "nóng" rõ ràng',
    ],
  },
  {
    no: 5,
    phase: "CHĂM SÓC",
    title: "Sale ảo + Tự động",
    cards: [
      "Đội Sale ảo CrewAI",
      "Đa kênh Chatwoot",
      "Tổng đài Stringee",
      "Kênh chính thức ZNS / Meta + rate-limit tránh khóa OA",
      "Tái kích hoạt lead lạnh",
    ],
  },
  {
    no: 6,
    phase: "CHỐT DEAL",
    title: "Người thật",
    cards: [
      "Live Match → Google Meet",
      "Báo giá & đàm phán",
      "Giao dịch & hoa hồng 5 bậc",
      "Bàn giao kèm ngữ cảnh + SLA < 15 phút",
    ],
  },
  {
    no: 7,
    phase: "SAU BÁN",
    title: "Giữ chân & Referral",
    cards: [
      "Nhắc tiến độ thanh toán",
      "Cập nhật tiến độ dự án qua ZNS",
      "Xin referral",
    ],
  },
  {
    no: 8,
    phase: "ĐIỀU HÀNH",
    title: "Quản trị",
    cards: [
      "Admin Command Center",
      "OpenClaw qua Telegram + MCP (phân quyền / log / xác nhận 2 bước)",
      "AI Marketing Pipeline",
      "Giám sát hạ tầng",
    ],
  },
];

const PLATFORMS = [
  "Agent Engine",
  "Dify",
  "CrewAI",
  "n8n",
  "Chatwoot",
  "Stringee",
  "OpenClaw",
  "Web / Admin",
];

const KPIS = [
  "Phễu chuyển đổi",
  "Chi phí / lead · / deal",
  "Sức khỏe AI",
  "SLA người thật",
  "A/B kịch bản sale ảo",
  "Referral rate",
];

function DiagramSection() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-100 sm:p-6">
      {/* Mục tiêu */}
      <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-amber-300 sm:text-base">
          AI &amp; Tự động hóa gánh ~90% công việc · Người lo 10% chốt deal &amp; quan hệ VIP
        </p>
      </div>

      {/* Luồng 8 chặng */}
      <div className="space-y-2">
        {STAGES.map((s, i) => (
          <div key={s.no}>
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-900">
                  {s.no}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-amber-400">
                  {s.phase}
                </span>
                <span className="text-sm font-semibold text-slate-100">— {s.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-8">
                {s.cards.map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-slate-600 bg-slate-700/50 px-2 py-1 text-xs text-slate-200"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div className="flex justify-center py-0.5 text-slate-500">
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Nền tảng */}
      <div className="mt-5 rounded-lg border border-slate-700 bg-slate-800/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-400">
          <Layers className="h-4 w-4" /> Nền tảng
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <span
              key={p}
              className="rounded-md border border-sky-600/50 bg-sky-600/15 px-2 py-1 text-xs text-sky-200"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-400">
          <Activity className="h-4 w-4" /> Khối KPI điều hành
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KPIS.map((k) => (
            <span
              key={k}
              className="rounded-md border border-emerald-600/50 bg-emerald-600/15 px-2 py-1 text-xs text-emerald-200"
            >
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// PHẦN 2 — BÁO CÁO DỮ LIỆU TRỰC TUYẾN (số thật)
// ===========================================================================
const DASH = "—";

function num(v: number | null | undefined): string {
  return v === null || v === undefined ? DASH : formatNumber(v);
}

function MiniKpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportSection({ report }: { report: ManagerSystemReport }) {
  const { leads, funnel, finance, ai_care, ai_sales, marketing } = report;

  return (
    <div className="space-y-4">
      {/* KPI lead + tài chính */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi
          icon={<Users className="h-5 w-5" />}
          label="Tổng lead"
          value={leads.available ? num(leads.total) : DASH}
          sub={leads.available ? `Chuyển đổi ${leads.conversion_rate ?? 0}%` : "Chưa có dữ liệu"}
        />
        <MiniKpi
          icon={<Flame className="h-5 w-5" />}
          label="Nóng / Ấm / Lạnh"
          value={
            leads.available
              ? `${num(leads.hot)} / ${num(leads.warm)} / ${num(leads.cold)}`
              : DASH
          }
          sub="Phân bố theo nhiệt"
        />
        <MiniKpi
          icon={<TrendingUp className="h-5 w-5" />}
          label="Doanh thu kỳ"
          value={finance.available ? num(finance.revenue) : DASH}
          sub={finance.available ? finance.period_label : "Chưa có dữ liệu"}
        />
        <MiniKpi
          icon={<BadgeDollarSign className="h-5 w-5" />}
          label="Hoa hồng đã ghi"
          value={finance.commission ? num(finance.commission.total_amount) : DASH}
          sub={finance.commission ? `${finance.commission.deals} giao dịch` : undefined}
        />
      </div>

      {/* Phễu chuyển đổi (số thật) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Phễu chuyển đổi (số thật)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {funnel.map((stage) => (
              <div
                key={stage.key}
                className="rounded-lg border border-border bg-muted/30 p-3 text-center"
              >
                <p className="text-xs text-muted-foreground">{stage.label}</p>
                <p className="text-xl font-semibold text-foreground">{num(stage.count)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Chặng chưa có dữ liệu hiển thị {DASH} (vd quỹ căn đang ở chế độ dữ liệu mẫu).
          </p>
        </CardContent>
      </Card>

      {/* AI care + AI sales + marketing */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi
          icon={<Bot className="h-5 w-5" />}
          label="Nháp chăm sóc chờ duyệt"
          value={ai_care.available ? num(ai_care.pending) : DASH}
          sub={ai_care.available ? `Tổng ${num(ai_care.total)} mục` : "Chưa có dữ liệu"}
        />
        <MiniKpi
          icon={<Users className="h-5 w-5" />}
          label="Sale AI hoạt động"
          value={ai_sales.available ? num(ai_sales.active) : DASH}
          sub={ai_sales.available ? `Tổng ${num(ai_sales.total)}` : "Chưa có dữ liệu"}
        />
        <MiniKpi
          icon={<Activity className="h-5 w-5" />}
          label="Tải đội Sale AI"
          value={
            ai_sales.available && ai_sales.load_ratio !== undefined
              ? `${Math.round((ai_sales.load_ratio ?? 0) * 100)}%`
              : DASH
          }
          sub={
            ai_sales.available
              ? `${num(ai_sales.total_assigned)}/${num(ai_sales.total_capacity)} sức chứa`
              : undefined
          }
        />
        <MiniKpi
          icon={<BadgeDollarSign className="h-5 w-5" />}
          label="Chi phí / lead (TB)"
          value={marketing.available ? num(marketing.avg_cpl) : DASH}
          sub={marketing.available ? `Chi tiêu ${num(marketing.total_spent)}` : "Chưa có dữ liệu"}
        />
      </div>

      {/* CPL theo kênh */}
      {marketing.available && (marketing.by_channel?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Chi phí / lead theo kênh</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {marketing.by_channel!.map((c) => (
              <div
                key={c.channel}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-foreground">{c.channel}</span>
                <span className="text-muted-foreground">
                  {num(c.leads)} lead · CPL {num(c.cpl)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sức khỏe nền tảng */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-primary" /> Sức khỏe nền tảng
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {report.platforms.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{p.name}</span>
              <Badge variant={p.status === "up" ? "success" : "muted"}>
                {p.status === "up" ? "Hoạt động" : "Không phản hồi"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// PHẦN 3 — ĐỀ XUẤT CẢI TIẾN (AI / OpenClaw)
// ===========================================================================
function severityBadge(sev?: string) {
  if (sev === "high") return <Badge variant="danger">Ưu tiên cao</Badge>;
  if (sev === "medium") return <Badge variant="warning">Trung bình</Badge>;
  return <Badge variant="muted">Thấp</Badge>;
}

function ImprovementCard({ imp }: { imp: ManagerImprovement }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{imp.title}</p>
        {severityBadge(imp.severity)}
      </div>
      {imp.detail && <p className="text-sm text-muted-foreground">{imp.detail}</p>}
      {imp.suggested_action && (
        <p className="mt-1.5 text-sm">
          <span className="font-medium text-primary">Đề xuất: </span>
          <span className="text-foreground">{imp.suggested_action}</span>
        </p>
      )}
    </div>
  );
}

function ImprovementsSection() {
  const mut = useMutation({
    mutationFn: () => managerGenerateImprovements(),
  });

  const result = mut.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4 text-primary" /> Đề xuất cải tiến (do AI / OpenClaw tạo)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            <Sparkles className="h-4 w-4" />
            {mut.isPending ? "Đang phân tích…" : "Tạo đề xuất cải tiến"}
          </Button>
          {result && (
            <Badge variant={result.generated_by === "ai" ? "success" : "muted"}>
              {result.generated_by === "ai"
                ? "Do AI tạo"
                : "Phân tích tự động (chưa bật AI)"}
            </Badge>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Đề xuất chỉ là gợi ý cho người điều hành — hệ thống KHÔNG tự thực thi bất kỳ hành động nào.
        </p>

        {mut.isError && (
          <p className="text-sm text-danger">
            Lỗi tạo đề xuất: {(mut.error as Error)?.message}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            {result.improvements.map((imp, i) => (
              <ImprovementCard key={i} imp={imp} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Bố cục mục "Giới thiệu hệ thống"
// ===========================================================================
export default function SystemIntro() {
  const report = useQuery({
    queryKey: ["manager-system-report"],
    queryFn: getManagerSystemReport,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* (1) Mô tả / sơ đồ */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Mô tả &amp; sơ đồ hệ thống</h2>
        </div>
        <DiagramSection />
      </section>

      {/* (2) Báo cáo dữ liệu trực tuyến */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Báo cáo dữ liệu trực tuyến (số thật)</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => report.refetch()}
            disabled={report.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${report.isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>
        {report.isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải báo cáo…</p>
        ) : report.isError ? (
          <p className="text-sm text-danger">
            Không tải được báo cáo: {(report.error as Error)?.message}
          </p>
        ) : report.data ? (
          <ReportSection report={report.data} />
        ) : null}
      </section>

      {/* (3) Đề xuất cải tiến */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Đề xuất cải tiến cho người điều hành</h2>
        </div>
        <ImprovementsSection />
      </section>
    </div>
  );
}
