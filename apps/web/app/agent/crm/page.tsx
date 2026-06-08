"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Search,
  Target,
  Trophy,
  Users,
} from "@/components/dashboard/icons";
import { HotLeadQueue } from "@/components/agent/crm/HotLeadQueue";
import { ImportContactsTab } from "@/components/agent/crm/ImportContactsTab";
import { LeaderboardTable } from "@/components/agent/crm/LeaderboardTable";
import { LeadDetailPanel } from "@/components/agent/crm/LeadDetailPanel";
import { LeadTable } from "@/components/agent/crm/LeadTable";
import { TodayTasksCard } from "@/components/agent/crm/TodayTasksCard";
import {
  fetchLeaderboard,
  fetchMyPerformance,
  listMyLeads,
  STATUS_LABEL,
  type CrmLead,
  type LeadStatus,
  type SalePerformance,
} from "@/lib/crm";
import { readToken, readUserFromCookie } from "@/lib/auth";

type Tab = "today" | "leads" | "import" | "leaderboard";

const TABS: { key: Tab; label: string; Icon: typeof Users }[] = [
  { key: "today", label: "Hôm nay", Icon: Target },
  { key: "leads", label: "Khách của tôi", Icon: Users },
  { key: "import", label: "Nhập danh bạ", Icon: ClipboardList },
  { key: "leaderboard", label: "Bảng xếp hạng", Icon: Trophy },
];

const STATUS_FILTERS: (LeadStatus | "all")[] = [
  "all",
  "cold",
  "warm",
  "hot",
  "customer",
  "lost",
];

function CrmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialTab = (params.get("tab") as Tab) || "today";

  const [token, setToken] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<SalePerformance[]>([]);
  const [myPerf, setMyPerf] = useState<SalePerformance | null>(null);

  useEffect(() => {
    setToken(readToken());
    setSaleId(readUserFromCookie()?.id ?? null);
  }, []);

  const reloadLeads = useCallback(() => {
    if (!token) return;
    setLoadingLeads(true);
    listMyLeads(token, {
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() || undefined,
      page_size: 200,
    })
      .then((p) => setLeads(p.items))
      .catch(() => setLeads([]))
      .finally(() => setLoadingLeads(false));
  }, [token, statusFilter, search]);

  useEffect(() => {
    if (token && (tab === "leads" || tab === "today")) reloadLeads();
  }, [token, tab, reloadLeads]);

  useEffect(() => {
    if (!token || tab !== "leaderboard") return;
    fetchLeaderboard(token).then(setLeaderboard).catch(() => setLeaderboard([]));
    fetchMyPerformance(token).then(setMyPerf).catch(() => setMyPerf(null));
  }, [token, tab]);

  const hotLeads = useMemo(
    () => leads.filter((l) => l.status === "hot"),
    [leads],
  );

  function switchTab(t: Tab) {
    setTab(t);
    setSelectedId(null);
    router.replace(`/agent/crm?tab=${t}`, { scroll: false });
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-white p-8 text-center text-brand-600 shadow-sm">
        Vui lòng đăng nhập để dùng CRM.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">CRM Khách hàng</h1>
        <p className="mt-1 text-sm text-brand-600">
          Quản lý khách, nhập danh bạ và hoàn thành nhiệm vụ để nhận khách nét.
        </p>
      </header>

      {/* Tham khảo nhanh thông tin dự án (page chi tiết 11 tab) */}
      <Link
        href="/dashboard/project/eurowindow-light-city"
        className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm transition hover:border-amber-400 hover:shadow-md"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <BookOpen size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-brand-900">
            Thông tin dự án Eurowindow Light City
          </span>
          <span className="block text-xs text-brand-600">
            Brochure, phân khu, mặt bằng quỹ căn, ảnh 360°, chính sách bán hàng
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-orange-600 sm:flex">
          Xem chi tiết
          <ChevronRight size={16} />
        </span>
      </Link>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                : "border border-brand-100 bg-white text-brand-700 hover:border-amber-300"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Hôm nay */}
      {tab === "today" && (
        <div className="space-y-5">
          <TodayTasksCard token={token} />
          <HotLeadQueue
            leads={hotLeads}
            onSelect={(l) => {
              setSelectedId(l.id);
              switchTab("leads");
            }}
          />
        </div>
      )}

      {/* Tab: Khách của tôi */}
      {tab === "leads" && (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      statusFilter === s
                        ? "bg-brand-900 text-white"
                        : "bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                    }`}
                  >
                    {s === "all" ? "Tất cả" : STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-64">
                <span className="pointer-events-none absolute left-3 top-2.5 text-brand-400">
                  <Search size={16} />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm tên, SĐT, email…"
                  className="w-full rounded-lg border border-brand-100 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
                />
              </div>
            </div>
            {loadingLeads ? (
              <div className="h-40 animate-pulse rounded-2xl bg-brand-50" />
            ) : (
              <LeadTable leads={leads} selectedId={selectedId} onSelect={(l) => setSelectedId(l.id)} />
            )}
          </div>
          {selectedId && (
            <LeadDetailPanel
              token={token}
              leadId={selectedId}
              onClose={() => setSelectedId(null)}
              onChanged={reloadLeads}
            />
          )}
        </div>
      )}

      {/* Tab: Nhập danh bạ */}
      {tab === "import" && (
        <ImportContactsTab
          token={token}
          onImported={() => {
            reloadLeads();
          }}
        />
      )}

      {/* Tab: Bảng xếp hạng */}
      {tab === "leaderboard" && (
        <div className="space-y-4">
          {myPerf && (
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Hạng của bạn", value: `#${myPerf.rank}` },
                { label: "Điểm TB tuần", value: myPerf.avg_daily_score.toFixed(0) },
                { label: "Khách đã thêm", value: myPerf.total_leads_added },
                { label: "Deal đã chốt", value: myPerf.total_deals_closed },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-sm"
                >
                  <div className="text-2xl font-extrabold">{s.value}</div>
                  <div className="mt-0.5 text-xs opacity-90">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <LeaderboardTable rows={leaderboard} currentSaleId={saleId} />
        </div>
      )}
    </div>
  );
}

export default function CrmPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-brand-50" />}>
      <CrmInner />
    </Suspense>
  );
}
