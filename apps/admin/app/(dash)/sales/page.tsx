"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Network, RefreshCw, Users } from "lucide-react";
import { useState } from "react";

import { listSales } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { CommissionTable } from "@/components/sales/CommissionTable";
import { ReferralTree } from "@/components/sales/ReferralTree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

type TabKey = "sales" | "commissions" | "tree";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "sales", label: "Danh sách Sale", icon: <Users className="h-4 w-4" /> },
  { key: "commissions", label: "Hoa hồng", icon: <Coins className="h-4 w-4" /> },
  { key: "tree", label: "Cây giới thiệu", icon: <Network className="h-4 w-4" /> },
];

export default function SalesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("sales");
  const [refreshing, setRefreshing] = useState(false);

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-sales"] }),
        qc.invalidateQueries({ queryKey: ["admin-commissions"] }),
        qc.invalidateQueries({ queryKey: ["referral-tree"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sale & Hoa hồng"
        description="Danh sách sale, hoa hồng theo 5 bậc lũy tiến và cây giới thiệu."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Làm mới
          </Button>
        }
      />

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        className="mb-4"
      />

      {tab === "sales" && <SalesList />}
      {tab === "commissions" && <CommissionTable />}
      {tab === "tree" && <ReferralTree />}
    </div>
  );
}

function SalesList() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sales"],
    queryFn: listSales,
  });

  const rows = data?.sales ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Họ tên</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">SĐT</th>
              <th className="px-4 py-3 font-medium">Mã GT</th>
              <th className="px-4 py-3 text-right font-medium">Downline</th>
              <th className="px-4 py-3 text-right font-medium">Số deal</th>
              <th className="px-4 py-3 text-right font-medium">Tổng hoa hồng</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3" colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-muted-foreground"
                  colSpan={8}
                >
                  Chưa có sale nào.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.referral_code ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(s.downline_count)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(s.total_deals)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatNumber(s.total_commission)} ₫
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <Badge variant="success">Hoạt động</Badge>
                    ) : (
                      <Badge variant="danger">Đã khoá</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
