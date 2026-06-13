"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderKanban, RefreshCw } from "lucide-react";
import Link from "next/link";

import { listProjects } from "@/lib/api";
import { shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "muted"
> = {
  published: "success",
  draft: "warning",
  archived: "muted",
};

export default function ProjectsPage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: listProjects,
  });

  const projects = data ?? [];

  return (
    <div>
      <PageHeader
        title="Dự án"
        description="Quản lý nội dung trang dự án (CMS): nội dung marketing, quỹ căn, mặt bằng, tài liệu RAG, chính sách."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Làm mới
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tên dự án</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Phiên bản</th>
                <th className="px-4 py-3 font-medium">Cập nhật</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : projects.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    Chưa có dự án nào.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr
                    key={p.slug}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${p.slug}`}
                        className="flex items-center gap-2 font-medium text-foreground hover:text-primary"
                      >
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.slug}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[p.status] ?? "muted"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      v{p.version}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.last_updated_at ? shortDate(p.last_updated_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Link
                          href={`/projects/${p.slug}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-primary hover:bg-accent"
                        >
                          Mở
                          <ChevronRight className="h-4 w-4" />
                        </Link>
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
