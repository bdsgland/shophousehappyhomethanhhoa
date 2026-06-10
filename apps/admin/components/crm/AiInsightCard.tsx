"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Lightbulb, RefreshCw, Sparkles } from "lucide-react";

import { getLeadInsight, rescoreLead } from "@/lib/api";
import type { AiTier } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TIER_LABEL: Record<string, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
};
const TIER_VARIANT: Record<string, "default" | "warning" | "danger"> = {
  cold: "default",
  warm: "warning",
  hot: "danger",
};

function tierMeta(tier?: AiTier | string | null) {
  const key = (tier ?? "").toLowerCase();
  return {
    label: TIER_LABEL[key] ?? "Chưa xếp",
    variant: TIER_VARIANT[key] ?? "default",
  } as const;
}

/**
 * Thẻ phân tích AI thật cho 1 lead: điểm + tier + lý do + thời điểm liên hệ +
 * gợi ý hành động + nút chấm điểm lại. Lấy dữ liệu qua /ai-crm/leads/{id}/insight.
 */
export function AiInsightCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const insightQ = useQuery({
    queryKey: ["ai-insight", leadId],
    queryFn: () => getLeadInsight(leadId),
  });

  const rescoreMut = useMutation({
    mutationFn: () => rescoreLead(leadId),
    onSuccess: (res) => {
      qc.setQueryData(["ai-insight", leadId], res);
      qc.invalidateQueries({ queryKey: ["crm-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
  });

  const insight = insightQ.data;
  const tier = tierMeta(insight?.ai_tier);
  const nba = insight?.ai_next_action;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-warning" /> Phân tích AI
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rescoreMut.mutate()}
          disabled={rescoreMut.isPending || insightQ.isLoading}
        >
          <RefreshCw
            className={rescoreMut.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          {rescoreMut.isPending ? "Đang chấm…" : "Chấm điểm lại bằng AI"}
        </Button>
      </div>

      {insightQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : insightQ.isError ? (
        <p className="text-sm text-danger">
          Không tải được phân tích AI: {(insightQ.error as Error)?.message}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Điểm + tier */}
          <div className="flex items-center gap-4">
            <div className="leading-none">
              <span className="text-3xl font-bold text-primary">
                {insight?.ai_score ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
            <Badge variant={tier.variant} className="text-xs">
              {tier.label}
            </Badge>
          </div>

          {/* Lý do */}
          {insight?.ai_reason && (
            <p className="text-sm text-muted-foreground">{insight.ai_reason}</p>
          )}

          {/* Thời điểm liên hệ tốt nhất */}
          {insight?.ai_best_time && (
            <div className="flex items-start gap-2 text-sm">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">Thời điểm liên hệ tốt nhất:</span>{" "}
                {insight.ai_best_time}
              </span>
            </div>
          )}

          {/* Gợi ý hành động */}
          {(nba?.summary || nba?.suggested_action) && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Lightbulb className="h-4 w-4 text-warning" /> Gợi ý hành động (AI)
              </div>
              {nba?.summary && (
                <p className="text-muted-foreground">{nba.summary}</p>
              )}
              {nba?.suggested_action && (
                <p className="mt-1 font-medium">{nba.suggested_action}</p>
              )}
            </div>
          )}

          {insight?.ai_scored_at && (
            <p className="text-xs text-muted-foreground">
              Chấm lúc:{" "}
              {new Date(insight.ai_scored_at).toLocaleString("vi-VN")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
