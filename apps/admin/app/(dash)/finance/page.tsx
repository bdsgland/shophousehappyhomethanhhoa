"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Coins,
  Percent,
  Plus,
  Receipt,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import {
  deleteFinanceCost,
  deleteManualRevenue,
  getFinanceAIAnalysis,
  getFinanceOverview,
  listFinanceCosts,
  listFinanceRevenue,
} from "@/lib/api";
import type {
  FinanceCost,
  FinanceManualRevenue,
  FinancePeriod,
} from "@/lib/types";
import { formatVnd, formatVndShort, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/kpi/StatCard";
import { FinanceTrendChart } from "@/components/charts/FinanceTrendChart";
import { CostBreakdownChart } from "@/components/charts/CostBreakdownChart";
import { CostModal } from "@/components/finance/CostModal";
import { RevenueModal } from "@/components/finance/RevenueModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

type TabKey = "overview" | "costs" | "revenue";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Tổng quan", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "costs", label: "Quản lý chi phí", icon: <Receipt className="h-4 w-4" /> },
  { key: "revenue", label: "Doanh thu", icon: <Coins className="h-4 w-4" /> },
];

const PERIODS: { value: FinancePeriod; label: string }[] = [
  { value: "month", label: "Tháng này" },
  { value: "quarter", label: "Quý này" },
  { value: "year", label: "Năm nay" },
];

const CATEGORY_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "danger" | "muted"
> = {
  "nền tảng": "default",
  marketing: "warning",
  "nhân sự": "success",
  "vận hành": "warning",
  khác: "muted",
};

export default function FinancePage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<FinancePeriod>("month");

  return (
    <div>
      <PageHeader
        title="Tài chính"
        description="Doanh thu, chi phí, lợi nhuận tự động + phân tích & dự báo bằng AI."
        action={
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as FinancePeriod)}
            className="w-40"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        }
      />

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        className="mb-4"
      />

      {tab === "overview" && <OverviewTab period={period} />}
      {tab === "costs" && <CostsTab />}
      {tab === "revenue" && <RevenueTab period={period} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Tổng quan
// ---------------------------------------------------------------------------

function OverviewTab({ period }: { period: FinancePeriod }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["finance-overview", period],
    queryFn: () => getFinanceOverview(period),
  });

  const s = data?.summary;
  const profitNeg = (s?.profit ?? 0) < 0;

  return (
    <div>
      {isError && (
        <div className="mb-4 rounded-md bg-danger/10 p-4 text-sm text-danger">
          Không tải được số liệu: {(error as Error).message}
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Doanh thu (${s?.period_label ?? "—"})`}
          value={formatVndShort(s?.revenue ?? 0)}
          icon={Banknote}
          hint={`${s?.deal_count ?? 0} deal có hoa hồng`}
          accent="success"
          loading={isLoading}
        />
        <StatCard
          label="Chi phí"
          value={formatVndShort(s?.cost ?? 0)}
          icon={Receipt}
          hint="Theo kỳ đã chọn"
          accent="danger"
          loading={isLoading}
        />
        <StatCard
          label="Lợi nhuận"
          value={formatVndShort(s?.profit ?? 0)}
          icon={Wallet}
          hint={profitNeg ? "Đang lỗ" : "Doanh thu − chi phí"}
          accent={profitNeg ? "danger" : "primary"}
          loading={isLoading}
        />
        <StatCard
          label="Biên lợi nhuận"
          value={s ? `${s.margin}%` : "—"}
          icon={Percent}
          hint={`${s?.customer_count ?? 0} khách đã chốt`}
          accent="warning"
          loading={isLoading}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Doanh thu · Chi phí · Lợi nhuận theo tháng</CardTitle>
            <CardDescription>12 tháng gần nhất.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <FinanceTrendChart data={data?.monthly ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cơ cấu chi phí</CardTitle>
            <CardDescription>
              Theo hạng mục trong {s?.period_label ?? "kỳ"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <CostBreakdownChart data={data?.cost_breakdown ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <AIAnalysisCard period={period} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Khối phân tích AI
// ---------------------------------------------------------------------------

function AIAnalysisCard({ period }: { period: FinancePeriod }) {
  const mut = useMutation({
    mutationFn: () => getFinanceAIAnalysis(period),
  });
  const result = mut.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Phân tích tài chính bằng AI
            </CardTitle>
            <CardDescription>
              Claude tóm tắt tình hình, điểm đáng chú ý và dự báo kỳ tới.
            </CardDescription>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
            <Sparkles className={mut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {mut.isPending ? "Đang phân tích…" : "Phân tích tài chính bằng AI"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {mut.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi phân tích: {(mut.error as Error).message}
          </div>
        )}
        {!result && !mut.isPending && !mut.isError && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bấm nút để Claude phân tích số liệu tài chính hiện tại.
          </p>
        )}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={result.source === "ai" ? "success" : "muted"}>
                {result.source === "ai" ? "AI Claude" : "Tóm tắt tự động"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {result.period_label}
              </span>
            </div>

            <div className="whitespace-pre-line rounded-md bg-muted/40 p-4 text-sm leading-relaxed">
              {result.summary}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ForecastBox
                label={`Doanh thu (${result.forecast.next_period_label})`}
                value={formatVndShort(result.forecast.revenue)}
                accent="text-success"
              />
              <ForecastBox
                label={`Chi phí (${result.forecast.next_period_label})`}
                value={formatVndShort(result.forecast.cost)}
                accent="text-danger"
              />
              <ForecastBox
                label={`Lợi nhuận (${result.forecast.next_period_label})`}
                value={formatVndShort(result.forecast.profit)}
                accent={
                  result.forecast.profit < 0 ? "text-danger" : "text-primary"
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">{result.forecast.method}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Quản lý chi phí
// ---------------------------------------------------------------------------

function CostsTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceCost | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-costs"],
    queryFn: listFinanceCosts,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFinanceCost(id),
    onSuccess: () => invalidate(),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["finance-costs"] });
    qc.invalidateQueries({ queryKey: ["finance-overview"] });
  }

  const costs = data?.costs ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {costs.length} khoản chi phí
        </span>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Thêm chi phí
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tên</th>
                <th className="px-4 py-3 font-medium">Hạng mục</th>
                <th className="px-4 py-3 font-medium">Loại</th>
                <th className="px-4 py-3 text-right font-medium">Số tiền</th>
                <th className="px-4 py-3 font-medium">Ngày</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : costs.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    Chưa có chi phí. Bấm “Thêm chi phí” để bắt đầu.
                  </td>
                </tr>
              ) : (
                costs.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {c.name}
                      {c.note === "ví dụ — sửa lại" && (
                        <Badge variant="warning" className="ml-2">
                          ví dụ — sửa lại
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={CATEGORY_VARIANT[c.category] ?? "muted"}>
                        {c.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.recurring === "monthly" ? "Hàng tháng" : "Một lần"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatVnd(c.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {shortDate(c.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(c);
                            setModalOpen(true);
                          }}
                        >
                          Sửa
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={delMut.isPending}
                          onClick={() => {
                            if (confirm(`Xóa khoản chi phí “${c.name}”?`)) {
                              delMut.mutate(c.id);
                            }
                          }}
                        >
                          Xóa
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CostModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={invalidate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Doanh thu
// ---------------------------------------------------------------------------

const SOURCE_VARIANT: Record<string, "default" | "success" | "muted"> = {
  commission: "success",
  manual: "default",
};

function RevenueTab({ period }: { period: FinancePeriod }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceManualRevenue | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-revenue", period],
    queryFn: () => listFinanceRevenue(period),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteManualRevenue(id),
    onSuccess: () => invalidate(),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["finance-revenue"] });
    qc.invalidateQueries({ queryKey: ["finance-overview"] });
  }

  const items = data?.items ?? [];
  // id các khoản thủ công (để biết dòng nào sửa/xóa được).
  const manualIds = new Set((data?.manual ?? []).map((m) => m.id));
  const manualById = new Map(
    (data?.manual ?? []).map((m) => [m.id, m] as const),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {items.length} dòng · Tổng{" "}
          <span className="font-semibold text-foreground">
            {formatVnd(data?.total ?? 0)}
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Thêm doanh thu thủ công
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <p className="text-sm text-muted-foreground">
          Doanh thu lấy <strong>tự động từ hoa hồng</strong> mỗi deal chốt (phần
          công ty nhận) cộng các khoản nhập tay. Hoa hồng do n8n đẩy về khi giao
          dịch hoàn tất.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nguồn</th>
                <th className="px-4 py-3 font-medium">Diễn giải</th>
                <th className="px-4 py-3 text-right font-medium">Số tiền</th>
                <th className="px-4 py-3 font-medium">Ngày</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    Chưa có doanh thu trong kỳ này.
                  </td>
                </tr>
              ) : (
                items.map((it, i) => {
                  const isManual = it.source === "manual" && it.ref_id;
                  const editable =
                    isManual && it.ref_id && manualIds.has(it.ref_id);
                  return (
                    <tr
                      key={`${it.source}-${it.ref_id ?? i}`}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <Badge variant={SOURCE_VARIANT[it.source] ?? "muted"}>
                          {it.source_label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{it.label}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatVnd(it.amount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {shortDate(it.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {editable ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const m = manualById.get(it.ref_id as string);
                                  if (m) {
                                    setEditing(m);
                                    setModalOpen(true);
                                  }
                                }}
                              >
                                Sửa
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={delMut.isPending}
                                onClick={() => {
                                  if (confirm("Xóa khoản doanh thu này?")) {
                                    delMut.mutate(it.ref_id as string);
                                  }
                                }}
                              >
                                Xóa
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              tự động
                            </span>
                          )}
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

      <RevenueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={invalidate}
      />
    </div>
  );
}
