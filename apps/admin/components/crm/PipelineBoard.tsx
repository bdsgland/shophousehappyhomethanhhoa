"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Phone, Sparkles } from "lucide-react";
import Link from "next/link";

import { changeLeadStage, getPipeline } from "@/lib/api";
import type { PipelineCard, PipelineColumn } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

function scoreTone(score: number): string {
  if (score >= 70) return "text-danger";
  if (score >= 40) return "text-warning";
  return "text-primary";
}

/** 1 thẻ khách trong cột kanban + dropdown đổi giai đoạn. */
function LeadCardItem({
  card,
  stages,
  onMove,
  moving,
}: {
  card: PipelineCard;
  stages: { key: string; label: string }[];
  onMove: (id: string, stage: string) => void;
  moving: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/customers/${card.id}`}
          className="truncate text-sm font-semibold hover:text-primary"
        >
          {card.name}
        </Link>
        <Link
          href={`/customers/${card.id}`}
          className="shrink-0 text-muted-foreground hover:text-primary"
          title="Mở hồ sơ"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Phone className="h-3 w-3" /> {card.phone}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-sm font-bold ${scoreTone(card.ai_score)}`}>
          <Sparkles className="h-3.5 w-3.5" /> {card.ai_score}
        </span>
        {card.suggested_stage && (
          <Badge variant="warning" className="text-[10px]">
            AI gợi ý nâng cấp
          </Badge>
        )}
      </div>

      <Select
        className="mt-2 h-8 text-xs"
        value={card.stage}
        disabled={moving}
        onChange={(e) => {
          const next = e.target.value;
          if (next !== card.stage) onMove(card.id, next);
        }}
      >
        {stages.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Bảng kanban pipeline: cột theo 9 giai đoạn, mỗi cột là list thẻ khách. Đổi
 * giai đoạn bằng dropdown trên thẻ → POST /crm/leads/{id}/stage → reload.
 */
export function PipelineBoard() {
  const qc = useQueryClient();
  const pipelineQ = useQuery({
    queryKey: ["crm-pipeline"],
    queryFn: () => getPipeline(),
  });

  const moveMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      changeLeadStage(id, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-pipeline"] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
  });

  if (pipelineQ.isLoading) return <Skeleton className="h-96 w-full" />;
  if (pipelineQ.isError || !pipelineQ.data) {
    return (
      <p className="text-sm text-danger">
        Không tải được pipeline: {(pipelineQ.error as Error)?.message}
      </p>
    );
  }

  const { stages, total } = pipelineQ.data;
  const stageOptions = stages.map((s) => ({ key: s.key, label: s.label }));

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Tổng {total} khách · kéo theo cột giai đoạn, đổi giai đoạn bằng menu trên thẻ.
      </p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((col: PipelineColumn) => (
          <div
            key={col.key}
            className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/30"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">{col.label}</span>
              <Badge variant="muted" className="text-xs">
                {col.count}
              </Badge>
            </div>
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
              {col.leads.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  Trống
                </p>
              ) : (
                col.leads.map((card) => (
                  <LeadCardItem
                    key={card.id}
                    card={card}
                    stages={stageOptions}
                    moving={moveMut.isPending}
                    onMove={(id, stage) => moveMut.mutate({ id, stage })}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
