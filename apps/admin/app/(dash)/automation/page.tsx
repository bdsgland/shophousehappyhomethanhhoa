"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import {
  getAutomationOverview,
  getAutomationWorkflows,
  getWorkflowExecutions,
  setWorkflowActive,
} from "@/lib/api";
import type {
  AutomationNotConfigured,
  N8nCategoryGroup,
  N8nExecution,
  N8nWorkflow,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// --- helpers ---------------------------------------------------------------

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isNotConfigured(
  data: unknown,
): data is AutomationNotConfigured {
  return !!data && (data as { configured?: boolean }).configured === false;
}

// --- không cấu hình → hướng dẫn set key ------------------------------------

function SetupGuide({ data }: { data: AutomationNotConfigured }) {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[hsl(38,92%,38%)]" />
          <CardTitle>Chưa cấu hình N8N_API_KEY</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{data.message}</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          {data.setup.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <a href={data.n8n_url} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4" />
            Mở n8n
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}

// --- thẻ thống kê tổng quan -------------------------------------------------

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 text-2xl font-semibold",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

// --- panel executions của 1 workflow ---------------------------------------

function ExecutionsPanel({ workflowId }: { workflowId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["wf-executions", workflowId],
    queryFn: () => getWorkflowExecutions(workflowId, 10),
  });

  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Đang tải lịch sử…</div>;
  }
  if (isError) {
    return (
      <div className="px-4 py-3 text-xs text-danger">Không tải được lịch sử chạy.</div>
    );
  }
  const rows: N8nExecution[] = data?.executions ?? [];
  if (rows.length === 0) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Chưa có lần chạy nào.</div>;
  }
  return (
    <div className="divide-y divide-border border-t border-border bg-muted/30">
      {rows.map((e) => {
        const err = e.status === "error";
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-xs">
            {err ? (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            )}
            <span className="font-medium">{e.status ?? "—"}</span>
            <span className="text-muted-foreground">{fmtDateTime(e.startedAt)}</span>
            {e.mode && (
              <span className="ml-auto text-muted-foreground">{e.mode}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- 1 dòng workflow --------------------------------------------------------

function WorkflowRow({ wf }: { wf: N8nWorkflow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const toggleMut = useMutation({
    mutationFn: (active: boolean) => setWorkflowActive(wf.id, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-workflows"] });
      qc.invalidateQueries({ queryKey: ["automation-overview"] });
    },
  });

  const last = wf.last_run;
  const lastErr = last?.status === "error";
  const hasErrors = wf.errors_window > 0;

  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Switch
          checked={wf.active}
          disabled={toggleMut.isPending}
          onChange={(v) => toggleMut.mutate(v)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{wf.name}</span>
            {wf.tags.map(
              (t) =>
                t.name && (
                  <Badge key={t.id ?? t.name} variant="muted">
                    {t.name}
                  </Badge>
                ),
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className={cn(wf.active ? "text-success" : "text-muted-foreground")}>
              {wf.active ? "Đang bật" : "Đã tắt"}
            </span>
            {last ? (
              <span className="inline-flex items-center gap-1">
                {lastErr ? (
                  <XCircle className="h-3 w-3 text-danger" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-success" />
                )}
                Lần chạy: {fmtDateTime(last.startedAt)}
              </span>
            ) : (
              <span>Chưa chạy gần đây</span>
            )}
            {wf.runs_window > 0 && (
              <span className={cn(hasErrors && "text-danger")}>
                {wf.errors_window}/{wf.runs_window} lỗi
              </span>
            )}
          </div>
        </div>

        {toggleMut.isError && (
          <span className="text-xs text-danger">Lỗi đổi trạng thái</span>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          title="Xem lịch sử chạy"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Lịch sử
        </Button>
        <a
          href={wf.open_url}
          target="_blank"
          rel="noopener noreferrer"
          title="Mở trong n8n"
        >
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4" />
            n8n
          </Button>
        </a>
      </div>
      {open && <ExecutionsPanel workflowId={wf.id} />}
    </div>
  );
}

// --- 1 hạng mục -------------------------------------------------------------

function CategorySection({ group }: { group: N8nCategoryGroup }) {
  const active = group.workflows.filter((w) => w.active).length;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <CardTitle>{group.label}</CardTitle>
          <Badge variant={group.source === "tag" ? "default" : "muted"}>
            {group.source === "tag" ? "theo tag n8n" : "suy từ tên"}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {active}/{group.workflows.length} đang bật
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {group.workflows.map((wf) => (
            <WorkflowRow key={wf.id} wf={wf} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- trang chính ------------------------------------------------------------

export default function AutomationPage() {
  const overviewQ = useQuery({
    queryKey: ["automation-overview"],
    queryFn: getAutomationOverview,
    refetchInterval: 60_000,
  });
  const workflowsQ = useQuery({
    queryKey: ["automation-workflows"],
    queryFn: getAutomationWorkflows,
  });

  const overview = overviewQ.data;
  const workflows = workflowsQ.data;
  const loading = overviewQ.isLoading || workflowsQ.isLoading;
  const fetching = overviewQ.isFetching || workflowsQ.isFetching;

  const refetchAll = () => {
    overviewQ.refetch();
    workflowsQ.refetch();
  };

  return (
    <div>
      <PageHeader
        title="Automation"
        description="Đồng bộ & kiểm soát toàn bộ workflow n8n — phân loại theo hạng mục."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={fetching}
          >
            <RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Đồng bộ lại
          </Button>
        }
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Đang tải dữ liệu n8n…
        </div>
      )}

      {/* Chưa cấu hình key */}
      {!loading && isNotConfigured(overview) && <SetupGuide data={overview} />}

      {/* Lỗi gọi n8n (down / 502) */}
      {!loading && (overviewQ.isError || workflowsQ.isError) && (
        <Card className="border-danger/40 bg-danger/5">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            Không kết nối được n8n. Kiểm tra n8n có đang chạy và N8N_API_KEY còn
            hợp lệ.
          </CardContent>
        </Card>
      )}

      {/* Đã cấu hình → hiển thị dashboard */}
      {!loading && overview && !isNotConfigured(overview) && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Tổng workflow" value={overview.total} />
          <StatCard label="Đang bật" value={overview.active} tone="success" />
          <StatCard label="Đã tắt" value={overview.inactive} />
          <StatCard label="Hạng mục" value={overview.categories_count} />
          <StatCard label="Chạy hôm nay" value={overview.runs_today} />
          <StatCard
            label="Lỗi gần đây"
            value={overview.errors_recent}
            tone={overview.errors_recent > 0 ? "danger" : "default"}
          />
        </div>
      )}

      {!loading &&
        workflows &&
        !isNotConfigured(workflows) &&
        (workflows.categories.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <WorkflowIcon className="h-4 w-4" />
              Chưa có workflow nào trên n8n.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {workflows.categories.map((g) => (
              <CategorySection key={g.key} group={g} />
            ))}
          </div>
        ))}
    </div>
  );
}
