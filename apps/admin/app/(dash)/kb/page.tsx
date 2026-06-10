"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  deleteLearningDocument,
  downloadLearningDocument,
  getKbStats,
  listLearningDocuments,
  reindexKb,
  viewLearningDocument,
} from "@/lib/api";
import type { LearningDocument } from "@/lib/types";
import { formatNumber, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { DriveSyncCard } from "@/components/kb/DriveSyncCard";
import { UploadZone } from "@/components/kb/UploadZone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

const CATEGORY_LABEL: Record<string, string> = {
  policy: "Chính sách",
  pricing: "Bảng giá",
  contract: "Hợp đồng / Pháp lý",
  brochure: "Tài liệu giới thiệu",
  training: "Đào tạo",
  master_plan: "Bản đồ / Phân khu",
  units: "Thiết kế căn",
  legal: "Pháp lý / Giấy phép",
  media: "Hình ảnh / Video",
  other: "Khác",
};

const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả" },
  ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
];

const TABS = [
  { key: "docs", label: "Tài liệu", icon: <FileText className="h-4 w-4" /> },
  {
    key: "index",
    label: "Tình trạng index",
    icon: <Database className="h-4 w-4" />,
  },
];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function KbPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("docs");
  const [category, setCategory] = useState<string>("");
  const [group, setGroup] = useState<string>("");
  const [confirmDoc, setConfirmDoc] = useState<LearningDocument | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ["kb-stats"],
    queryFn: getKbStats,
  });

  const docsQuery = useQuery({
    queryKey: ["kb-docs", category, group],
    queryFn: () =>
      listLearningDocuments(category || undefined, group || undefined),
  });

  // Query phụ (không lọc) để liệt kê các nhóm Drive sẵn có cho dropdown filter.
  const allDocsQuery = useQuery({
    queryKey: ["kb-docs-all"],
    queryFn: () => listLearningDocuments(),
  });
  const groupOptions = Array.from(
    new Set(
      (allDocsQuery.data ?? [])
        .map((d) => d.group)
        .filter((g): g is string => Boolean(g)),
    ),
  ).sort();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["kb-docs"] });
    qc.invalidateQueries({ queryKey: ["kb-docs-all"] });
    qc.invalidateQueries({ queryKey: ["kb-stats"] });
  };

  const handleDownload = async (d: LearningDocument) => {
    try {
      await downloadLearningDocument(d);
    } catch (e) {
      setBanner((e as Error).message || "Tải tài liệu thất bại — thử lại sau.");
    }
  };

  const handleView = async (d: LearningDocument) => {
    try {
      await viewLearningDocument(d);
    } catch (e) {
      setBanner((e as Error).message || "Mở tài liệu thất bại — thử lại sau.");
    }
  };

  const reindexMut = useMutation({
    mutationFn: reindexKb,
    onSuccess: (res) => {
      invalidateAll();
      setBanner(
        `Re-index xong: ${formatNumber(res.documents)} tài liệu, ${formatNumber(
          res.chunks,
        )} đoạn.`,
      );
    },
    onError: () => setBanner("Re-index thất bại — thử lại sau."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteLearningDocument(id),
    onSuccess: () => {
      invalidateAll();
      setConfirmDoc(null);
    },
  });

  const stats = statsQuery.data;
  const docs = docsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Tài liệu RAG"
        description="Kho tri thức (Knowledge Base) cho AI agent: tải lên tài liệu và re-index BM25."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                statsQuery.refetch();
                docsQuery.refetch();
              }}
              disabled={statsQuery.isFetching || docsQuery.isFetching}
            >
              <RefreshCw
                className={
                  statsQuery.isFetching || docsQuery.isFetching
                    ? "h-4 w-4 animate-spin"
                    : "h-4 w-4"
                }
              />
              Làm mới
            </Button>
            <Button
              size="sm"
              onClick={() => reindexMut.mutate()}
              disabled={reindexMut.isPending}
            >
              <Database className="h-4 w-4" />
              {reindexMut.isPending ? "Đang re-index…" : "Re-index toàn bộ"}
            </Button>
          </div>
        }
      />

      {banner && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>{banner}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Khối thống kê */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Tổng tài liệu"
          loading={statsQuery.isLoading}
          value={stats ? formatNumber(stats.total_documents) : "—"}
        />
        <StatCard
          label="Đã index"
          loading={statsQuery.isLoading}
          value={stats ? formatNumber(stats.indexed_documents) : "—"}
        />
        <StatCard
          label="Tổng số đoạn (chunks)"
          loading={statsQuery.isLoading}
          value={stats ? formatNumber(stats.total_chunks) : "—"}
        />
        <StatCard
          label="Lần index gần nhất"
          loading={statsQuery.isLoading}
          value={
            stats?.last_indexed_at ? shortDate(stats.last_indexed_at) : "—"
          }
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-4" />

      {tab === "docs" ? (
        <>
          <DriveSyncCard onSynced={invalidateAll} />
          <UploadZone onUploaded={invalidateAll} />

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="sm:w-64">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORY_FILTERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:w-64">
              <Select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">Tất cả nhóm (thư mục Drive)</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Tiêu đề</th>
                    <th className="px-4 py-3 font-medium">Nhóm</th>
                    <th className="px-4 py-3 font-medium">Nhóm Drive</th>
                    <th className="px-4 py-3 font-medium">Định dạng</th>
                    <th className="px-4 py-3 font-medium">Kích thước</th>
                    <th className="px-4 py-3 font-medium">Số đoạn</th>
                    <th className="px-4 py-3 font-medium">Đã index</th>
                    <th className="px-4 py-3 font-medium">Người tải</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docsQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-4 py-3" colSpan={9}>
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : docs.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-muted-foreground"
                        colSpan={9}
                      >
                        Chưa có tài liệu. Hãy tải lên tài liệu đầu tiên.
                      </td>
                    </tr>
                  ) : (
                    docs.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 font-medium">{d.title}</td>
                        <td className="px-4 py-3">
                          <Badge variant="muted">
                            {CATEGORY_LABEL[d.category] ?? d.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.group ? (
                            <Badge variant="default">{d.group}</Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 uppercase text-muted-foreground">
                          {d.type}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatSize(d.size)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatNumber(d.chunks)}
                        </td>
                        <td className="px-4 py-3">
                          {d.indexed ? (
                            <Badge variant="success">Đã index</Badge>
                          ) : (
                            <Badge variant="muted">Chưa</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.uploaded_by ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleView(d)}
                              title="Xem"
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownload(d)}
                              title="Tải xuống"
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              title="Xoá"
                              onClick={() => setConfirmDoc(d)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <IndexView
          stats={stats}
          loading={statsQuery.isLoading}
          reindexing={reindexMut.isPending}
          onReindex={() => reindexMut.mutate()}
        />
      )}

      <Dialog open={Boolean(confirmDoc)} onClose={() => setConfirmDoc(null)}>
        <DialogHeader
          title="Xoá tài liệu?"
          description="Tài liệu sẽ bị gỡ khỏi kho tri thức. Hãy re-index sau khi xoá để cập nhật chỉ mục."
          onClose={() => setConfirmDoc(null)}
        />
        <DialogBody>
          <p className="text-sm">
            Bạn chắc chắn muốn xoá <b>{confirmDoc?.title}</b>?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDoc(null)}>
            Huỷ
          </Button>
          <Button
            variant="danger"
            disabled={deleteMut.isPending}
            onClick={() => confirmDoc && deleteMut.mutate(confirmDoc.id)}
          >
            {deleteMut.isPending ? "Đang xoá…" : "Xoá tài liệu"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      )}
    </Card>
  );
}

function IndexView({
  stats,
  loading,
  reindexing,
  onReindex,
}: {
  stats: import("@/lib/types").KbStats | undefined;
  loading: boolean;
  reindexing: boolean;
  onReindex: () => void;
}) {
  const byCategory = stats?.by_category ?? {};
  const entries = Object.entries(byCategory);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Phân bố theo nhóm</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nhóm</th>
                <th className="px-4 py-3 text-right font-medium">Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={2}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-muted-foreground"
                    colSpan={2}
                  >
                    Chưa có dữ liệu.
                  </td>
                </tr>
              ) : (
                entries.map(([cat, count]) => (
                  <tr
                    key={cat}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Badge variant="muted">
                        {CATEGORY_LABEL[cat] ?? cat}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatNumber(count)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-semibold">Chỉ mục tìm kiếm</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Re-index sẽ build lại chỉ mục BM25 từ toàn bộ tài liệu trong kho tri
            thức. Hãy chạy sau khi tải lên hoặc xoá tài liệu.
          </p>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Đã index</dt>
            <dd className="font-medium">
              {loading || !stats
                ? "—"
                : `${formatNumber(stats.indexed_documents)} / ${formatNumber(
                    stats.total_documents,
                  )}`}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Tổng số đoạn (chunks)</dt>
            <dd className="font-medium">
              {loading || !stats ? "—" : formatNumber(stats.total_chunks)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Lần index gần nhất</dt>
            <dd className="font-medium">
              {stats?.last_indexed_at ? shortDate(stats.last_indexed_at) : "—"}
            </dd>
          </div>
        </dl>

        <Button
          className="w-full"
          onClick={onReindex}
          disabled={reindexing}
        >
          <Database className="h-4 w-4" />
          {reindexing ? "Đang re-index…" : "Re-index toàn bộ"}
        </Button>
      </Card>
    </div>
  );
}
