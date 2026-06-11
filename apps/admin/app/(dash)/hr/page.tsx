"use client";

import { useQuery } from "@tanstack/react-query";
import { ListChecks, ShieldCheck, Target, Users2, Sparkles } from "lucide-react";
import { useState } from "react";

import { getHROverview } from "@/lib/api";
import { HR_ROLE_LABEL } from "@/components/hr/hr-constants";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { StaffTab } from "@/components/hr/StaffTab";
import { PermissionsTab } from "@/components/hr/PermissionsTab";
import { ObjectivesTab } from "@/components/hr/ObjectivesTab";
import { PerformanceTab } from "@/components/hr/PerformanceTab";

type TabKey = "staff" | "permissions" | "objectives" | "performance";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "staff", label: "Danh sách nhân sự", icon: <Users2 className="h-4 w-4" /> },
  { key: "permissions", label: "Phân quyền", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "objectives", label: "Mục tiêu KPI", icon: <Target className="h-4 w-4" /> },
  { key: "performance", label: "Báo cáo hiệu suất", icon: <Sparkles className="h-4 w-4" /> },
];

export default function HRPage() {
  const [tab, setTab] = useState<TabKey>("staff");
  const { data: overview } = useQuery({
    queryKey: ["hr-overview"],
    queryFn: getHROverview,
  });

  return (
    <div>
      <PageHeader
        title="Nhân sự"
        description="Quản lý nhân sự, phân quyền theo vai trò, mục tiêu KPI và đánh giá hiệu suất bằng AI."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox
          icon={<Users2 className="h-4 w-4" />}
          label="Tổng nhân sự"
          value={overview ? String(overview.staff_total) : "—"}
          sub={overview ? `${overview.staff_active} đang hoạt động` : undefined}
        />
        <StatBox
          icon={<ListChecks className="h-4 w-4" />}
          label="Mục tiêu KPI"
          value={overview ? String(overview.objectives_total) : "—"}
        />
        <StatBox
          icon={<Target className="h-4 w-4" />}
          label="Hoàn thành chung"
          value={overview ? `${overview.overall_completion_pct}%` : "—"}
        />
        <StatBox
          icon={<Sparkles className="h-4 w-4" />}
          label="Top hiệu suất"
          value={
            overview && overview.top_performers.length
              ? overview.top_performers[0].staff_name
              : "—"
          }
          sub={
            overview && overview.top_performers.length
              ? `${overview.top_performers[0].completion_pct}% · ${
                  HR_ROLE_LABEL[overview.top_performers[0].role] ??
                  overview.top_performers[0].role
                }`
              : undefined
          }
        />
      </div>

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        className="mb-5"
      />

      {tab === "staff" && <StaffTab />}
      {tab === "permissions" && <PermissionsTab />}
      {tab === "objectives" && <ObjectivesTab />}
      {tab === "performance" && <PerformanceTab />}
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 truncate text-xl font-semibold tracking-tight">
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
