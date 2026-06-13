"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { actOnDecision, getManagerDecisions } from "@/lib/api";
import type {
  ManagerDecisionAction,
  ManagerDecisionGroup,
  ManagerDecisionItem,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Nhãn + variant nút theo hành động.
const ACTION_META: Record<
  ManagerDecisionAction,
  { label: string; variant: "default" | "outline" | "ghost" }
> = {
  approve: { label: "Phê duyệt", variant: "default" },
  execute: { label: "Thực hiện", variant: "default" },
  reject: { label: "Bỏ qua", variant: "ghost" },
};

// Nhãn + variant badge theo mức ưu tiên.
const PRIORITY_META: Record<
  string,
  { label: string; variant: "danger" | "warning" | "muted" }
> = {
  high: { label: "Ưu tiên cao", variant: "danger" },
  medium: { label: "Trung bình", variant: "warning" },
  low: { label: "Thấp", variant: "muted" },
};

function priorityMeta(p?: string) {
  return PRIORITY_META[p ?? "low"] ?? PRIORITY_META.low;
}

// ---------------------------------------------------------------------------
// 1 việc cần quyết định
// ---------------------------------------------------------------------------
function DecisionRow({
  item,
  acting,
  onAct,
}: {
  item: ManagerDecisionItem;
  acting: string | null;
  onAct: (item: ManagerDecisionItem, action: ManagerDecisionAction) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{item.title}</p>
        {item.context && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.context}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {item.actions.map((a) => {
          const meta = ACTION_META[a as ManagerDecisionAction];
          if (!meta) return null;
          const key = `${item.type}:${item.id}:${a}`;
          return (
            <Button
              key={a}
              size="sm"
              variant={meta.variant}
              disabled={acting !== null}
              onClick={() => onAct(item, a as ManagerDecisionAction)}
            >
              {acting === key && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {meta.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1 nhóm việc (theo type)
// ---------------------------------------------------------------------------
function DecisionGroup({
  group,
  acting,
  onAct,
}: {
  group: ManagerDecisionGroup;
  acting: string | null;
  onAct: (item: ManagerDecisionItem, action: ManagerDecisionAction) => void;
}) {
  const pri = priorityMeta(group.priority);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {group.label}
            <Badge variant="muted">{group.count}</Badge>
          </span>
          <Badge variant={pri.variant}>{pri.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.items.map((it) => (
          <DecisionRow
            key={`${it.type}:${it.id}`}
            item={it}
            acting={acting}
            onAct={onAct}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Trung tâm quyết định
// ---------------------------------------------------------------------------
export default function DecisionCenter() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const decisions = useQuery({
    queryKey: ["manager-decisions"],
    queryFn: getManagerDecisions,
    refetchInterval: 60_000,
  });

  const actMut = useMutation({
    mutationFn: (vars: { item: ManagerDecisionItem; action: ManagerDecisionAction }) =>
      actOnDecision({ type: vars.item.type, id: vars.item.id, action: vars.action }),
    onMutate: (vars) =>
      setActing(`${vars.item.type}:${vars.item.id}:${vars.action}`),
    onSuccess: (r) => {
      setToast(r.message || "Đã xử lý.");
      qc.invalidateQueries({ queryKey: ["manager-decisions"] });
    },
    onError: (e: Error) => setToast(`Lỗi: ${e.message}`),
    onSettled: () => setActing(null),
  });

  function handleAct(item: ManagerDecisionItem, action: ManagerDecisionAction) {
    actMut.mutate({ item, action });
  }

  const data = decisions.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data
            ? `${data.total} việc cần quyết định`
            : "Việc cần người điều hành duyệt / thực hiện / bỏ qua."}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => decisions.refetch()}
          disabled={decisions.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${decisions.isFetching ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {decisions.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : decisions.isError ? (
        <p className="text-sm text-danger">
          Không tải được danh sách: {(decisions.error as Error)?.message}
        </p>
      ) : !data || data.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="text-sm font-medium">Không có việc cần quyết định</p>
            <p className="text-xs text-muted-foreground">
              Hệ thống đang tự chạy — chưa có việc nào cần bạn xử lý.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.groups.map((g) => (
            <DecisionGroup
              key={g.type}
              group={g}
              acting={acting}
              onAct={handleAct}
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClipboardCheck className="h-3.5 w-3.5" />
        “Thực hiện/Phê duyệt” chỉ đổi trạng thái nội bộ (gán sale, đánh dấu duyệt) —
        không tự gửi tin hay giao dịch thật.
      </p>

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
    </div>
  );
}
