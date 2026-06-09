"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";

import { getSalesPolicy, updateSalesPolicy } from "@/lib/api";
import type {
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

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
}

/** Tổng % các đợt kind="pct" (đợt cố định/cọc không tính vào %). */
function pctTotal(schedule: PolicyMilestoneCfg[]): number {
  return schedule
    .filter((m) => m.kind === "pct")
    .reduce((s, m) => s + (Number(m.pct) || 0), 0);
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
      setBanner(`Đã lưu chính sách (phiên bản v${saved.version}).`);
    },
    onError: (e) => setBanner(`Lưu thất bại: ${(e as Error).message}`),
  });

  if (isLoading || !draft) {
    return <Skeleton className="h-96 w-full" />;
  }

  const patchPlan = (i: number, patch: Partial<SalesBasePlan>) =>
    setDraft((d) => {
      if (!d) return d;
      const plans = d.base_plans.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
      return { ...d, base_plans: plans };
    });

  const patchMilestone = (
    pi: number,
    mi: number,
    patch: Partial<PolicyMilestoneCfg>,
  ) =>
    setDraft((d) => {
      if (!d) return d;
      const plans = d.base_plans.map((p, idx) => {
        if (idx !== pi) return p;
        const schedule = p.schedule.map((m, j) => (j === mi ? { ...m, ...patch } : m));
        return { ...p, schedule };
      });
      return { ...d, base_plans: plans };
    });

  const addMilestone = (pi: number) =>
    setDraft((d) => {
      if (!d) return d;
      const plans = d.base_plans.map((p, idx) =>
        idx === pi
          ? {
              ...p,
              schedule: [
                ...p.schedule,
                { label: "Đợt mới", kind: "pct", pct: 0, amount: 0 } as PolicyMilestoneCfg,
              ],
            }
          : p,
      );
      return { ...d, base_plans: plans };
    });

  const removeMilestone = (pi: number, mi: number) =>
    setDraft((d) => {
      if (!d) return d;
      const plans = d.base_plans.map((p, idx) =>
        idx === pi
          ? { ...p, schedule: p.schedule.filter((_, j) => j !== mi) }
          : p,
      );
      return { ...d, base_plans: plans };
    });

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

      {/* VAT + bảo trì */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Thuế &amp; phí</span>
            <Badge variant="muted">Phiên bản v{draft.version}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>VAT (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.vat_pct}
              onChange={(e) =>
                setDraft({ ...draft, vat_pct: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>Phí bảo trì (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.maintenance_pct}
              onChange={(e) =>
                setDraft({ ...draft, maintenance_pct: Number(e.target.value) })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Ghi chú chính sách</Label>
            <Input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ưu đãi cộng thêm */}
      <Card>
        <CardHeader>
          <CardTitle>Ưu đãi cộng thêm (addon)</CardTitle>
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
              <div className="flex items-center gap-1">
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
              </div>
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
        </CardContent>
      </Card>

      {/* Phương án thanh toán + tiến độ động */}
      {draft.base_plans.map((plan, pi) => {
        const total = pctTotal(plan.schedule);
        const ok = Math.abs(total - 100) < 0.01;
        return (
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
                  <Label>Chiết khấu gốc (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={plan.base_discount_pct}
                    onChange={(e) =>
                      patchPlan(pi, { base_discount_pct: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {/* Bảng tiến độ động */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Nội dung đợt</th>
                      <th className="px-3 py-2 font-medium">Kiểu</th>
                      <th className="px-3 py-2 font-medium">% / Số tiền</th>
                      <th className="px-3 py-2 font-medium">Tạm</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {plan.schedule.map((m, mi) => (
                      <tr key={mi} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          <Input
                            value={m.label}
                            onChange={(e) =>
                              patchMilestone(pi, mi, { label: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            className="w-36"
                            value={m.kind}
                            onChange={(e) =>
                              patchMilestone(pi, mi, {
                                kind: e.target.value as "pct" | "amount_fixed",
                              })
                            }
                          >
                            <option value="pct">% GTSP sau CK</option>
                            <option value="amount_fixed">Số tiền cố định</option>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {m.kind === "pct" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.1"
                                className="w-24"
                                value={m.pct}
                                onChange={(e) =>
                                  patchMilestone(pi, mi, {
                                    pct: Number(e.target.value),
                                  })
                                }
                              />
                              <span className="text-muted-foreground">%</span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <Input
                                type="number"
                                step="1000000"
                                className="w-40"
                                value={m.amount}
                                onChange={(e) =>
                                  patchMilestone(pi, mi, {
                                    amount: Number(e.target.value),
                                  })
                                }
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {fmtVnd(m.amount)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(m.needs_confirm)}
                            onChange={(e) =>
                              patchMilestone(pi, mi, {
                                needs_confirm: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeMilestone(pi, mi)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-danger"
                            title="Xoá đợt"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addMilestone(pi)}
                          >
                            <Plus className="h-4 w-4" /> Thêm đợt
                          </Button>
                          <span
                            className={
                              ok
                                ? "text-sm font-medium text-success"
                                : "text-sm font-semibold text-danger"
                            }
                          >
                            Tổng % các đợt: {total.toFixed(1)}%
                            {ok ? " ✓" : " — phải = 100%"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Đợt &quot;Số tiền cố định&quot; (vd đặt cọc 200tr) là khoản đặt chỗ,
                KHÔNG tính vào tổng %; khi lập phiếu nó được trừ vào (các) đợt %
                đầu tiên. % các đợt tính trên GTSP SAU chiết khấu; VAT và phí bảo
                trì hiển thị riêng.
              </p>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          Lưu ý: các tỷ lệ đợt mặc định là TẠM — hãy chỉnh theo chính sách chính
          thức của Chủ đầu tư.
        </span>
        <Button onClick={() => draft && saveMut.mutate(draft)} disabled={saveMut.isPending}>
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "Đang lưu…" : "Lưu chính sách"}
        </Button>
      </div>
    </div>
  );
}
