"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  ApiError,
  createHRObjective,
  deleteHRObjective,
  listHRObjectives,
  listHRStaff,
  updateHRObjective,
} from "@/lib/api";
import type { HRObjective, KPIMetric } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  KPI_METRIC_LABEL,
  KPI_METRICS,
  formatMetricValue,
} from "@/components/hr/hr-constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ObjectivesTab() {
  const qc = useQueryClient();
  const { data: objectives, isLoading } = useQuery({
    queryKey: ["hr-objectives"],
    queryFn: () => listHRObjectives(),
  });
  const { data: staff } = useQuery({
    queryKey: ["hr-staff"],
    queryFn: () => listHRStaff(false),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HRObjective | null>(null);
  const [confirm, setConfirm] = useState<HRObjective | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hr-objectives"] });
    qc.invalidateQueries({ queryKey: ["hr-overview"] });
    qc.invalidateQueries({ queryKey: ["hr-staff"] });
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteHRObjective(id),
    onSuccess: () => {
      invalidate();
      setConfirm(null);
    },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Thực tế được tính tự động từ dữ liệu sale/hoa hồng; chỉ tiêu nhập thủ công.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Đặt mục tiêu
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nhân sự</th>
                <th className="px-4 py-3 font-medium">Kỳ</th>
                <th className="px-4 py-3 font-medium">Chỉ tiêu</th>
                <th className="px-4 py-3 font-medium">Mục tiêu</th>
                <th className="px-4 py-3 font-medium">Thực tế</th>
                <th className="px-4 py-3 font-medium">Tiến độ</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={7}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : !objectives || objectives.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={7}>
                    Chưa có mục tiêu KPI nào. Bấm “Đặt mục tiêu” để thêm.
                  </td>
                </tr>
              ) : (
                objectives.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{o.staff_name ?? o.staff_id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.period}</td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{KPI_METRIC_LABEL[o.metric]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatMetricValue(o.metric, o.target)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatMetricValue(o.metric, o.actual)}
                      {o.actual_override != null && (
                        <span className="ml-1 text-xs text-warning">(thủ công)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar pct={o.completion_pct} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="Sửa"
                          onClick={() => {
                            setEditing(o);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn title="Xoá" danger onClick={() => setConfirm(o)}>
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ObjectiveForm
        open={formOpen}
        editing={editing}
        staff={staff?.staff ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={invalidate}
      />

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogHeader title="Xoá mục tiêu?" onClose={() => setConfirm(null)} />
        <DialogBody>
          <p className="text-sm">
            Xoá mục tiêu <b>{confirm && KPI_METRIC_LABEL[confirm.metric]}</b> kỳ{" "}
            {confirm?.period} của <b>{confirm?.staff_name}</b>?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Huỷ
          </Button>
          <Button
            variant="danger"
            disabled={deleteMut.isPending}
            onClick={() => confirm && deleteMut.mutate(confirm.id)}
          >
            {deleteMut.isPending ? "Đang xoá…" : "Xoá"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = pct >= 100 ? "bg-success" : pct >= 60 ? "bg-primary" : "bg-warning";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ObjectiveForm({
  open,
  onClose,
  onSaved,
  editing,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: HRObjective | null;
  staff: { id: string; full_name: string }[];
}) {
  const isEdit = Boolean(editing);
  const [staffId, setStaffId] = useState(editing?.staff_id ?? "");
  const [period, setPeriod] = useState(editing?.period ?? defaultPeriod());
  const [metric, setMetric] = useState<KPIMetric>(editing?.metric ?? "revenue");
  const [target, setTarget] = useState(String(editing?.target ?? ""));
  const [override, setOverride] = useState(
    editing?.actual_override != null ? String(editing.actual_override) : "",
  );
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formKey = editing?.id ?? "new";
  const [activeKey, setActiveKey] = useState(formKey);
  if (activeKey !== formKey) {
    setActiveKey(formKey);
    setStaffId(editing?.staff_id ?? "");
    setPeriod(editing?.period ?? defaultPeriod());
    setMetric(editing?.metric ?? "revenue");
    setTarget(String(editing?.target ?? ""));
    setOverride(editing?.actual_override != null ? String(editing.actual_override) : "");
    setNote(editing?.note ?? "");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const targetNum = Number(target);
    if (!isEdit && !staffId) {
      setError("Vui lòng chọn nhân sự.");
      return;
    }
    if (!period.trim() || Number.isNaN(targetNum) || targetNum < 0) {
      setError("Kỳ và chỉ tiêu (số ≥ 0) là bắt buộc.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateHRObjective(editing.id, {
          period: period.trim(),
          metric,
          target: targetNum,
          actual_override: override.trim() === "" ? null : Number(override),
          note: note?.trim() || undefined,
        });
      } else {
        await createHRObjective({
          staff_id: staffId,
          period: period.trim(),
          metric,
          target: targetNum,
          note: note?.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader
        title={isEdit ? "Sửa mục tiêu KPI" : "Đặt mục tiêu KPI"}
        description="Thực tế tự động tính từ dữ liệu hệ thống; có thể nhập 'thực tế thủ công' để ghi đè."
        onClose={onClose}
      />
      <DialogBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nhân sự *</Label>
            <Select
              value={staffId}
              disabled={isEdit}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">— Chọn nhân sự —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kỳ (vd 2026-06) *</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-06" />
          </div>
          <div className="space-y-1.5">
            <Label>Chỉ tiêu</Label>
            <Select value={metric} onChange={(e) => setMetric(e.target.value as KPIMetric)}>
              {KPI_METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mục tiêu (target) *</Label>
            <Input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="vd 5000000000"
            />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Thực tế thủ công (tuỳ chọn)</Label>
              <Input
                type="number"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="để trống = tự động"
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ghi chú</Label>
            <Input value={note ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" />
          </div>
        </div>
        {error && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Huỷ
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo mục tiêu"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
