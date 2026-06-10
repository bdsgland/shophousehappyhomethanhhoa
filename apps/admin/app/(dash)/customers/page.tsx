"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Eye,
  Flame,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCog,
  Users2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  assignCrmLead,
  autoDistributeHotLeads,
  getCrmStats,
  listCrmLeads,
  listSales,
  markCrmLeadHot,
  rescoreAllLeads,
  softDeleteCrmLead,
} from "@/lib/api";
import type { CrmLead } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/kpi/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
  customer: "Khách hàng",
  lost: "Đã mất",
};
const SOURCE_LABEL: Record<string, string> = {
  imported: "Danh bạ",
  registered: "Tự đăng ký",
  referral: "Giới thiệu",
  fb_ads: "FB Ads",
  zalo: "Zalo",
  email: "Email",
  manual: "Nhập tay",
};
const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "muted"> = {
  cold: "default",
  warm: "warning",
  hot: "danger",
  customer: "success",
  lost: "muted",
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "cold", label: "Lạnh" },
  { key: "warm", label: "Ấm" },
  { key: "hot", label: "Nóng" },
  { key: "customer", label: "Khách hàng" },
  { key: "lost", label: "Đã mất" },
];

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const qc = useQueryClient();
  const statsQ = useQuery({ queryKey: ["crm-stats"], queryFn: getCrmStats });
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: listSales });
  const leadsQ = useQuery({
    queryKey: ["crm-leads"],
    queryFn: () => listCrmLeads({ page_size: 500 }),
  });

  const [status, setStatus] = useState("all");
  const [saleId, setSaleId] = useState("all");
  const [source, setSource] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [reassign, setReassign] = useState<CrmLead | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [confirmDel, setConfirmDel] = useState<CrmLead | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
    qc.invalidateQueries({ queryKey: ["crm-stats"] });
  };

  const assignMut = useMutation({
    mutationFn: ({ id, sale }: { id: string; sale: string }) => assignCrmLead(id, sale),
    onSuccess: () => {
      invalidate();
      setReassign(null);
      setReassignTo("");
    },
  });
  const hotMut = useMutation({
    mutationFn: (id: string) => markCrmLeadHot(id),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => softDeleteCrmLead(id),
    onSuccess: () => {
      invalidate();
      setConfirmDel(null);
    },
  });
  const distributeMut = useMutation({
    mutationFn: () => autoDistributeHotLeads(),
    onSuccess: (res) => {
      invalidate();
      setBanner(`Đã phân bổ ${res.distributed} khách nét cho các sale top.`);
    },
  });
  const rescoreAllMut = useMutation({
    mutationFn: () => rescoreAllLeads({ scope: "all" }),
    onSuccess: (res) => {
      invalidate();
      setBanner(`AI đã chấm điểm lại ${res.scored} khách hàng.`);
    },
  });

  const sales = salesQ.data?.sales ?? [];
  const saleName = (id: string | null) =>
    id ? sales.find((s) => s.id === id)?.full_name ?? id.slice(0, 8) : "—";

  const filtered = useMemo(() => {
    let list = leadsQ.data?.items ?? [];
    if (status !== "all") list = list.filter((l) => l.status === status);
    if (saleId !== "all") list = list.filter((l) => l.assigned_sale_id === saleId);
    if (source !== "all") list = list.filter((l) => l.source === source);
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(query) ||
          l.phone.includes(query) ||
          (l.email ?? "").toLowerCase().includes(query),
      );
    }
    return list;
  }, [leadsQ.data, status, saleId, source, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function exportCsv() {
    const header = "name,phone,email,source,status,ai_score,assigned_sale,created_at";
    const lines = filtered.map((l) =>
      [
        l.name,
        l.phone,
        l.email ?? "",
        l.source,
        l.status,
        l.ai_score,
        saleName(l.assigned_sale_id),
        l.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = statsQ.data;

  return (
    <div>
      <PageHeader
        title="Khách hàng"
        description="CRM tổng — toàn bộ khách của hệ thống, phân bổ & theo dõi hot lead."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => leadsQ.refetch()}
              disabled={leadsQ.isFetching}
            >
              <RefreshCw className={leadsQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Làm mới
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Xuất CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => rescoreAllMut.mutate()}
              disabled={rescoreAllMut.isPending}
            >
              <Sparkles className={rescoreAllMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              {rescoreAllMut.isPending ? "Đang chấm…" : "Chấm điểm lại toàn bộ (AI)"}
            </Button>
            <Button
              size="sm"
              onClick={() => distributeMut.mutate()}
              disabled={distributeMut.isPending}
            >
              <Zap className="h-4 w-4" />
              {distributeMut.isPending ? "Đang phân bổ…" : "Phân bổ hot lead"}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tổng khách"
          value={stats?.total_leads ?? 0}
          icon={Users2}
          loading={statsQ.isLoading}
        />
        <StatCard
          label="Khách nét (hot)"
          value={stats?.hot_leads ?? 0}
          icon={Flame}
          accent="danger"
          loading={statsQ.isLoading}
        />
        <StatCard
          label="Đã chốt (customer)"
          value={stats?.customers ?? 0}
          icon={UserCog}
          accent="success"
          loading={statsQ.isLoading}
        />
        <StatCard
          label="Tỉ lệ chuyển đổi"
          value={`${stats?.conversion_rate ?? 0}%`}
          icon={Zap}
          accent="warning"
          hint="customer / (tổng − đã mất)"
          loading={statsQ.isLoading}
        />
      </div>

      {banner && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                status === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={saleId}
            onChange={(e) => {
              setSaleId(e.target.value);
              setPage(1);
            }}
            className="h-9 w-40"
          >
            <option value="all">Tất cả sale</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
          <Select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
            className="h-9 w-36"
          >
            <option value="all">Mọi nguồn</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <div className="relative w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên, SĐT, email…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tên</th>
                <th className="px-4 py-3 font-medium">SĐT</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Nguồn</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 text-center font-medium">AI</th>
                <th className="px-4 py-3 font-medium">Sale</th>
                <th className="px-4 py-3 font-medium">Đánh dấu hot</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {leadsQ.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={9}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={9}>
                    Không có khách hàng phù hợp.
                  </td>
                </tr>
              ) : (
                rows.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{l.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {SOURCE_LABEL[l.source] ?? l.source}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[l.status] ?? "muted"}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold">{l.ai_score}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {saleName(l.assigned_sale_id)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {l.hot_marker_at ? shortDate(l.hot_marker_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/customers/${l.id}`} title="Xem chi tiết">
                          <IconBtn title="Xem">
                            <Eye className="h-4 w-4" />
                          </IconBtn>
                        </Link>
                        <IconBtn
                          title="Chuyển sale"
                          onClick={() => {
                            setReassign(l);
                            setReassignTo(l.assigned_sale_id ?? "");
                          }}
                        >
                          <UserCog className="h-4 w-4" />
                        </IconBtn>
                        {l.status !== "hot" && (
                          <IconBtn title="Đánh dấu hot" onClick={() => hotMut.mutate(l.id)}>
                            <Flame className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {l.status !== "lost" && (
                          <IconBtn title="Xoá mềm (đã mất)" danger onClick={() => setConfirmDel(l)}>
                            <Trash2 className="h-4 w-4" />
                          </IconBtn>
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

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Hiển thị {rows.length}/{filtered.length} khách (trang {safePage}/{totalPages}).
        </span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Trước
          </Button>
          <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      </div>

      {/* Reassign modal */}
      <Dialog open={Boolean(reassign)} onClose={() => setReassign(null)}>
        <DialogHeader title="Chuyển sale phụ trách" onClose={() => setReassign(null)} />
        <DialogBody>
          <p className="text-sm">
            Khách: <b>{reassign?.name}</b> ({reassign?.phone})
          </p>
          <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            <option value="">— Chọn sale —</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReassign(null)}>
            Huỷ
          </Button>
          <Button
            disabled={!reassignTo || assignMut.isPending}
            onClick={() => reassign && assignMut.mutate({ id: reassign.id, sale: reassignTo })}
          >
            {assignMut.isPending ? "Đang lưu…" : "Chuyển"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Confirm soft delete */}
      <Dialog open={Boolean(confirmDel)} onClose={() => setConfirmDel(null)}>
        <DialogHeader
          title="Đánh dấu khách đã mất?"
          description="Khách sẽ chuyển trạng thái 'Đã mất' (xoá mềm, không xoá dữ liệu)."
          onClose={() => setConfirmDel(null)}
        />
        <DialogBody>
          <p className="text-sm">
            Xác nhận với <b>{confirmDel?.name}</b> ({confirmDel?.phone})?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDel(null)}>
            Huỷ
          </Button>
          <Button variant="danger" disabled={delMut.isPending} onClick={() => confirmDel && delMut.mutate(confirmDel.id)}>
            {delMut.isPending ? "Đang lưu…" : "Xác nhận"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
