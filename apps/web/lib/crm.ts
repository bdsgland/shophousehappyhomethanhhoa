// CRM client cho portal sale — types + gọi API agent-engine + helpers UI.
// Endpoint backend: app/api/crm.py (sale_router /sale/...).

import { AGENT_ENGINE_URL } from "./api";

// ---------------------------------------------------------------------------
// Types (đồng bộ với app/schemas/crm.py)
// ---------------------------------------------------------------------------

export type LeadSource =
  | "imported"
  | "registered"
  | "referral"
  | "fb_ads"
  | "zalo"
  | "email"
  | "manual"
  | "google_sheet"
  | "file_upload";

export type LeadStatus = "cold" | "warm" | "hot" | "customer" | "lost";

export type ContactChannel =
  | "call"
  | "sms"
  | "zalo"
  | "facebook"
  | "email"
  | "inperson";

export type ContactOutcome =
  | "no_answer"
  | "interested"
  | "not_interested"
  | "callback"
  | "booked";

export type CrmLead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  assigned_sale_id: string | null;
  imported_by_sale_id: string | null;
  ai_score: number;
  booking_count: number;
  contact_count: number;
  registered: boolean;
  last_contact_at: string | null;
  hot_marker_at: string | null;
  created_at: string;
  updated_at: string;
  note: string | null;
  days_since_contact: number | null;
};

export type ContactLog = {
  id: string;
  lead_id: string;
  sale_id: string;
  channel: ContactChannel;
  note: string;
  outcome: ContactOutcome;
  created_at: string;
};

export type CrmLeadDetail = CrmLead & {
  contact_logs: ContactLog[];
  assigned_sale_name: string | null;
};

export type LeadPage = {
  total: number;
  page: number;
  page_size: number;
  items: CrmLead[];
};

export type SaleTaskDaily = {
  sale_id: string;
  date: string;
  new_leads_added: number;
  contacts_made: number;
  meetings_attended: number;
  hot_leads_received: number;
  hot_leads_closed: number;
  score: number;
  target_new_leads: number;
  target_contacts: number;
  target_meetings: number;
  checked_in: boolean;
};

export type SalePerformance = {
  sale_id: string;
  sale_name: string;
  week_start: string;
  avg_daily_score: number;
  total_leads_added: number;
  total_hot_leads_received: number;
  total_deals_closed: number;
  eligibility_score: number;
  rank: number;
};

export type BulkImportResult = {
  imported: number;
  skipped: number;
  duplicates: { name: string; phone: string }[];
};

export type LeadInput = {
  name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  source?: LeadSource;
};

// ---- AI CRM (đồng bộ app/api/ai_crm.py) ----

export type AiTier = "cold" | "warm" | "hot";

export type AiNextAction = {
  summary?: string | null;
  suggested_action?: string | null;
};

export type LeadInsight = {
  lead_id: string;
  ai_score: number;
  ai_tier?: AiTier | string | null;
  ai_reason?: string | null;
  ai_best_time?: string | null;
  ai_next_action?: AiNextAction | null;
  ai_scored_at?: string | null;
  status?: string | null;
};

// ---------------------------------------------------------------------------
// Fetch wrapper (tự gắn Bearer, parse lỗi tiếng Việt)
// ---------------------------------------------------------------------------

async function req<T>(
  path: string,
  opts: { method?: string; token: string; body?: unknown } = { token: "" },
): Promise<T> {
  const res = await fetch(`${AGENT_ENGINE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
        ? detail
            .map((d: { msg?: string }) =>
              typeof d?.msg === "string" ? d.msg : JSON.stringify(d),
            )
            .join(", ")
        : `Lỗi ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function createLead(token: string, body: LeadInput): Promise<CrmLead> {
  return req<CrmLead>("/sale/leads", { method: "POST", token, body });
}

export function bulkImportLeads(
  token: string,
  leads: LeadInput[],
  skipDuplicates = true,
): Promise<BulkImportResult> {
  return req<BulkImportResult>("/sale/leads/bulk-import", {
    method: "POST",
    token,
    body: { leads, skip_duplicates: skipDuplicates },
  });
}

export function listMyLeads(
  token: string,
  params: { status?: string; search?: string; page?: number; page_size?: number } = {},
): Promise<LeadPage> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString();
  return req<LeadPage>(`/sale/leads${q ? `?${q}` : ""}`, { token });
}

export function getLeadDetail(token: string, id: string): Promise<CrmLeadDetail> {
  return req<CrmLeadDetail>(`/sale/leads/${id}`, { token });
}

export function updateLead(
  token: string,
  id: string,
  body: { status?: LeadStatus; note?: string; name?: string; phone?: string },
): Promise<CrmLead> {
  return req<CrmLead>(`/sale/leads/${id}`, { method: "PATCH", token, body });
}

export function addContactLog(
  token: string,
  id: string,
  body: { channel: ContactChannel; note: string; outcome: ContactOutcome },
): Promise<ContactLog> {
  return req<ContactLog>(`/sale/leads/${id}/contact-log`, {
    method: "POST",
    token,
    body,
  });
}

export function fetchTodayTask(token: string): Promise<SaleTaskDaily> {
  return req<SaleTaskDaily>("/sale/tasks/today", { token });
}

export function checkInToday(token: string): Promise<SaleTaskDaily> {
  return req<SaleTaskDaily>("/sale/tasks/check-in", { method: "POST", token });
}

export function fetchMyPerformance(token: string): Promise<SalePerformance> {
  return req<SalePerformance>("/sale/performance/me", { token });
}

export function fetchLeaderboard(token: string): Promise<SalePerformance[]> {
  return req<SalePerformance[]>("/sale/leaderboard", { token });
}

/** Insight AI 1 lead (tự chấm nếu chưa có / đã cũ). */
export function getLeadInsight(token: string, id: string): Promise<LeadInsight> {
  return req<LeadInsight>(`/ai-crm/leads/${id}/insight`, { token });
}

/** Chấm điểm lại 1 lead bằng AI (force). */
export function rescoreLead(token: string, id: string): Promise<LeadInsight> {
  return req<LeadInsight>(`/ai-crm/leads/${id}/rescore`, {
    method: "POST",
    token,
  });
}

// ---------------------------------------------------------------------------
// UI helpers — nhãn + màu badge tiếng Việt
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<LeadStatus, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
  customer: "Khách hàng",
  lost: "Đã mất",
};

export const STATUS_BADGE: Record<LeadStatus, string> = {
  cold: "bg-sky-50 text-sky-700 ring-sky-200",
  warm: "bg-amber-50 text-amber-700 ring-amber-200",
  hot: "bg-rose-50 text-rose-700 ring-rose-200",
  customer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  lost: "bg-brand-100 text-brand-600 ring-brand-200",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
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

export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  call: "Gọi điện",
  sms: "SMS",
  zalo: "Zalo",
  facebook: "Facebook",
  email: "Email",
  inperson: "Gặp trực tiếp",
};

export const OUTCOME_LABEL: Record<ContactOutcome, string> = {
  no_answer: "Không nghe máy",
  interested: "Quan tâm",
  not_interested: "Không quan tâm",
  callback: "Hẹn gọi lại",
  booked: "Đã đặt lịch",
};

export function scoreColor(score: number): string {
  if (score >= 70) return "text-rose-600";
  if (score >= 40) return "text-amber-600";
  return "text-sky-600";
}

export const TIER_LABEL: Record<string, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
};

/** Màu badge cho tier AI (cold/warm/hot) — đồng bộ tông màu STATUS_BADGE. */
export const TIER_BADGE: Record<string, string> = {
  cold: "bg-sky-50 text-sky-700 ring-sky-200",
  warm: "bg-amber-50 text-amber-700 ring-amber-200",
  hot: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function tierLabel(tier?: string | null): string {
  return TIER_LABEL[(tier ?? "").toLowerCase()] ?? "Chưa xếp";
}

export function tierBadge(tier?: string | null): string {
  return (
    TIER_BADGE[(tier ?? "").toLowerCase()] ??
    "bg-brand-100 text-brand-600 ring-brand-200"
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(
    d.getMonth() + 1,
  )}`;
}
