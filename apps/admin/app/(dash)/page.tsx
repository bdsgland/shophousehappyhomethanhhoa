"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Building2,
  FileSignature,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";

import { getDashboardKpi, listUsers } from "@/lib/api";
import { formatNumber, formatTy } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/kpi/StatCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadTrendChart } from "@/components/charts/LeadTrendChart";
import { InventoryChart } from "@/components/charts/InventoryChart";

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  sale: "Sale",
  client: "Khách hàng",
};

export default function DashboardPage() {
  const kpiQuery = useQuery({
    queryKey: ["dashboard-kpi"],
    queryFn: getDashboardKpi,
  });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const kpi = kpiQuery.data;
  const loading = kpiQuery.isLoading;

  const byRole = kpi?.users_by_role ?? {};
  const roleHint = Object.entries(byRole)
    .map(([r, n]) => `${ROLE_LABEL[r] ?? r}: ${n}`)
    .join(" · ");

  const latestUsers = (usersQuery.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Bức tranh toàn hệ thống ELC theo thời gian thực."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              kpiQuery.refetch();
              usersQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        }
      />

      {kpiQuery.isError && (
        <div className="mb-6 rounded-md bg-danger/10 p-4 text-sm text-danger">
          Không tải được số liệu KPI: {(kpiQuery.error as Error).message}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lead mới hôm nay"
          value={formatNumber(kpi?.lead_today ?? 0)}
          icon={UserPlus}
          hint={`Tổng ${formatNumber(kpi?.lead_total ?? 0)} lead`}
          accent="primary"
          loading={loading}
        />
        <StatCard
          label="Tổng người dùng"
          value={formatNumber(kpi?.users_total ?? 0)}
          icon={Users}
          hint={roleHint || "—"}
          accent="success"
          loading={loading}
        />
        <StatCard
          label="Đơn đặt cọc"
          value={formatNumber(kpi?.orders_this_month ?? 0)}
          icon={FileSignature}
          hint="Đang giữ chỗ"
          accent="warning"
          loading={loading}
        />
        <StatCard
          label="Doanh thu dự kiến"
          value={formatTy(kpi?.revenue_projection_ty ?? 0)}
          icon={Banknote}
          hint={
            kpi?.commission_rate
              ? `Hoa hồng ước tính (${(kpi.commission_rate * 100)
                  .toFixed(1)
                  .replace(/\.0$/, "")}%)`
              : "Hoa hồng ước tính"
          }
          accent="primary"
          loading={loading}
        />
      </div>

      {/* Charts + feed */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lead 30 ngày qua</CardTitle>
              <CardDescription>
                Số lead phát sinh mỗi ngày trên toàn hệ thống.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <LeadTrendChart data={kpi?.lead_trend ?? []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Cơ cấu quỹ căn</CardTitle>
                {kpi?.inventory.is_demo && (
                  <Badge variant="warning">Dữ liệu mẫu</Badge>
                )}
              </div>
              <CardDescription>
                {kpi
                  ? kpi.inventory.is_demo
                    ? "Chưa đồng bộ quỹ căn thật từ Google Sheets — đang hiển thị dữ liệu mẫu."
                    : `${formatNumber(kpi.inventory.total)} căn — còn ${formatNumber(
                        kpi.inventory.available,
                      )}, cọc ${formatNumber(kpi.inventory.reserved)}, đã bán ${formatNumber(
                        kpi.inventory.sold,
                      )}`
                  : "Đang tải…"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading || !kpi ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <InventoryChart
                  available={kpi.inventory.available}
                  reserved={kpi.inventory.reserved}
                  sold={kpi.inventory.sold}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feed bên phải */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Đăng ký mới nhất</CardTitle>
              <CardDescription>Tài khoản vừa tạo gần đây.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {usersQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))
              ) : latestUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
              ) : (
                latestUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {u.full_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {u.full_name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </div>
                    <Badge
                      variant={u.role === "admin" ? "default" : "muted"}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hội thoại đang mở</CardTitle>
              <CardDescription>Đồng bộ từ Chatwoot.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Tích hợp realtime Chatwoot sẽ có ở phase 2.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
