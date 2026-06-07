"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";

import {
  approveCommission,
  listCommissions,
  markCommissionPaid,
} from "@/lib/api";
import type { CommissionRow } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const TIER_LABEL: Record<string, string> = {
  frontline: "Trực tiếp",
  leader: "Trưởng nhóm",
  manager: "Quản lý",
  director: "Giám đốc",
  company: "Công ty",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "paid", label: "Đã trả" },
];

function tierLabel(role: string): string {
  return TIER_LABEL[role] ?? role;
}

function StatusBadge({ status }: { status: CommissionRow["status"] }) {
  if (status === "pending") return <Badge variant="warning">Chờ duyệt</Badge>;
  if (status === "approved") return <Badge variant="default">Đã duyệt</Badge>;
  return <Badge variant="success">Đã trả</Badge>;
}

export function CommissionTable() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-commissions", status],
    queryFn: () => listCommissions(status ? { status } : undefined),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-commissions"] });

  const approveMut = useMutation({
    mutationFn: (dealId: string) => approveCommission(dealId),
    onSuccess: invalidate,
  });
  const payMut = useMutation({
    mutationFn: (dealId: string) => markCommissionPaid(dealId),
    onSuccess: invalidate,
  });

  const records = data?.records ?? [];
  const totalCommission = data?.total_commission ?? 0;
  const count = data?.count ?? 0;

  function exportCsv() {
    const header = [
      "Mã deal",
      "Giá trị deal",
      "Sale",
      "Bậc",
      "Người nhận",
      "%",
      "Hoa hồng",
      "Trạng thái",
    ];
    const statusVN: Record<CommissionRow["status"], string> = {
      pending: "Chờ duyệt",
      approved: "Đã duyệt",
      paid: "Đã trả",
    };
    const lines = records.map((r) =>
      [
        r.deal_id,
        r.deal_amount,
        r.sale_name,
        tierLabel(r.tier_role),
        r.recipient,
        r.pct,
        r.commission_amount,
        statusVN[r.status],
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoa-hong-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-44"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          <span className="text-sm text-muted-foreground">
            {formatNumber(count)} bản ghi
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            Tổng hoa hồng: {formatNumber(totalCommission)} ₫
          </span>
          {records.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Xuất Excel/CSV
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Mã deal</th>
                <th className="px-4 py-3 text-right font-medium">Giá trị deal</th>
                <th className="px-4 py-3 font-medium">Sale</th>
                <th className="px-4 py-3 font-medium">Bậc</th>
                <th className="px-4 py-3 font-medium">Người nhận</th>
                <th className="px-4 py-3 text-right font-medium">%</th>
                <th className="px-4 py-3 text-right font-medium">Hoa hồng</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={9}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={9}
                  >
                    Chưa có bản ghi hoa hồng. Khi có giao dịch chốt, n8n sẽ tự
                    đẩy về.
                  </td>
                </tr>
              ) : (
                records.map((r, i) => (
                  <tr
                    key={`${r.deal_id}-${r.tier_role}-${i}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{r.deal_id}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatNumber(r.deal_amount)} ₫
                    </td>
                    <td className="px-4 py-3">{r.sale_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tierLabel(r.tier_role)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.recipient}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(r.pct)}%
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatNumber(r.commission_amount)} ₫
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={approveMut.isPending}
                            onClick={() => approveMut.mutate(r.deal_id)}
                          >
                            Duyệt
                          </Button>
                        )}
                        {r.status === "approved" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={payMut.isPending}
                            onClick={() => payMut.mutate(r.deal_id)}
                          >
                            Đánh dấu đã trả
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
