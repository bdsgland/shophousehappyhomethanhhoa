"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Lightbulb,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { ApiError, getHRPerformanceReport, listHRStaff } from "@/lib/api";
import type { HRPerformanceReport } from "@/lib/types";
import {
  HR_ROLE_LABEL,
  KPI_METRIC_LABEL,
  formatMetricValue,
} from "@/components/hr/hr-constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function PerformanceTab() {
  const { data: staff } = useQuery({
    queryKey: ["hr-staff"],
    queryFn: () => listHRStaff(false),
  });

  const [staffId, setStaffId] = useState("");
  const [report, setReport] = useState<HRPerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportMut = useMutation({
    mutationFn: (id: string) => getHRPerformanceReport(id),
    onSuccess: (r) => {
      setReport(r);
      setError(null);
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Đánh giá thất bại."),
  });

  return (
    <div>
      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Chọn nhân sự</Label>
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">— Chọn nhân sự —</option>
              {(staff?.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({HR_ROLE_LABEL[s.role] ?? s.role})
                </option>
              ))}
            </Select>
          </div>
          <Button
            onClick={() => staffId && reportMut.mutate(staffId)}
            disabled={!staffId || reportMut.isPending}
          >
            <Sparkles className="h-4 w-4" />
            {reportMut.isPending ? "Đang đánh giá…" : "Đánh giá bằng AI"}
          </Button>
        </div>
        {error && (
          <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      {report && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{report.staff_name}</h3>
              <Badge variant="muted">
                {HR_ROLE_LABEL[report.role] ?? report.role}
              </Badge>
              {report.ai_used ? (
                <Badge variant="default">
                  <Sparkles className="h-3 w-3" /> Claude AI
                </Badge>
              ) : (
                <Badge variant="warning">Đánh giá tự động (chưa bật AI)</Badge>
              )}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {report.summary}
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <ListCard
              title="Điểm mạnh"
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              items={report.strengths}
            />
            <ListCard
              title="Điểm cần cải thiện"
              icon={<TriangleAlert className="h-4 w-4 text-warning" />}
              items={report.weaknesses}
            />
            <ListCard
              title="Đề xuất"
              icon={<Lightbulb className="h-4 w-4 text-primary" />}
              items={report.recommendations}
            />
          </div>

          <Card className="p-5">
            <h4 className="mb-3 text-sm font-semibold">Số liệu tổng hợp</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(report.metrics).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">
                    {KPI_METRIC_LABEL[k as keyof typeof KPI_METRIC_LABEL] ?? k}
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {formatMetricValue(k, Number(v))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Tạo lúc {new Date(report.generated_at).toLocaleString("vi-VN")}.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function ListCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
