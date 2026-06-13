"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  FileText,
  Map as MapIcon,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { getProject } from "@/lib/api";
import type { ProjectSection } from "@/lib/types";
import { shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { SectionEditor } from "@/components/projects/SectionEditors";
// Nhúng lại UI sẵn có (KHÔNG viết lại logic) — page component là React component thường.
import InventoryPage from "@/app/(dash)/inventory/page";
import KbPage from "@/app/(dash)/kb/page";
import { SalesPolicyTab } from "@/components/settings/SalesPolicyTab";

// 8 tab nội dung tự do (theo trang chi tiết). Mỗi tab có form + nút Lưu + Sửa bằng AI.
const CONTENT_TABS: { key: ProjectSection; label: string }[] = [
  { key: "overview", label: "Tổng quan" },
  { key: "location", label: "Vị trí" },
  { key: "training", label: "Đào tạo" },
  { key: "subzones", label: "Phân khu" },
  { key: "gallery360", label: "Ảnh 360°" },
  { key: "timeline", label: "Tiến độ" },
  { key: "news", label: "Tin tức" },
  { key: "policy", label: "Mô tả Chính sách" },
];

// Tab nhúng store sẵn có (không thuộc project_store).
const EMBED_TABS = [
  { key: "inventory", label: "Quỹ căn", icon: <Building2 className="h-4 w-4" /> },
  { key: "floorplan", label: "Mặt bằng", icon: <MapIcon className="h-4 w-4" /> },
  {
    key: "salespolicy",
    label: "Chính sách (số liệu)",
    icon: <ScrollText className="h-4 w-4" />,
  },
  { key: "rag", label: "Tài liệu RAG", icon: <BookOpen className="h-4 w-4" /> },
];

const STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "muted"
> = {
  published: "success",
  draft: "warning",
  archived: "muted",
};

export default function ProjectDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("overview");

  const { data: project, isLoading } = useQuery({
    queryKey: ["admin-project", slug],
    queryFn: () => getProject(slug),
    enabled: Boolean(slug),
  });

  const allTabs = [
    ...CONTENT_TABS.map((t) => ({ key: t.key as string, label: t.label })),
    ...EMBED_TABS,
  ];

  const activeContent = CONTENT_TABS.find((t) => t.key === tab);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Danh sách dự án
        </Link>
      </div>

      {isLoading || !project ? (
        <Skeleton className="mb-6 h-16 w-full" />
      ) : (
        <PageHeader
          title={project.name}
          description={project.tagline || project.location}
          action={
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[project.status] ?? "muted"}>
                {project.status}
              </Badge>
              <Badge variant="muted">v{project.version}</Badge>
              {project.last_updated_at && (
                <span className="text-xs text-muted-foreground">
                  Cập nhật {shortDate(project.last_updated_at)}
                </span>
              )}
            </div>
          }
        />
      )}

      <Tabs tabs={allTabs} value={tab} onChange={setTab} className="mb-5" />

      {/* Tab nội dung tự do */}
      {activeContent &&
        (isLoading || !project ? (
          <Card className="p-6">
            <Skeleton className="h-40 w-full" />
          </Card>
        ) : (
          <Card className="p-5">
            <SectionEditor
              key={activeContent.key}
              slug={slug}
              section={activeContent.key}
              content={project.content}
              onSaved={() => {
                // làm tươi badge phiên bản / thời gian cập nhật
                qc.invalidateQueries({ queryKey: ["admin-project", slug] });
                qc.invalidateQueries({ queryKey: ["admin-projects"] });
              }}
            />
          </Card>
        ))}

      {/* Tab nhúng — tái dùng nguyên giao diện sẵn có */}
      {tab === "inventory" && <InventoryPage />}
      {tab === "floorplan" && <InventoryPage />}
      {tab === "rag" && <KbPage />}
      {tab === "salespolicy" && (
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4" />
              Chính sách bán hàng (số liệu giá)
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cấu hình phiếu tính giá dùng chung — sửa tại đây áp dụng toàn hệ
              thống.
            </p>
          </div>
          <SalesPolicyTab />
        </Card>
      )}
    </div>
  );
}
