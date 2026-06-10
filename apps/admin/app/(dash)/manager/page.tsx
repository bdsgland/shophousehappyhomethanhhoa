"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Bot,
  CheckCircle2,
  ExternalLink,
  Flame,
  Megaphone,
  RefreshCw,
  Send,
  Server,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
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
  getManagerOverview,
  managerAssignHotLeads,
  managerBroadcast,
  managerCommand,
  managerRestartPlatform,
} from "@/lib/api";
import type {
  ManagerAudience,
  ManagerBroadcastChannel,
  ManagerCommandResult,
  ManagerOverview,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatTy } from "@/lib/utils";

const CHART_COLORS = ["#c08433", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#f59e0b"];

// ---------------------------------------------------------------------------
// Thẻ KPI nhỏ
// ---------------------------------------------------------------------------
function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-[hsl(38,92%,38%)]"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-semibold ${toneCls}`}>{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Khu BÁO CÁO
// ---------------------------------------------------------------------------
function ReportSection({ data }: { data: ManagerOverview }) {
  const { sales, leads, commission, automation } = data;

  const funnel = [
    { name: "Lạnh", value: leads.cold_leads ?? 0 },
    { name: "Ấm", value: leads.warm_leads ?? 0 },
    { name: "Nóng", value: leads.hot_leads ?? 0 },
    { name: "Khách", value: leads.customers ?? 0 },
    { name: "Mất", value: leads.lost_leads ?? 0 },
  ];

  const commissionByStatus = Object.entries(commission.by_status || {}).map(
    ([status, v]) => ({ name: status, value: v.amount }),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Hoa hồng ước tính"
          value={formatTy(sales.revenue_projection_ty)}
          sub={`Tỉ lệ ${(sales.commission_rate * 100).toFixed(1)}%`}
        />
        <KpiCard
          icon={<BadgeDollarSign className="h-5 w-5" />}
          label="Hoa hồng đã ghi"
          value={formatNumber(commission.total_amount)}
          sub={`${commission.deals} giao dịch`}
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Tổng lead"
          value={formatNumber(leads.total_leads ?? 0)}
          sub={`Chuyển đổi ${leads.conversion_rate ?? 0}%`}
        />
        <KpiCard
          icon={<Flame className="h-5 w-5" />}
          label="Hot lead"
          value={formatNumber(leads.hot_leads ?? 0)}
          tone={(leads.hot_leads ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<Server className="h-5 w-5" />}
          label="Đơn giữ chỗ"
          value={formatNumber(sales.orders_reserved)}
          sub={sales.inventory.is_demo ? "Dữ liệu mẫu" : `${sales.inventory.total} căn`}
        />
        <KpiCard
          icon={<Activity className="h-5 w-5" />}
          label="Automation chạy"
          value={
            automation.configured ? formatNumber(automation.active ?? 0) : "—"
          }
          sub={automation.configured ? `${automation.total ?? 0} workflow` : "Chưa cấu hình"}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Lỗi automation"
          value={automation.configured ? formatNumber(automation.errors_recent ?? 0) : "—"}
          tone={(automation.errors_recent ?? 0) > 0 ? "danger" : "default"}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Quỹ căn còn hàng"
          value={formatNumber(sales.inventory.available)}
          sub={`Đã bán ${sales.inventory.sold}`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Phễu Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215,16%,60%)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(215,16%,60%)" />
                  <Tooltip
                    formatter={(v) => [`${v} lead`, "Số lead"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(214,20%,88%)", fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {funnel.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Hoa hồng theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            {commissionByStatus.length === 0 ? (
              <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                Chưa có dữ liệu hoa hồng.
              </p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commissionByStatus} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215,16%,60%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(215,16%,60%)" />
                    <Tooltip
                      formatter={(v) => [formatNumber(Number(v)), "VNĐ"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(214,20%,88%)", fontSize: 12 }}
                    />
                    <Bar dataKey="value" fill="#c08433" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trang chính
// ---------------------------------------------------------------------------
export default function ManagerPage() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["manager-overview"],
    queryFn: getManagerOverview,
    refetchInterval: 60_000,
  });

  // --- Broadcast state ---
  const [bcMessage, setBcMessage] = useState("");
  const [bcTitle, setBcTitle] = useState("");
  const [bcAudience, setBcAudience] = useState<ManagerAudience>("all_sales");
  const [bcChannels, setBcChannels] = useState<ManagerBroadcastChannel[]>(["inapp"]);
  const [bcConfirm, setBcConfirm] = useState(false);

  const broadcastMut = useMutation({
    mutationFn: () =>
      managerBroadcast({
        message: bcMessage.trim(),
        title: bcTitle.trim() || undefined,
        audience: bcAudience,
        channels: bcChannels,
      }),
    onSuccess: (r) => {
      setBcConfirm(false);
      setBcMessage("");
      setBcTitle("");
      setToast(
        `Đã gửi tới ${r.recipients} người — Telegram: ${r.results.telegram.sent}, in-app: ${r.results.inapp.created ? "đã lưu" : "—"}`,
      );
    },
    onError: (e: Error) => setToast(`Lỗi gửi thông báo: ${e.message}`),
  });

  // --- Assign hot leads ---
  const [assignConfirm, setAssignConfirm] = useState(false);
  const assignMut = useMutation({
    mutationFn: () => managerAssignHotLeads(false),
    onSuccess: (r) => {
      setAssignConfirm(false);
      setToast(`Đã phân bổ ${r.distributed ?? 0} hot lead.`);
      qc.invalidateQueries({ queryKey: ["manager-overview"] });
    },
    onError: (e: Error) => setToast(`Lỗi phân bổ: ${e.message}`),
  });

  // --- Restart platform ---
  const [restartTarget, setRestartTarget] = useState<string | null>(null);
  const restartMut = useMutation({
    mutationFn: (service: string) => managerRestartPlatform(service),
    onSuccess: (r) => {
      setRestartTarget(null);
      setToast(`Đã gửi yêu cầu restart "${r.service}".`);
    },
    onError: (e: Error) => {
      setRestartTarget(null);
      setToast(`Không restart được: ${e.message}`);
    },
  });

  // --- Natural-language command ---
  const [cmdText, setCmdText] = useState("");
  const [cmdResult, setCmdResult] = useState<ManagerCommandResult | null>(null);
  const cmdMut = useMutation({
    mutationFn: (confirm: boolean) =>
      managerCommand(
        confirm && cmdResult
          ? {
              text: cmdText.trim(),
              confirm: true,
              action: cmdResult.action,
              params: cmdResult.params,
            }
          : { text: cmdText.trim() },
      ),
    onSuccess: (r) => {
      setCmdResult(r);
      if (r.executed) qc.invalidateQueries({ queryKey: ["manager-overview"] });
    },
    onError: (e: Error) => setToast(`Lỗi xử lý lệnh: ${e.message}`),
  });

  const data = overview.data;
  const openclaw = data?.openclaw;

  function toggleChannel(ch: ManagerBroadcastChannel) {
    setBcChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm điều hành"
        description="Tổng hợp báo cáo vận hành và ra lệnh cho hệ thống."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        }
      />

      {/* Trạng thái OpenClaw */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Kết nối OpenClaw</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <Badge variant={openclaw?.configured ? "success" : "muted"}>
                  {openclaw?.configured ? "Đã cấu hình God-Mode" : "Chưa cấu hình token"}
                </Badge>
                <Badge variant={openclaw?.telegram_configured ? "success" : "muted"}>
                  {openclaw?.telegram_configured ? "Telegram sẵn sàng" : "Telegram chưa cấu hình"}
                </Badge>
              </div>
            </div>
          </div>
          {openclaw?.bot_url && (
            <a href={openclaw.bot_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" />
                Mở OpenClaw Bot
              </Button>
            </a>
          )}
        </CardContent>
      </Card>

      {/* BÁO CÁO */}
      {overview.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải báo cáo…</p>
      ) : overview.isError ? (
        <p className="text-sm text-danger">
          Không tải được báo cáo: {(overview.error as Error)?.message}
        </p>
      ) : data ? (
        <ReportSection data={data} />
      ) : null}

      {/* RA LỆNH */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gửi thông báo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Megaphone className="h-4 w-4 text-primary" /> Gửi thông báo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Tiêu đề (tuỳ chọn)"
              value={bcTitle}
              onChange={(e) => setBcTitle(e.target.value)}
            />
            <Textarea
              placeholder="Nội dung thông báo…"
              rows={3}
              value={bcMessage}
              onChange={(e) => setBcMessage(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={bcAudience}
                onChange={(e) => setBcAudience(e.target.value as ManagerAudience)}
                className="max-w-[180px]"
              >
                <option value="all_sales">Toàn bộ Sale</option>
                <option value="all_admins">Toàn bộ Admin</option>
              </Select>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={bcChannels.includes("inapp")}
                  onChange={() => toggleChannel("inapp")}
                />
                In-app
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={bcChannels.includes("telegram")}
                  onChange={() => toggleChannel("telegram")}
                />
                Telegram
              </label>
            </div>
            <Button
              size="sm"
              disabled={!bcMessage.trim() || bcChannels.length === 0}
              onClick={() => setBcConfirm(true)}
            >
              <Send className="h-4 w-4" /> Gửi thông báo
            </Button>
          </CardContent>
        </Card>

        {/* Phân bổ hot lead + nền tảng */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Flame className="h-4 w-4 text-primary" /> Hành động nhanh
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Phân bổ hot lead</p>
                <p className="text-xs text-muted-foreground">
                  Tự gán hot lead đang chờ cho sale theo eligibility.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAssignConfirm(true)}>
                Phân bổ
              </Button>
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-sm font-medium">Nền tảng</p>
              <div className="space-y-1.5">
                {data?.platforms.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      {p.status === "up" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-danger" />
                      )}
                      {p.name}
                    </span>
                    {p.key !== "api" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRestartTarget(p.key)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Restart
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ô LỆNH NGÔN NGỮ TỰ NHIÊN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" /> Ô lệnh điều hành (AI)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder='Ví dụ: "xem báo cáo tổng quan" hoặc "gửi thông báo cho sale: họp 9h sáng mai"'
              value={cmdText}
              onChange={(e) => setCmdText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cmdText.trim()) cmdMut.mutate(false);
              }}
            />
            <Button
              size="sm"
              disabled={!cmdText.trim() || cmdMut.isPending}
              onClick={() => cmdMut.mutate(false)}
            >
              <Send className="h-4 w-4" /> Gửi
            </Button>
          </div>

          {cmdResult && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {cmdResult.summary && (
                <p className="mb-1">
                  <span className="font-medium">Ý định:</span> {cmdResult.summary}
                </p>
              )}
              {cmdResult.message && (
                <p className="text-muted-foreground">{cmdResult.message}</p>
              )}

              {cmdResult.requires_confirmation && cmdResult.action && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="warning">Cần xác nhận: {cmdResult.action}</Badge>
                  <Button
                    size="sm"
                    disabled={cmdMut.isPending}
                    onClick={() => cmdMut.mutate(true)}
                  >
                    Xác nhận thực thi
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCmdResult(null)}>
                    Huỷ
                  </Button>
                </div>
              )}

              {cmdResult.executed && cmdResult.result?.type === "report" && (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-card p-2 text-xs">
                  {JSON.stringify(cmdResult.result.data, null, 2)}
                </pre>
              )}
              {cmdResult.executed && cmdResult.result?.type === "action_result" && (
                <Badge variant="success" className="mt-2">Đã thực thi</Badge>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Chỉ các hành động an toàn (xem báo cáo, gửi thông báo, phân bổ lead) được phép.
            Hành động có ảnh hưởng hệ thống luôn cần xác nhận; lệnh nguy hiểm bị từ chối.
          </p>
        </CardContent>
      </Card>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="text-muted-foreground">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dialog xác nhận broadcast */}
      <Dialog open={bcConfirm} onClose={() => setBcConfirm(false)}>
        <DialogHeader
          title="Xác nhận gửi thông báo"
          description={`Gửi tới ${bcAudience === "all_sales" ? "toàn bộ Sale" : "toàn bộ Admin"} qua ${bcChannels.join(", ")}.`}
          onClose={() => setBcConfirm(false)}
        />
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            {bcTitle && <span className="font-medium">{bcTitle}: </span>}
            {bcMessage}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setBcConfirm(false)}>
            Huỷ
          </Button>
          <Button size="sm" disabled={broadcastMut.isPending} onClick={() => broadcastMut.mutate()}>
            Gửi ngay
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog xác nhận phân bổ hot lead */}
      <Dialog open={assignConfirm} onClose={() => setAssignConfirm(false)}>
        <DialogHeader
          title="Phân bổ hot lead"
          description="Tự động gán toàn bộ hot lead đang chờ cho sale phù hợp."
          onClose={() => setAssignConfirm(false)}
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setAssignConfirm(false)}>
            Huỷ
          </Button>
          <Button size="sm" disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>
            Phân bổ ngay
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog xác nhận restart */}
      <Dialog open={!!restartTarget} onClose={() => setRestartTarget(null)}>
        <DialogHeader
          title="Khởi động lại nền tảng"
          description={`Gửi yêu cầu redeploy service "${restartTarget}" qua Railway.`}
          onClose={() => setRestartTarget(null)}
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setRestartTarget(null)}>
            Huỷ
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={restartMut.isPending}
            onClick={() => restartTarget && restartMut.mutate(restartTarget)}
          >
            Restart ngay
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
