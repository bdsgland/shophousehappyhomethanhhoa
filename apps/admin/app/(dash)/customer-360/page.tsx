"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Search, UserSearch } from "lucide-react";

import { listAllCrmLeads } from "@/lib/api";
import type { CrmLead } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Customer360Dashboard } from "@/components/crm/Customer360Dashboard";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const SOURCE_LABEL: Record<string, string> = {
  imported: "Danh bạ",
  registered: "Tự đăng ký",
  referral: "Giới thiệu",
  fb_ads: "FB Ads",
  zalo: "Zalo",
  email: "Email",
  manual: "Nhập tay",
  google_sheet: "Google Sheet",
  file_upload: "Tải file",
};

const STATUS_DOT: Record<string, string> = {
  cold: "bg-slate-300",
  warm: "bg-amber-400",
  hot: "bg-rose-500",
  customer: "bg-emerald-500",
  lost: "bg-slate-400",
};

/**
 * Customer 360 (master–detail): cột trái là danh sách khách (tìm theo
 * tên/SĐT/email + cuộn) — chọn 1 khách thì cột phải hiện hồ sơ 360° đầy đủ
 * (<Customer360Dashboard/>). Mặc định chọn khách đầu danh sách. Dùng chung
 * cache ["crm-leads"] với trang Khách hàng. Màn nhỏ: danh sách xếp trên.
 */
export default function Customer360Page() {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leadsQ = useQuery({
    queryKey: ["crm-leads"],
    queryFn: () => listAllCrmLeads(),
  });

  const allLeads = useMemo(() => leadsQ.data?.items ?? [], [leadsQ.data]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allLeads;
    return allLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        l.phone.includes(query) ||
        (l.email ?? "").toLowerCase().includes(query),
    );
  }, [allLeads, q]);

  // Mặc định chọn khách đầu danh sách khi load xong / khi lựa chọn cũ rớt khỏi list.
  useEffect(() => {
    if (results.length === 0) return;
    if (!selectedId || !results.some((l) => l.id === selectedId)) {
      setSelectedId(results[0].id);
    }
  }, [results, selectedId]);

  const selected: CrmLead | null =
    allLeads.find((l) => l.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Customer 360"
        description="Hồ sơ 360° của khách — chọn khách bên trái để xem chân dung, pipeline, Crew AI và lịch sử chăm sóc đa kênh."
      />

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Cột danh sách trái */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm tên, SĐT, email…"
                  className="pl-9"
                />
              </div>
            </div>

            {leadsQ.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : leadsQ.isError ? (
              <div className="p-4 text-sm text-rose-600">
                Không tải được danh sách khách: {(leadsQ.error as Error)?.message}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <UserSearch className="h-7 w-7 text-muted-foreground/60" />
                <p>{q.trim() ? "Không tìm thấy khách phù hợp." : "Chưa có khách."}</p>
              </div>
            ) : (
              <ul className="max-h-[calc(100vh-220px)] divide-y divide-border overflow-y-auto">
                {results.map((l) => {
                  const active = l.id === selectedId;
                  return (
                    <li key={l.id}>
                      <button
                        onClick={() => setSelectedId(l.id)}
                        className={cn(
                          "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                          active ? "bg-emerald-50" : "hover:bg-muted/50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1 h-2 w-2 shrink-0 rounded-full",
                            STATUS_DOT[l.status] ?? "bg-slate-300",
                          )}
                          title={l.status}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "truncate text-sm font-medium",
                                active ? "text-emerald-700" : "text-foreground",
                              )}
                            >
                              {l.name}
                            </span>
                            {(l.status === "hot" || l.hot_marker_at) && (
                              <Flame className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {l.phone}
                            {l.last_contact_at ? ` · ${shortDate(l.last_contact_at)}` : ""}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                            {SOURCE_LABEL[l.source] ?? l.source}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                            l.ai_score >= 70
                              ? "bg-rose-100 text-rose-600"
                              : l.ai_score >= 40
                                ? "bg-amber-100 text-amber-600"
                                : "bg-slate-100 text-slate-500",
                          )}
                        >
                          {l.ai_score}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {!leadsQ.isLoading && !leadsQ.isError && results.length > 0 && (
              <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                {results.length} khách
                {q.trim() ? " khớp tìm kiếm" : ""}
              </div>
            )}
          </div>
        </aside>

        {/* Cột hồ sơ 360 bên phải */}
        <section className="min-w-0">
          {selected ? (
            <ErrorBoundary key={selected.id}>
              <Customer360Dashboard lead={selected} />
            </ErrorBoundary>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              {leadsQ.isLoading ? "Đang tải…" : "Chọn một khách để xem hồ sơ 360°."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
