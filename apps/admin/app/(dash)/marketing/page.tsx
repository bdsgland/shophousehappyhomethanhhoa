"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Check,
  Copy,
  FileText,
  Film,
  Lightbulb,
  Megaphone,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  createCampaign,
  createPipeline,
  deleteCampaign,
  deleteMarketingContent,
  deletePipeline,
  editPipelineStage,
  generateMarketingContent,
  getMarketingOverview,
  listCampaigns,
  listIntegrations,
  listMarketingContent,
  listPipelines,
  publishPipeline,
  runPipelineAll,
  runPipelineStage,
  suggestCampaigns,
  updateCampaign,
  updateCampaignSpend,
} from "@/lib/api";
import type {
  CampaignChannel,
  CampaignCreatePayload,
  CampaignStatus,
  ContentGeneratePayload,
  MarketingCampaign,
  MarketingContentLength,
  MarketingContentType,
  MarketingPipeline,
  PipelineContentFormat,
  PipelineCreatePayload,
  PipelineLanguage,
  PipelineStage,
  PipelineStageState,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/kpi/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hằng số nhãn tiếng Việt
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  google: "Google Ads",
  email: "Email",
  tiktok: "TikTok",
  other: "Khác",
};

const CHANNELS = Object.keys(CHANNEL_LABEL) as CampaignChannel[];

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Nháp",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Kết thúc",
};

const STATUS_VARIANT: Record<CampaignStatus, "default" | "success" | "warning" | "muted"> = {
  draft: "muted",
  running: "success",
  paused: "warning",
  done: "default",
};

const CONTENT_TYPE_LABEL: Record<MarketingContentType, string> = {
  post: "Bài đăng",
  ad: "Quảng cáo",
  email: "Email",
  script: "Kịch bản video",
};

const LENGTH_LABEL: Record<MarketingContentLength, string> = {
  short: "Ngắn",
  medium: "Vừa",
  long: "Chi tiết",
};

const CHART_COLORS = [
  "hsl(33,49%,48%)",
  "hsl(152,60%,40%)",
  "hsl(214,60%,55%)",
  "hsl(280,45%,55%)",
  "hsl(20,80%,55%)",
  "hsl(190,55%,45%)",
];

function fmtVnd(n: number): string {
  if (!n) return "0 ₫";
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

type TabKey = "overview" | "campaigns" | "content" | "pipeline";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Tổng quan", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "campaigns", label: "Chiến dịch", icon: <Megaphone className="h-4 w-4" /> },
  { key: "content", label: "Sản xuất nội dung (AI)", icon: <Sparkles className="h-4 w-4" /> },
  { key: "pipeline", label: "Marketing Pipeline", icon: <Workflow className="h-4 w-4" /> },
];

// ===========================================================================
// Trang chính
// ===========================================================================

export default function MarketingPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("overview");

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["marketing-overview"] }),
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }),
      qc.invalidateQueries({ queryKey: ["marketing-content"] }),
      qc.invalidateQueries({ queryKey: ["marketing-pipelines"] }),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="AI Marketing"
        description="Quản trị quảng cáo, chiến dịch đa kênh và AI sản xuất nội dung."
        action={
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        }
      />

      <Tabs tabs={TABS} value={tab} onChange={(k) => setTab(k as TabKey)} className="mb-6" />

      {tab === "overview" && <OverviewTab />}
      {tab === "campaigns" && <CampaignsTab />}
      {tab === "content" && <ContentTab />}
      {tab === "pipeline" && <PipelineTab />}
    </div>
  );
}

// ===========================================================================
// Tab Tổng quan
// ===========================================================================

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-overview"],
    queryFn: getMarketingOverview,
  });

  const chartData = (data?.by_channel ?? []).map((c) => ({
    channel: CHANNEL_LABEL[c.channel],
    leads: c.leads,
    spent: c.spent,
  }));

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng chi tiêu"
          value={fmtVnd(data?.total_spent ?? 0)}
          icon={BarChart3}
          hint={`Ngân sách ${fmtVnd(data?.total_budget ?? 0)}`}
          accent="primary"
          loading={isLoading}
        />
        <StatCard
          label="Tổng lead"
          value={formatNumber(data?.total_leads ?? 0)}
          icon={Megaphone}
          hint={`${formatNumber(data?.total_customers ?? 0)} khách chuyển đổi`}
          accent="success"
          loading={isLoading}
        />
        <StatCard
          label="CPL trung bình"
          value={fmtVnd(data?.avg_cpl ?? 0)}
          icon={BarChart3}
          hint="Chi phí mỗi lead"
          accent="warning"
          loading={isLoading}
        />
        <StatCard
          label="ROI"
          value={data ? fmtPct(data.roi) : "—"}
          icon={Sparkles}
          hint={`Doanh thu ước tính ${fmtVnd(data?.est_revenue ?? 0)}`}
          accent={data && data.roi >= 0 ? "success" : "danger"}
          loading={isLoading}
        />
      </div>

      {(!data || data.est_revenue_per_customer === 0) && !isLoading && (
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          Mẹo: đặt biến môi trường <code>MARKETING_REVENUE_PER_CUSTOMER</code> để hệ thống
          tính doanh thu quy đổi & ROI theo mỗi khách chuyển đổi.
        </div>
      )}

      {/* Biểu đồ theo kênh */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead theo kênh</CardTitle>
            <CardDescription>Số lead gắn với chiến dịch theo từng kênh.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChannelBarChart data={chartData} dataKey="leads" label="lead" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chi phí theo kênh</CardTitle>
            <CardDescription>Tổng chi tiêu quảng cáo theo từng kênh.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChannelBarChart data={chartData} dataKey="spent" label="₫" money />
            )}
          </CardContent>
        </Card>
      </div>

      <SuggestionCard />
    </div>
  );
}

function ChannelBarChart({
  data,
  dataKey,
  label,
  money,
}: {
  data: { channel: string; leads: number; spent: number }[];
  dataKey: "leads" | "spent";
  label: string;
  money?: boolean;
}) {
  const hasData = data.some((d) => (d[dataKey] as number) > 0);
  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: money ? 0 : -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
          <XAxis dataKey="channel" tick={{ fontSize: 11 }} stroke="hsl(215,16%,60%)" />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            stroke="hsl(215,16%,60%)"
            width={money ? 70 : undefined}
            tickFormatter={(v) =>
              money ? new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(Number(v)) : String(v)
            }
          />
          <Tooltip
            formatter={(v) => [money ? fmtVnd(Number(v)) : `${v} ${label}`, money ? "Chi phí" : "Lead"]}
            contentStyle={{ borderRadius: 8, border: "1px solid hsl(214,20%,88%)", fontSize: 12 }}
          />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-card/80 px-3 py-1.5 text-sm text-muted-foreground">
            Chưa có dữ liệu
          </span>
        </div>
      )}
    </div>
  );
}

function SuggestionCard() {
  const mut = useMutation({ mutationFn: suggestCampaigns });
  const result = mut.data;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Gợi ý chiến dịch bằng AI
            </CardTitle>
            <CardDescription>
              Claude đề xuất ý tưởng chiến dịch dựa trên hiệu suất lead theo kênh.
            </CardDescription>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
            <Wand2 className={mut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {mut.isPending ? "Đang gợi ý…" : "Gợi ý"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {mut.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi: {(mut.error as Error).message}
          </div>
        )}
        {result && (
          <div className="space-y-3">
            {result.message && (
              <Badge variant="muted">{result.message}</Badge>
            )}
            {result.suggestions.map((s, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="default">{CHANNEL_LABEL[s.channel]}</Badge>
                </div>
                <p className="text-sm font-medium">{s.idea}</p>
                {s.rationale && (
                  <p className="mt-1 text-xs text-muted-foreground">{s.rationale}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {!result && !mut.isPending && !mut.isError && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Bấm “Gợi ý” để Claude đề xuất chiến dịch phù hợp.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Tab Chiến dịch
// ===========================================================================

type CampaignForm = {
  name: string;
  channel: CampaignChannel;
  objective: string;
  budget: string;
  spent: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  utm_source: string;
  notes: string;
};

const EMPTY_FORM: CampaignForm = {
  name: "",
  channel: "facebook",
  objective: "",
  budget: "",
  spent: "",
  start_date: "",
  end_date: "",
  status: "draft",
  utm_source: "",
  notes: "",
};

function CampaignsTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const overviewQ = useQuery({
    queryKey: ["marketing-overview"],
    queryFn: getMarketingOverview,
  });
  const campaignsQ = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: () => listCampaigns(),
  });

  const perfMap = new Map(
    (overviewQ.data?.campaigns ?? []).map((p) => [p.campaign_id, p]),
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(c: MarketingCampaign) {
    setEditing(c);
    setForm({
      name: c.name,
      channel: c.channel,
      objective: c.objective ?? "",
      budget: String(c.budget ?? ""),
      spent: String(c.spent ?? ""),
      start_date: c.start_date ?? "",
      end_date: c.end_date ?? "",
      status: c.status,
      utm_source: c.utm_source ?? "",
      notes: c.notes ?? "",
    });
    setError(null);
    setModalOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: CampaignCreatePayload = {
        name: form.name.trim(),
        channel: form.channel,
        objective: form.objective.trim() || undefined,
        budget: form.budget ? Number(form.budget) : 0,
        spent: form.spent ? Number(form.spent) : 0,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        status: form.status,
        utm_source: form.utm_source.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editing) return updateCampaign(editing.id, payload);
      return createCampaign(payload);
    },
    onSuccess: async () => {
      setModalOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }),
        qc.invalidateQueries({ queryKey: ["marketing-overview"] }),
      ]);
    },
    onError: (e) => setError((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }),
        qc.invalidateQueries({ queryKey: ["marketing-overview"] }),
      ]);
    },
  });

  const spendMut = useMutation({
    mutationFn: ({ id, add }: { id: string; add: number }) =>
      updateCampaignSpend(id, { add }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }),
        qc.invalidateQueries({ queryKey: ["marketing-overview"] }),
      ]);
    },
  });

  const rows = campaignsQ.data?.campaigns ?? [];

  function addSpend(c: MarketingCampaign) {
    const raw = window.prompt(`Cộng thêm chi tiêu cho "${c.name}" (₫):`, "0");
    if (raw === null) return;
    const add = Number(raw);
    if (Number.isNaN(add) || add <= 0) return;
    spendMut.mutate({ id: c.id, add });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tạo chiến dịch
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Chiến dịch</th>
                <th className="px-4 py-3 font-medium">Kênh</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-right">Chi tiêu</th>
                <th className="px-4 py-3 font-medium text-right">Lead</th>
                <th className="px-4 py-3 font-medium text-right">CPL</th>
                <th className="px-4 py-3 font-medium text-right">Chuyển đổi</th>
                <th className="px-4 py-3 font-medium text-right">ROI</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {campaignsQ.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={9}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={9}>
                    Chưa có chiến dịch nào. Bấm “Tạo chiến dịch” để bắt đầu.
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const perf = perfMap.get(c.id);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name}</div>
                        {c.utm_source && (
                          <div className="text-xs text-muted-foreground">utm: {c.utm_source}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{CHANNEL_LABEL[c.channel]}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{fmtVnd(c.spent)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(perf?.leads ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{fmtVnd(perf?.cpl ?? 0)}</td>
                      <td className="px-4 py-3 text-right">
                        {perf ? fmtPct(perf.conversion_rate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{perf ? fmtPct(perf.roi) : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Cộng chi tiêu" onClick={() => addSpend(c)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Sửa" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Xoá"
                            onClick={() => {
                              if (window.confirm(`Xoá chiến dịch "${c.name}"?`)) delMut.mutate(c.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader
          title={editing ? "Sửa chiến dịch" : "Tạo chiến dịch"}
          onClose={() => setModalOpen(false)}
        />
        <DialogBody>
          {error && (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}
          <Field label="Tên chiến dịch">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: ELC Q3 - Facebook Lead"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kênh">
              <Select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value as CampaignChannel })}
              >
                {CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNEL_LABEL[ch]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Trạng thái">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as CampaignStatus })}
              >
                {(Object.keys(STATUS_LABEL) as CampaignStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Mục tiêu">
            <Input
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              placeholder="VD: Thu lead, tăng nhận diện…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngân sách (₫)">
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </Field>
            <Field label="Đã chi (₫)">
              <Input
                type="number"
                value={form.spent}
                onChange={(e) => setForm({ ...form, spent: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày bắt đầu">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="Ngày kết thúc">
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="UTM source (gắn lead)">
            <Input
              value={form.utm_source}
              onChange={(e) => setForm({ ...form, utm_source: e.target.value })}
              placeholder="VD: fb_q3 — khớp với trường nguồn của lead"
            />
          </Field>
          <Field label="Ghi chú">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Huỷ
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name.trim()}>
            {saveMut.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

// ===========================================================================
// Tab Sản xuất nội dung (AI)
// ===========================================================================

type ContentForm = {
  content_type: MarketingContentType;
  channel: CampaignChannel;
  product: string;
  audience: string;
  tone: string;
  length: MarketingContentLength;
  variants: number;
};

const EMPTY_CONTENT_FORM: ContentForm = {
  content_type: "post",
  channel: "facebook",
  product: "",
  audience: "",
  tone: "",
  length: "medium",
  variants: 3,
};

function ContentTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContentForm>(EMPTY_CONTENT_FORM);

  const historyQ = useQuery({
    queryKey: ["marketing-content"],
    queryFn: () => listMarketingContent({ limit: 30 }),
  });

  const genMut = useMutation({
    mutationFn: () => {
      const payload: ContentGeneratePayload = {
        content_type: form.content_type,
        channel: form.channel,
        product: form.product.trim(),
        audience: form.audience.trim() || undefined,
        tone: form.tone.trim() || undefined,
        length: form.length,
        variants: form.variants,
      };
      return generateMarketingContent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-content"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteMarketingContent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-content"] }),
  });

  const result = genMut.data;
  const history = historyQ.data?.content ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Cột form + kết quả */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Tạo nội dung bằng AI
            </CardTitle>
            <CardDescription>
              Nhập brief, Claude sẽ sinh nội dung marketing tiếng Việt (nhiều biến thể).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Loại nội dung">
                <Select
                  value={form.content_type}
                  onChange={(e) =>
                    setForm({ ...form, content_type: e.target.value as MarketingContentType })
                  }
                >
                  {(Object.keys(CONTENT_TYPE_LABEL) as MarketingContentType[]).map((t) => (
                    <option key={t} value={t}>
                      {CONTENT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kênh">
                <Select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value as CampaignChannel })}
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABEL[ch]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Sản phẩm / dự án">
              <Textarea
                value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value })}
                placeholder="VD: Căn hộ Eurowindow Light City, view hồ, bàn giao 2026…"
              />
            </Field>
            <Field label="Đối tượng khách hàng">
              <Input
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder="VD: Gia đình trẻ 30-45 tuổi, đầu tư cho thuê…"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tông giọng">
                <Input
                  value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value })}
                  placeholder="VD: sang trọng"
                />
              </Field>
              <Field label="Độ dài">
                <Select
                  value={form.length}
                  onChange={(e) =>
                    setForm({ ...form, length: e.target.value as MarketingContentLength })
                  }
                >
                  {(Object.keys(LENGTH_LABEL) as MarketingContentLength[]).map((l) => (
                    <option key={l} value={l}>
                      {LENGTH_LABEL[l]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Số biến thể">
                <Select
                  value={String(form.variants)}
                  onChange={(e) => setForm({ ...form, variants: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending || !form.product.trim()}
              className="w-full"
            >
              <Sparkles className={genMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              {genMut.isPending ? "Đang tạo nội dung…" : "Tạo nội dung bằng AI"}
            </Button>

            {genMut.isError && (
              <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
                Lỗi: {(genMut.error as Error).message}
              </div>
            )}

            {result && (
              <div className="space-y-3 pt-2">
                {result.message && <Badge variant="muted">{result.message}</Badge>}
                {!result.message && (
                  <Badge variant="success">Tạo bởi AI Claude</Badge>
                )}
                {result.item.variants.map((v, i) => (
                  <VariantCard key={i} index={i} text={v} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cột lịch sử */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử nội dung</CardTitle>
            <CardDescription>Nội dung đã tạo gần đây.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Chưa có nội dung.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="default">{CONTENT_TYPE_LABEL[h.content_type]}</Badge>
                      <Badge variant="muted">{CHANNEL_LABEL[h.channel]}</Badge>
                      {!h.used_llm && <Badge variant="warning">mẫu</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Xoá"
                      onClick={() => delMut.mutate(h.id)}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{h.product}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {h.variants.length} biến thể
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VariantCard({ index, text }: { index: number; text: string }) {
  const [copied, setCopied] = useState(false);
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
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Biến thể {index + 1}</span>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Đã chép" : "Chép"}
        </Button>
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
    </div>
  );
}

// ===========================================================================
// Tab MARKETING PIPELINE — dây chuyền sản xuất content AI nhiều giai đoạn
// ===========================================================================

const FORMAT_LABEL: Record<PipelineContentFormat, string> = {
  toplist: "Toplist",
  pov: "POV",
  case_study: "Case Study",
  howto: "How-to",
  generic: "Tiêu chuẩn",
};

const LANGUAGE_LABEL: Record<PipelineLanguage, string> = {
  vi: "Tiếng Việt",
  en: "Tiếng Anh",
  bilingual: "Song ngữ Việt-Anh",
};

const AI_STAGE_ORDER: PipelineStage[] = ["research", "script", "content", "video_script"];

const STAGE_LABEL: Record<PipelineStage, string> = {
  research: "Research — Ý tưởng & Insight",
  script: "Kịch bản / Dàn ý",
  content: "Nội dung hoàn chỉnh",
  video_script: "Kịch bản video ngắn",
  publish: "Đăng kênh",
};

const STAGE_ICON: Record<PipelineStage, React.ReactNode> = {
  research: <Lightbulb className="h-4 w-4" />,
  script: <FileText className="h-4 w-4" />,
  content: <Sparkles className="h-4 w-4" />,
  video_script: <Film className="h-4 w-4" />,
  publish: <Send className="h-4 w-4" />,
};

const STAGE_STATUS: Record<
  PipelineStageState["status"],
  { label: string; variant: "default" | "success" | "warning" | "danger" | "muted" }
> = {
  pending: { label: "Chưa chạy", variant: "muted" },
  running: { label: "Đang chạy", variant: "warning" },
  done: { label: "Hoàn tất", variant: "success" },
  error: { label: "Lỗi", variant: "danger" },
};

// Map kênh marketing → key dịch vụ trong Trung tâm tích hợp (để báo đã kết nối).
function channelIntegrationKeys(channel: CampaignChannel): string[] {
  if (channel === "facebook") return ["facebook"];
  if (channel === "zalo") return ["zalo"];
  if (channel === "email") return ["email_google", "email_smtp"];
  return [];
}

interface PipelineForm {
  name: string;
  topic: string;
  project: string;
  audience: string;
  content_format: PipelineContentFormat;
  channel: CampaignChannel;
  tone: string;
  language: PipelineLanguage;
}

const EMPTY_PIPELINE_FORM: PipelineForm = {
  name: "",
  topic: "",
  project: "",
  audience: "",
  content_format: "generic",
  channel: "facebook",
  tone: "",
  language: "vi",
};

function PipelineTab() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["marketing-pipelines"],
    queryFn: () => listPipelines(),
  });

  const pipelines = listQ.data?.pipelines ?? [];
  const selected =
    pipelines.find((p) => p.id === selectedId) ?? pipelines[0] ?? null;

  const delMut = useMutation({
    mutationFn: (id: string) => deletePipeline(id),
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["marketing-pipelines"] });
    },
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Cột danh sách pipeline */}
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Tạo pipeline
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              Dây chuyền content
            </CardTitle>
            <CardDescription>
              Research → Kịch bản → Nội dung → Video → Đăng.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {listQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : pipelines.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Chưa có pipeline. Bấm “Tạo pipeline”.
              </p>
            ) : (
              pipelines.map((p) => {
                const isSel = selected?.id === p.id;
                const doneCount = AI_STAGE_ORDER.filter(
                  (st) => p.stages[st]?.status === "done",
                ).length;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={
                      "w-full rounded-md border p-3 text-left transition-colors " +
                      (isSel
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1 text-sm font-medium">{p.name}</span>
                      <Badge variant="muted">{CHANNEL_LABEL[p.channel]}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.topic}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="default">{FORMAT_LABEL[p.content_format]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {doneCount}/{AI_STAGE_ORDER.length} giai đoạn
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cột stepper giai đoạn */}
      <div className="space-y-4 lg:col-span-2">
        {selected ? (
          <PipelineStepper
            key={selected.id}
            pipeline={selected}
            onDelete={() => {
              if (window.confirm(`Xoá pipeline "${selected.name}"?`)) delMut.mutate(selected.id);
            }}
          />
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Chọn hoặc tạo một pipeline để bắt đầu dây chuyền sản xuất nội dung.
            </CardContent>
          </Card>
        )}
      </div>

      <CreatePipelineDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(p) => {
          setSelectedId(p.id);
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["marketing-pipelines"] });
        }}
      />
    </div>
  );
}

function PipelineStepper({
  pipeline,
  onDelete,
}: {
  pipeline: MarketingPipeline;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["marketing-pipelines"] });

  const runAllMut = useMutation({
    mutationFn: () => runPipelineAll(pipeline.id, {}),
    onSuccess: refresh,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{pipeline.name}</CardTitle>
            <CardDescription>
              {pipeline.topic}
              {pipeline.project ? ` · ${pipeline.project}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => runAllMut.mutate()}
              disabled={runAllMut.isPending}
              title="Chạy lần lượt Research → Video script (dừng trước Đăng)"
            >
              <Rocket className={runAllMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              {runAllMut.isPending ? "Đang chạy…" : "Chạy toàn bộ"}
            </Button>
            <Button variant="ghost" size="icon" title="Xoá pipeline" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="muted">{CHANNEL_LABEL[pipeline.channel]}</Badge>
          <Badge variant="default">{FORMAT_LABEL[pipeline.content_format]}</Badge>
          <Badge variant="muted">{LANGUAGE_LABEL[pipeline.language]}</Badge>
          {pipeline.tone && <Badge variant="muted">{pipeline.tone}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {runAllMut.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi: {(runAllMut.error as Error).message}
          </div>
        )}
        {AI_STAGE_ORDER.map((stage, idx) => (
          <StageCard
            key={stage}
            pipeline={pipeline}
            stage={stage}
            index={idx}
            prevDone={
              idx === 0 || pipeline.stages[AI_STAGE_ORDER[idx - 1]]?.status === "done"
            }
          />
        ))}
        <PublishCard pipeline={pipeline} />
      </CardContent>
    </Card>
  );
}

function StageCard({
  pipeline,
  stage,
  index,
  prevDone,
}: {
  pipeline: MarketingPipeline;
  stage: PipelineStage;
  index: number;
  prevDone: boolean;
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["marketing-pipelines"] });
  const st = pipeline.stages[stage];
  const serverOutput = st?.output ?? "";
  const [draft, setDraft] = useState<string>(serverOutput);
  const [dirty, setDirty] = useState(false);

  // Đồng bộ lại draft khi output từ server đổi (và người dùng chưa sửa dở).
  useEffect(() => {
    if (!dirty) setDraft(serverOutput);
  }, [serverOutput, dirty]);

  const runMut = useMutation({
    mutationFn: () => runPipelineStage(pipeline.id, stage),
    onSuccess: () => {
      setDirty(false);
      refresh();
    },
  });

  const saveMut = useMutation({
    mutationFn: () => editPipelineStage(pipeline.id, stage, draft),
    onSuccess: () => {
      setDirty(false);
      refresh();
    },
  });

  const status = st?.status ?? "pending";
  const meta = STAGE_STATUS[status];

  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {index + 1}
          </span>
          {STAGE_ICON[stage]}
          <span className="text-sm font-medium">{STAGE_LABEL[stage]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!st?.used_llm && status === "done" && <Badge variant="warning">mẫu</Badge>}
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
      </div>

      {!prevDone && status === "pending" && (
        <p className="mb-2 text-xs text-muted-foreground">
          Hoàn tất giai đoạn trước để có ngữ cảnh tốt hơn (vẫn có thể chạy ngay).
        </p>
      )}

      {st?.error && (
        <div className="mb-2 rounded-md bg-danger/10 p-2 text-xs text-danger">{st.error}</div>
      )}

      {(status === "done" || draft) && (
        <Textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          className="min-h-[120px] text-sm"
          placeholder="Output của giai đoạn sẽ hiển thị ở đây…"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={status === "done" ? "outline" : "default"}
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
        >
          <Play className={runMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          {runMut.isPending ? "Đang chạy…" : status === "done" ? "Chạy lại AI" : "Chạy AI"}
        </Button>
        {dirty && (
          <Button size="sm" variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Check className="h-4 w-4" />
            Lưu chỉnh sửa
          </Button>
        )}
        {st?.used_llm === false && status === "done" && (
          <span className="text-xs text-muted-foreground">Đang dùng mẫu (chưa bật AI).</span>
        )}
      </div>

      {runMut.isError && (
        <div className="mt-2 rounded-md bg-danger/10 p-2 text-xs text-danger">
          Lỗi: {(runMut.error as Error).message}
        </div>
      )}
    </div>
  );
}

function PublishCard({ pipeline }: { pipeline: MarketingPipeline }) {
  const qc = useQueryClient();
  const [channels, setChannels] = useState<CampaignChannel[]>([pipeline.channel]);
  const [emailTo, setEmailTo] = useState("");
  const [confirm, setConfirm] = useState(false);

  const integrationsQ = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  function isChannelConnected(ch: CampaignChannel): boolean {
    const keys = channelIntegrationKeys(ch);
    if (keys.length === 0) return false;
    const svcs = integrationsQ.data?.services ?? [];
    return keys.some((k) => svcs.find((s) => s.key === k)?.connected);
  }

  const publishMut = useMutation({
    mutationFn: () =>
      publishPipeline(pipeline.id, {
        channels,
        confirm: true,
        email_to: emailTo
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        subject: pipeline.name,
      }),
    onSuccess: () => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["marketing-pipelines"] });
    },
  });

  const st = pipeline.stages.publish;
  const contentReady = pipeline.stages.content?.status === "done";
  const results = st?.result?.results ?? [];

  function toggle(ch: CampaignChannel) {
    setChannels((cur) =>
      cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch],
    );
  }

  const PUBLISH_CHANNELS: CampaignChannel[] = ["facebook", "zalo", "email"];

  return (
    <div className="rounded-md border border-dashed border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            5
          </span>
          {STAGE_ICON.publish}
          <span className="text-sm font-medium">{STAGE_LABEL.publish}</span>
        </div>
        <Badge variant={STAGE_STATUS[st?.status ?? "pending"].variant}>
          {STAGE_STATUS[st?.status ?? "pending"].label}
        </Badge>
      </div>

      {!contentReady && (
        <p className="mb-2 text-xs text-muted-foreground">
          Cần hoàn tất giai đoạn “Nội dung” trước khi đăng.
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {PUBLISH_CHANNELS.map((ch) => {
          const connected = isChannelConnected(ch);
          const active = channels.includes(ch);
          return (
            <button
              key={ch}
              onClick={() => toggle(ch)}
              className={
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")
              }
            >
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
              {CHANNEL_LABEL[ch]}
              {connected ? (
                <Badge variant="success">đã kết nối</Badge>
              ) : (
                <Badge variant="warning">chưa kết nối</Badge>
              )}
            </button>
          );
        })}
      </div>

      {channels.includes("email") && (
        <Field label="Người nhận email (phân tách bằng dấu phẩy)">
          <Input
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="a@example.com, b@example.com"
          />
        </Field>
      )}

      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        Tôi xác nhận đăng/đẩy nội dung lên kênh đã chọn.
      </label>

      <div className="mt-2">
        <Button
          size="sm"
          onClick={() => publishMut.mutate()}
          disabled={!confirm || !contentReady || channels.length === 0 || publishMut.isPending}
        >
          <Send className={publishMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          {publishMut.isPending ? "Đang đăng…" : "Đăng / Lên lịch"}
        </Button>
      </div>

      {publishMut.isError && (
        <div className="mt-2 rounded-md bg-danger/10 p-2 text-xs text-danger">
          Lỗi: {(publishMut.error as Error).message}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{CHANNEL_LABEL[r.channel as CampaignChannel] ?? r.channel}</span>
              <span className="text-muted-foreground">{r.detail}</span>
              <Badge
                variant={
                  r.status === "posted"
                    ? "success"
                    : r.status === "scheduled"
                    ? "default"
                    : r.status === "needs_connection"
                    ? "warning"
                    : "danger"
                }
              >
                {r.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePipelineDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: MarketingPipeline) => void;
}) {
  const [form, setForm] = useState<PipelineForm>(EMPTY_PIPELINE_FORM);
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      const payload: PipelineCreatePayload = {
        name: form.name.trim(),
        topic: form.topic.trim(),
        project: form.project.trim() || undefined,
        audience: form.audience.trim() || undefined,
        content_format: form.content_format,
        channel: form.channel,
        tone: form.tone.trim() || undefined,
        language: form.language,
      };
      return createPipeline(payload);
    },
    onSuccess: (p) => {
      setForm(EMPTY_PIPELINE_FORM);
      onCreated(p);
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title="Tạo pipeline mới" onClose={onClose} />
      <DialogBody>
        {error && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>}
        <Field label="Tên pipeline">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: ELC tháng 6 — Toplist căn hộ view hồ"
          />
        </Field>
        <Field label="Chủ đề / từ khoá">
          <Textarea
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            placeholder="VD: 5 lý do nên chọn căn hộ Eurowindow Light City để đầu tư"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dự án (tuỳ chọn)">
            <Input
              value={form.project}
              onChange={(e) => setForm({ ...form, project: e.target.value })}
              placeholder="VD: Eurowindow Light City"
            />
          </Field>
          <Field label="Đối tượng">
            <Input
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
              placeholder="VD: Nhà đầu tư 30-45 tuổi"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Định dạng">
            <Select
              value={form.content_format}
              onChange={(e) =>
                setForm({ ...form, content_format: e.target.value as PipelineContentFormat })
              }
            >
              {(Object.keys(FORMAT_LABEL) as PipelineContentFormat[]).map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kênh chính">
            <Select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as CampaignChannel })}
            >
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABEL[ch]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngôn ngữ">
            <Select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as PipelineLanguage })}
            >
              {(Object.keys(LANGUAGE_LABEL) as PipelineLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tông giọng">
            <Input
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
              placeholder="VD: sang trọng, truyền cảm hứng"
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !form.name.trim() || form.topic.trim().length < 2}
        >
          {createMut.isPending ? "Đang tạo…" : "Tạo pipeline"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
