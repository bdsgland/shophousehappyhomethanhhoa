"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { getCrewStatus, listCrewAgents, runCrewForLead } from "@/lib/api";
import type {
  CrewAgentTemplate,
  CrewMode,
  CrewRunChannel,
  CrewRunResult,
  CrewStatus,
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
        <StatusCard />
        <AgentsCard />
        <RunCard />
      </div>
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
        <Badge variant="muted">
          Engine: {analysis.engine === "crewai" ? "CrewAI" : "Heuristic"}
        </Badge>
        {result.lead_name && <span className="text-sm font-medium">{result.lead_name}</span>}
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
          Phân tích
        </h3>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {analysis.summary}
        </p>
      </section>

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
              <DraftCard key={i} channel={d.channel} draft={d.draft} />
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

function DraftCard({ channel, draft }: { channel: string; draft: string }) {
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
        Bạn có thể sửa nội dung rồi tự gửi qua kênh chăm sóc khách. Trang này không gửi tin thật.
      </p>
    </div>
  );
}
