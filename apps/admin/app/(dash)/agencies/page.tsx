"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  approveAgency,
  listAgencyApplications,
  rejectAgency,
} from "@/lib/api";
import type { Agency, AgencyStatus } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const FILTERS: { key: "all" | AgencyStatus; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "pending", label: "Chờ duyệt" },
  { key: "active", label: "Đã duyệt (F2)" },
  { key: "rejected", label: "Từ chối" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  active: "Đã duyệt (F2)",
  rejected: "Từ chối",
};

export default function AgenciesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["agencies"],
    queryFn: () => listAgencyApplications(),
  });

  const [filter, setFilter] = useState<"all" | AgencyStatus>("all");
  const [detail, setDetail] = useState<Agency | null>(null);
  const [note, setNote] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["agencies"] });

  const approveMut = useMutation({
    mutationFn: (vars: { id: string; note?: string }) =>
      approveAgency(vars.id, vars.note),
    onSuccess: (a) => {
      invalidate();
      setDetail(null);
      setNote("");
      setBanner(
        a.commission_tier === "f2_80"
          ? `Đã duyệt "${a.ten_san}" làm đại lý F2 — hoa hồng 80%.`
          : `Đã duyệt "${a.ten_san}" (chưa đủ điều kiện F2 — giữ mức cơ bản).`,
      );
    },
    onError: (e) => setBanner((e as Error).message || "Duyệt thất bại."),
  });

  const rejectMut = useMutation({
    mutationFn: (vars: { id: string; note?: string }) =>
      rejectAgency(vars.id, vars.note),
    onSuccess: (a) => {
      invalidate();
      setDetail(null);
      setNote("");
      setBanner(`Đã từ chối "${a.ten_san}".`);
    },
    onError: (e) => setBanner((e as Error).message || "Từ chối thất bại."),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (filter === "all") return list;
    return list.filter((a) => a.status === filter);
  }, [data, filter]);

  const busy = approveMut.isPending || rejectMut.isPending;

  return (
    <div>
      <PageHeader
        title="Đại lý F2"
        description="Duyệt hồ sơ đăng ký đại lý phân phối (sàn cấp dưới). Duyệt khi đủ điều kiện để cấp mức hoa hồng 80%."
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

      {banner ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>{banner}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tên sàn</th>
                <th className="px-4 py-3 font-medium">Người đại diện</th>
                <th className="px-4 py-3 font-medium">Liên hệ</th>
                <th className="px-4 py-3 font-medium">Đội sale</th>
                <th className="px-4 py-3 font-medium">Điều kiện</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Ngày tạo</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
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
                    Chưa có hồ sơ đại lý nào.
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{a.ten_san}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.nguoi_dai_dien ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.phone ?? a.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.progress.sales_count}/{a.progress.sales_required}
                    </td>
                    <td className="px-4 py-3">
                      {a.eligible ? (
                        <Badge variant="success">Đủ điều kiện</Badge>
                      ) : (
                        <Badge variant="muted">Chưa đủ</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.status === "active" ? (
                        <Badge variant="success">
                          F2 ·{" "}
                          {a.commission_tier === "f2_80"
                            ? "80%"
                            : "cơ bản"}
                        </Badge>
                      ) : a.status === "rejected" ? (
                        <Badge variant="danger">Từ chối</Badge>
                      ) : a.submitted_for_review ? (
                        <Badge variant="default">Đã gửi duyệt</Badge>
                      ) : (
                        <Badge variant="muted">Đang khai báo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {shortDate(a.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title="Xem hồ sơ"
                          onClick={() => {
                            setDetail(a);
                            setNote("");
                          }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          title="Duyệt"
                          disabled={busy || a.status === "active"}
                          onClick={() => approveMut.mutate({ id: a.id })}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-success disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          title="Từ chối"
                          disabled={busy || a.status === "rejected"}
                          onClick={() => rejectMut.mutate({ id: a.id })}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <X className="h-4 w-4" />
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

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)}>
        <DialogHeader
          title={detail ? detail.ten_san : "Hồ sơ đại lý"}
          description="Hồ sơ điều kiện đại lý F2 do chủ sàn khai báo."
          onClose={() => setDetail(null)}
        />
        <DialogBody>
          {detail ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Người đại diện" value={detail.nguoi_dai_dien} />
                <Field label="SĐT" value={detail.phone} />
                <Field label="Email" value={detail.email} />
                <Field
                  label="Mức hoa hồng"
                  value={
                    detail.commission_tier === "f2_80"
                      ? "F2 — 80%"
                      : "Cơ bản"
                  }
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Thông tin doanh nghiệp
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                  <Field label="Tên DN" value={detail.business_info?.ten_dn} />
                  <Field
                    label="Mã số thuế"
                    value={detail.business_info?.ma_so_thue}
                  />
                  <Field
                    label="Địa chỉ"
                    value={detail.business_info?.dia_chi}
                  />
                  <Field
                    label="Đại diện pháp luật"
                    value={detail.business_info?.nguoi_dai_dien_phap_luat}
                  />
                  <Field
                    label="Cam kết môi giới"
                    value={detail.brokerage_declared ? "Có" : "Chưa"}
                  />
                  <Field label="Số GPKD" value={detail.gpkd_so} />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Đội sale ({detail.sales.length})
                </div>
                {detail.sales.length === 0 ? (
                  <p className="text-muted-foreground">Chưa khai báo sale.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {detail.sales.map((s, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-x-3 px-3 py-2"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">
                          {s.phone ?? ""}
                        </span>
                        <span className="text-muted-foreground">
                          {s.email ?? ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                {detail.eligible ? (
                  <span className="text-success">
                    Đủ điều kiện F2 — duyệt sẽ cấp mức hoa hồng 80%.
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Chưa đủ điều kiện F2 (cần đủ thông tin DN + cam kết môi giới +{" "}
                    {detail.progress.sales_required} sale). Vẫn có thể duyệt nhưng
                    giữ mức cơ bản.
                  </span>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Ghi chú duyệt (tuỳ chọn)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="danger"
            disabled={busy || detail?.status === "rejected"}
            onClick={() =>
              detail &&
              rejectMut.mutate({ id: detail.id, note: note.trim() || undefined })
            }
          >
            {rejectMut.isPending ? "Đang từ chối…" : "Từ chối"}
          </Button>
          <Button
            disabled={busy || detail?.status === "active"}
            onClick={() =>
              detail &&
              approveMut.mutate({ id: detail.id, note: note.trim() || undefined })
            }
          >
            {approveMut.isPending ? "Đang duyệt…" : "Duyệt"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value ? value : "—"}</div>
    </div>
  );
}
