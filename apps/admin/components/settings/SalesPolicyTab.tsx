"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";

import { getSalesPolicy, updateSalesPolicy } from "@/lib/api";
import type {
  MilestoneKind,
  PolicyMilestoneCfg,
  SalesBasePlan,
  SalesPolicyConfig,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const KIND_LABELS: Record<MilestoneKind, string> = {
  deposit_fixed: "Cọc cố định",
  pct_f28: "% × GTSP (F28)",
  balance_100: "Luỹ kế 100%",
  balance_partial: "Luỹ kế phần KH (%)",
  five_pct_hdmb: "5% HĐMB",
  bank_70: "NH giải ngân (%)",
};
const KIND_KEYS = Object.keys(KIND_LABELS) as MilestoneKind[];

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " ₫";
}

export function SalesPolicyTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sales-policy"],
    queryFn: getSalesPolicy,
  });
  const [draft, setDraft] = useState<SalesPolicyConfig | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(structuredClone(data));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (cfg: SalesPolicyConfig) => updateSalesPolicy(cfg),
    onSuccess: (saved) => {
      qc.setQueryData(["sales-policy"], saved);
      setDraft(structuredClone(saved));
      setBanner(`Đã lưu chính sách (v${saved.version}).`);
    },
    onError: (e) => setBanner(`Lưu thất bại: ${(e as Error).message}`),
  });

  if (isLoading || !draft) return <Skeleton className="h-96 w-full" />;

  const patchPlan = (i: number, patch: Partial<SalesBasePlan>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            base_plans: d.base_plans.map((p, idx) =>
              idx === i ? { ...p, ...patch } : p,
            ),
          }
        : d,
    );

  const patchMs = (pi: number, mi: number, patch: Partial<PolicyMilestoneCfg>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            base_plans: d.base_plans.map((p, idx) =>
              idx === pi
                ? {
                    ...p,
                    schedule: p.schedule.map((m, j) =>
                      j === mi ? { ...m, ...patch } : m,
                    ),
                  }
                : p,
            ),
          }
        : d,
    );

  const addMs = (pi: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            base_plans: d.base_plans.map((p, idx) =>
              idx === pi
                ? {
                    ...p,
                    schedule: [
                      ...p.schedule,
                      { label: "Đợt mới", kind: "pct_f28", pct: 5 } as PolicyMilestoneCfg,
                    ],
                  }
                : p,
            ),
          }
        : d,
    );

  const removeMs = (pi: number, mi: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            base_plans: d.base_plans.map((p, idx) =>
              idx === pi
                ? { ...p, schedule: p.schedule.filter((_, j) => j !== mi) }
                : p,
            ),
          }
        : d,
    );

  return (
    <div className="space-y-5">
      {banner && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Đóng">
            ✕
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Tham số chung</span>
            <Badge variant="muted">v{draft.version}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Cọc thiện chí (VND)</Label>
            <Input
              type="number"
              value={draft.deposit_amount}
              onChange={(e) =>
                setDraft({ ...draft, deposit_amount: Number(e.target.value) })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fmtVnd(draft.deposit_amount)} — trừ vào đợt 1
            </p>
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            VAT và phí bảo trì (KPBT) lấy theo từng căn trong bảng hàng — không
            cấu hình % ở đây. Chiết khấu chồng tuần tự trên giá niêm yết chưa
            VAT/KPBT.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ưu đãi chiết khấu (chồng tuần tự)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.addons.map((a, i) => (
            <div key={a.key} className="flex items-center gap-3">
              <Input
                className="flex-1"
                value={a.label}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    addons: draft.addons.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                type="number"
                step="0.1"
                className="w-24"
                value={a.pct}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    addons: draft.addons.map((x, j) =>
                      j === i ? { ...x, pct: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Switch
                checked={a.enabled}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    addons: draft.addons.map((x, j) =>
                      j === i ? { ...x, enabled: v } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Áp dụng tuần tự theo thứ tự trên (mỗi % trên phần còn lại), trước CK
            thanh toán của phương án.
          </p>
        </CardContent>
      </Card>

      {draft.base_plans.map((plan, pi) => (
        <Card key={plan.key}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {plan.label}
                <Badge variant="muted">{plan.key}</Badge>
              </span>
              <span className="flex items-center gap-3 text-sm font-normal">
                <span className="text-muted-foreground">Bật</span>
                <Switch
                  checked={plan.enabled}
                  onChange={(v) => patchPlan(pi, { enabled: v })}
                />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Tên hiển thị</Label>
                <Input
                  value={plan.label}
                  onChange={(e) => patchPlan(pi, { label: e.target.value })}
                />
              </div>
              <div>
                <Label>CK thanh toán r (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={plan.payment_discount_pct}
                  onChange={(e) =>
                    patchPlan(pi, {
                      payment_discount_pct: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Nội dung đợt</th>
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 font-medium">%</th>
                    <th className="px-3 py-2 font-medium">Ngày</th>
                    <th className="px-3 py-2 font-medium">Trừ cọc</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {plan.schedule.map((m, mi) => {
                    const usesPct =
                      m.kind === "pct_f28" ||
                      m.kind === "balance_partial" ||
                      m.kind === "bank_70";
                    return (
                      <tr key={mi} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          <Input
                            value={m.label}
                            onChange={(e) =>
                              patchMs(pi, mi, { label: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            className="w-44"
                            value={m.kind}
                            onChange={(e) =>
                              patchMs(pi, mi, {
                                kind: e.target.value as MilestoneKind,
                              })
                            }
                          >
                            {KIND_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABELS[k]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {usesPct ? (
                            <Input
                              type="number"
                              step="0.1"
                              className="w-20"
                              value={m.pct}
                              onChange={(e) =>
                                patchMs(pi, mi, { pct: Number(e.target.value) })
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            className="w-20"
                            value={m.days_offset ?? ""}
                            onChange={(e) =>
                              patchMs(pi, mi, {
                                days_offset:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(m.deduct_deposit)}
                            onChange={(e) =>
                              patchMs(pi, mi, {
                                deduct_deposit: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeMs(pi, mi)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-danger"
                            title="Xoá đợt"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="px-3 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addMs(pi)}
                      >
                        <Plus className="h-4 w-4" /> Thêm đợt
                      </Button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          Tiến độ đợt %·GTSP sau CK; cọc trừ vào đợt 1; "Luỹ kế" tự cân về tổng.
        </span>
        <Button
          onClick={() => draft && saveMut.mutate(draft)}
          disabled={saveMut.isPending}
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "Đang lưu…" : "Lưu chính sách"}
        </Button>
      </div>
    </div>
  );
}
