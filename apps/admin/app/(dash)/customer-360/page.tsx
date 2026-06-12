"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, UserSearch } from "lucide-react";

import { listAllCrmLeads } from "@/lib/api";
import type { CrmLead } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Customer360 } from "@/components/crm/Customer360";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
  customer: "Khách hàng",
  lost: "Đã mất",
};
const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "muted"> = {
  cold: "default",
  warm: "warning",
  hot: "danger",
  customer: "success",
  lost: "muted",
};

const MAX_RESULTS = 30;

/**
 * Customer 360 — lối vào riêng: tìm/chọn 1 khách (theo tên/SĐT/email) rồi hiển
 * thị hồ sơ 360° đầy đủ (tái dùng <Customer360/>). Chưa chọn khách thì hiện ô
 * tìm + hướng dẫn. Dùng chung cache ["crm-leads"] với trang Khách hàng.
 */
export default function Customer360Page() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CrmLead | null>(null);

  const leadsQ = useQuery({
    queryKey: ["crm-leads"],
    queryFn: () => listAllCrmLeads(),
  });

  const results = useMemo(() => {
    const list = leadsQ.data?.items ?? [];
    const query = q.trim().toLowerCase();
    if (!query) return list.slice(0, MAX_RESULTS);
    return list
      .filter(
        (l) =>
          l.name.toLowerCase().includes(query) ||
          l.phone.includes(query) ||
          (l.email ?? "").toLowerCase().includes(query),
      )
      .slice(0, MAX_RESULTS);
  }, [leadsQ.data, q]);

  return (
    <div>
      <PageHeader
        title="Customer 360"
        description="Tra cứu nhanh hồ sơ 360° của một khách bất kỳ — tìm theo tên, SĐT hoặc email."
      />

      {selected ? (
        <>
          <div className="mb-3">
            <button
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Chọn khách khác
            </button>
          </div>
          <ErrorBoundary>
            <Customer360 leadId={selected.id} />
          </ErrorBoundary>
        </>
      ) : (
        <Card className="p-5">
          <div className="relative mb-4 w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm tên, SĐT, email…"
              className="pl-9"
              autoFocus
            />
          </div>

          {leadsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : leadsQ.isError ? (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-4 text-sm">
              <p className="text-danger">
                Không tải được danh sách khách: {(leadsQ.error as Error)?.message ?? "Đã xảy ra lỗi."}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => leadsQ.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <UserSearch className="h-8 w-8 text-muted-foreground/60" />
              <p>
                {q.trim()
                  ? "Không tìm thấy khách phù hợp."
                  : "Nhập tên, SĐT hoặc email để tìm khách, rồi chọn để xem hồ sơ 360°."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {results.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => setSelected(l)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.name}</span>
                        <Badge variant={STATUS_VARIANT[l.status] ?? "muted"}>
                          {STATUS_LABEL[l.status] ?? l.status}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {l.phone}
                        {l.email ? ` · ${l.email}` : ""}
                        {l.last_contact_at ? ` · LH gần nhất ${shortDate(l.last_contact_at)}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-primary">AI {l.ai_score}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!leadsQ.isLoading && !leadsQ.isError && results.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Hiển thị tối đa {MAX_RESULTS} kết quả. Gõ thêm để thu hẹp tìm kiếm.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
