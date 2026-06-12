// Wrapper fetch tới FastAPI agent-engine, tự gắn JWT Bearer.

import { clearToken, getToken } from "./auth";
import type {
  AuditEvent,
  AutomationExecutionsResponse,
  AutomationOverviewResponse,
  AutomationWorkflowsResponse,
  ToggleWorkflowResult,
  BackupEntry,
  BulkImportResult,
  ChatwootConversation,
  CommissionBreakdown,
  CommissionConfig,
  CommissionConfigVersion,
  CommissionRow,
  ConversationDetail,
  ConversationSummary,
  InboxListResponse,
  InboxMessagesResponse,
  CrmLead,
  CrmLeadUpdate,
  CareLogInput,
  CareLogResult,
  SaleSuggestion,
  AssignCareInput,
  DriveSyncConfig,
  DriveSyncJob,
  DriveSyncResult,
  FinanceAIAnalysis,
  FinanceCost,
  FinanceCostInput,
  FinanceManualRevenue,
  FinanceManualRevenueInput,
  FinanceOverview,
  FinancePeriod,
  FinancePeriodSummary,
  FinanceRevenueResponse,
  CrmBulkDeleteResult,
  CrmLeadDetail,
  CrmLeadPage,
  CrmStats,
  DashboardKpi,
  ImportCommitPayload,
  ApiKey,
  ApiKeyCreated,
  ApiKeysResponse,
  ImportParsePreview,
  ImportResult,
  ImportWorkspaceStatus,
  IntegrationsResponse,
  IntegrationServiceView,
  IntegrationTestResult,
  LeadInsight,
  PipelineResponse,
  Profile360,
  RescoreResult,
  StageChangeResult,
  InventoryBackupInfo,
  InventorySyncResult,
  InventoryUnit,
  KbStats,
  LearningDocument,
  ManagerOverview,
  ManagerBroadcastPayload,
  ManagerBroadcastResult,
  ManagerAssignHotResult,
  ManagerCommandPayload,
  ManagerCommandResult,
  PlatformsHealthResponse,
  ReferralNode,
  ResetPasswordResult,
  SaleRow,
  SalePerformance,
  SalesPolicyConfig,
  SettingsResponse,
  TokenResponse,
  User,
  UserRole,
  MarketingCampaign,
  MarketingOverview,
  CampaignCreatePayload,
  CampaignUpdatePayload,
  CampaignPerformance,
  ContentGeneratePayload,
  ContentGenerateResponse,
  MarketingContentItem,
  CampaignSuggestResponse,
  MarketingPipeline,
  PipelineCreatePayload,
  PipelineUpdatePayload,
  PipelineRunResponse,
  PipelineRunAllPayload,
  PipelinePublishPayload,
  PipelineStage,
  CrewStatus,
  CrewAgentsResponse,
  CrewRunResult,
  CrewRunPayload,
  AiSalesStats,
  AiSalesPage,
  AiSalesSeedResult,
  AiSalesAssignResult,
  AiCareResult,
  AiSalesman,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.eurowindowlightcity.net";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // mặc định true
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(
      "Không kết nối được máy chủ. Kiểm tra mạng hoặc API.",
      0,
    );
  }

  if (res.status === 401) {
    // Token hết hạn / không hợp lệ → xoá để buộc đăng nhập lại.
    if (auth) clearToken();
  }

  if (!res.ok) {
    let detail = `Lỗi ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : detail;
    } catch {
      /* ignore parse error */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Endpoint cụ thể ----

export function login(email: string, password: string) {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
}

export function getMe() {
  return apiFetch<User>("/auth/me");
}

export function getDashboardKpi() {
  return apiFetch<DashboardKpi>("/admin/dashboard/kpi");
}

export function getPlatformsHealth() {
  return apiFetch<PlatformsHealthResponse>("/admin/platforms/health");
}

export function listUsers() {
  return apiFetch<User[]>("/admin/users");
}

// Upload multipart (FormData) — KHÔNG set Content-Type để trình duyệt tự thêm boundary.
async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers,
      body: form,
    });
  } catch {
    throw new ApiError("Không kết nối được máy chủ.", 0);
  }
  if (res.status === 401) clearToken();
  if (!res.ok) {
    let detail = `Lỗi ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail && typeof data.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Phase 2: Users ----

export interface CreateUserPayload {
  email: string;
  full_name: string;
  password?: string;
  phone?: string;
  role: UserRole;
  region?: string;
  upline_email?: string;
}

export interface UpdateUserPayload {
  full_name?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  is_active?: boolean;
  region?: string;
  upline_email?: string;
}

export function createUser(payload: CreateUserPayload) {
  return apiFetch<User>("/admin/users", { method: "POST", body: payload });
}

export function updateUser(id: string, payload: UpdateUserPayload) {
  return apiFetch<User>(`/admin/users/${id}`, { method: "PATCH", body: payload });
}

export function deleteUser(id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/users/${id}`, { method: "DELETE" });
}

export function resetUserPassword(id: string) {
  return apiFetch<ResetPasswordResult>(`/admin/users/${id}/reset-password`, {
    method: "POST",
  });
}

export function bulkImportUsers(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<BulkImportResult>("/admin/users/bulk-import", form);
}

// ---- Phase 2: Sales & Commission ----

export function listSales() {
  return apiFetch<{ sales: SaleRow[]; count: number }>("/admin/sales");
}

export function listCommissions(params?: { sale_id?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.sale_id) q.set("sale_id", params.sale_id);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch<{ records: CommissionRow[]; count: number; total_commission: number }>(
    `/admin/commissions${qs ? `?${qs}` : ""}`,
  );
}

export function approveCommission(dealId: string) {
  return apiFetch<{ ok: boolean; status: string }>(
    `/admin/commissions/${dealId}/approve`,
    { method: "POST" },
  );
}

export function markCommissionPaid(dealId: string) {
  return apiFetch<{ ok: boolean; status: string }>(
    `/admin/commissions/${dealId}/mark-paid`,
    { method: "POST" },
  );
}

export function getReferralTree() {
  return apiFetch<{ tree: ReferralNode[]; total: number }>("/admin/referral-tree");
}

// ---- Phase 2: Inventory ----

export function listInventory(params?: {
  phan_khu?: string;
  loai?: string;
  trang_thai?: string;
  quy?: string;
}) {
  const q = new URLSearchParams();
  if (params?.phan_khu) q.set("phan_khu", params.phan_khu);
  if (params?.loai) q.set("loai", params.loai);
  if (params?.trang_thai) q.set("trang_thai", params.trang_thai);
  if (params?.quy) q.set("quy", params.quy);
  const qs = q.toString();
  return apiFetch<{ units: InventoryUnit[]; count: number }>(
    `/admin/inventory${qs ? `?${qs}` : ""}`,
  );
}

export interface UpdateUnitPayload {
  phan_khu?: string;
  loai?: string;
  dien_tich?: number;
  mat_tien?: number;
  trang_thai?: string;
  gia_tri?: number;
  gia_min?: number;
  gia_max?: number;
  quy?: string;
  gia_ny_gom_vat_kpbt?: number;
  vat_hdmb?: number;
  kpbt?: number;
  gt_xay_ny?: number;
  huong?: string;
  view?: string;
  notes?: string;
  position?: { x: number; y: number };
}

// ---- Đồng bộ quỹ căn từ Google Sheets ----

export function syncInventory(payload: {
  sheet_url: string;
  sheet_gid?: number;
  replace_all?: boolean;
}) {
  return apiFetch<InventorySyncResult>("/admin/inventory/sync", {
    method: "POST",
    body: {
      sheet_url: payload.sheet_url,
      sheet_gid: payload.sheet_gid ?? 0,
      replace_all: payload.replace_all ?? true,
    },
  });
}

export function getInventorySyncHistory(limit = 20) {
  return apiFetch<{ history: InventorySyncResult[] }>(
    `/admin/inventory/sync/history?limit=${limit}`,
  );
}

export function listInventoryBackups() {
  return apiFetch<{ backups: InventoryBackupInfo[] }>("/admin/inventory/backups");
}

export function restoreInventory(backupTimestamp: string) {
  return apiFetch<{
    success: boolean;
    restored_units: number;
    from_backup: string;
    by?: string;
  }>(`/admin/inventory/restore/${encodeURIComponent(backupTimestamp)}`, {
    method: "POST",
  });
}

export function updateUnit(id: string, payload: UpdateUnitPayload) {
  return apiFetch<InventoryUnit>(`/admin/inventory/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function createUnit(payload: UpdateUnitPayload & { id: string; lo?: string }) {
  return apiFetch<InventoryUnit>("/admin/inventory", {
    method: "POST",
    body: payload,
  });
}

export function deleteUnit(id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/inventory/${id}`, { method: "DELETE" });
}

// ---- Phase 2: KB ----

export function listLearningDocuments(category?: string, group?: string) {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (group) q.set("group", group);
  const qs = q.toString() ? `?${q.toString()}` : "";
  return apiFetch<LearningDocument[]>(`/learning/documents${qs}`);
}

/**
 * Tải tài liệu kèm Authorization Bearer rồi tạo blob URL để trigger download.
 * Dùng thay cho <a href> trực tiếp (link trực tiếp không gắn được header → 401
 * "Thiếu token Bearer"). Token KHÔNG bị đưa lên URL.
 */
// Đuôi file xem inline được trong trình duyệt (PDF/ảnh/text). Còn lại → tải về.
const VIEWABLE_EXTS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "md",
]);

const DOC_NOT_READY =
  "Tài liệu chưa sẵn sàng trên máy chủ (cần đồng bộ lại / kiểm tra lưu trữ).";

function docExt(doc: { download_url: string; type?: string | null }): string {
  return (doc.type || doc.download_url.split(".").pop() || "").toLowerCase();
}

async function fetchDocBlob(downloadUrl: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_URL}${downloadUrl}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) throw new ApiError(DOC_NOT_READY, 404);
  if (!res.ok) throw new ApiError(`Lỗi tải tài liệu (${res.status})`, res.status);
  const ct = res.headers.get("content-type") || undefined;
  const buf = await res.arrayBuffer();
  // Giữ đúng MIME từ server để PDF/ảnh render đúng (không bị "Không tải được PDF").
  return new Blob([buf], ct ? { type: ct } : undefined);
}

export async function downloadLearningDocument(
  doc: Pick<LearningDocument, "download_url" | "title" | "type">,
): Promise<void> {
  const blob = await fetchDocBlob(doc.download_url);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.type ? `${doc.title}.${doc.type}` : doc.title;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Xem tài liệu theo ĐÚNG loại: PDF/ảnh/text → blob MIME đúng → mở tab mới (inline);
 * file Office (xlsx/docx/…) không xem inline được → TẢI VỀ thay vì mở blob PDF lỗi.
 * 404 → báo rõ "chưa sẵn sàng trên máy chủ".
 */
export async function viewLearningDocument(
  doc: Pick<LearningDocument, "download_url" | "title" | "type">,
): Promise<void> {
  const blob = await fetchDocBlob(doc.download_url);
  const url = URL.createObjectURL(blob);
  if (VIEWABLE_EXTS.has(docExt(doc))) {
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.type ? `${doc.title}.${doc.type}` : doc.title;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export function uploadLearningDocument(
  file: File,
  title: string,
  category: string,
) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  form.append("category", category);
  return apiUpload<{ document_id: string; title: string }>(
    "/learning/documents",
    form,
  );
}

export function deleteLearningDocument(id: string) {
  return apiFetch<{ ok: boolean }>(`/learning/documents/${id}`, {
    method: "DELETE",
  });
}

export function getKbStats() {
  return apiFetch<KbStats>("/admin/kb/stats");
}

// ---- Chính sách bán hàng (phiếu tính giá) ----

export function getSalesPolicy() {
  return apiFetch<SalesPolicyConfig>("/admin/sales-policy");
}

export function updateSalesPolicy(config: SalesPolicyConfig) {
  return apiFetch<SalesPolicyConfig>("/admin/sales-policy", {
    method: "PUT",
    body: config,
  });
}

export function reindexKb() {
  return apiFetch<{ ok: boolean; documents: number; chunks: number }>(
    "/admin/kb/reindex-all",
    { method: "POST" },
  );
}

// ---- Đồng bộ Google Drive ----

export function getDriveSyncConfig() {
  return apiFetch<DriveSyncConfig>("/admin/documents/sync-drive/config");
}

export function startDriveSync(input: {
  folder_url: string;
  skip_existing: boolean;
  reindex_rag: boolean;
}) {
  return apiFetch<{ job_id: string; status: string }>(
    "/admin/documents/sync-drive",
    { method: "POST", body: input },
  );
}

export function getDriveSyncJob(jobId: string) {
  return apiFetch<DriveSyncJob>(
    `/admin/documents/sync-drive/jobs/${jobId}`,
  );
}

export function getDriveSyncHistory() {
  return apiFetch<DriveSyncResult[]>("/admin/documents/sync-drive/history");
}

// ---- Phase 2: Conversations ----

export function listConversations() {
  return apiFetch<{ conversations: ConversationSummary[]; count: number }>(
    "/admin/conversations",
  );
}

export function getConversation(id: string) {
  return apiFetch<ConversationDetail>(`/admin/conversations/${id}`);
}

export function listChatwootConversations(status = "open") {
  return apiFetch<{
    configured: boolean;
    conversations: ChatwootConversation[];
    detail?: string;
  }>(`/admin/conversations/chatwoot?status=${status}`);
}

// ---- Omnichannel Inbox (Hộp thư đa kênh) ----

export function listInboxConversations(channel = "all", status = "open") {
  const qs = new URLSearchParams({ channel, status }).toString();
  return apiFetch<InboxListResponse>(`/admin/inbox/conversations?${qs}`);
}

export function getInboxMessages(id: string) {
  return apiFetch<InboxMessagesResponse>(
    `/admin/inbox/conversations/${encodeURIComponent(id)}/messages`,
  );
}

export function replyInboxConversation(id: string, content: string) {
  return apiFetch<{ ok: boolean; source: string }>(
    `/admin/inbox/conversations/${encodeURIComponent(id)}/reply`,
    { method: "POST", body: { content } },
  );
}

// ---- Phase 2: Settings ----

export function getSettings() {
  return apiFetch<SettingsResponse>("/admin/settings");
}

export function updateSettings(patch: {
  general?: Partial<SettingsResponse["config"]["general"]>;
  notifications?: Partial<SettingsResponse["config"]["notifications"]>;
}) {
  return apiFetch<SettingsResponse>("/admin/settings", {
    method: "PATCH",
    body: patch,
  });
}

export function getAuditLog(limit = 100) {
  return apiFetch<{ events: AuditEvent[]; count: number }>(
    `/admin/audit-log?limit=${limit}`,
  );
}

export function triggerBackup() {
  return apiFetch<{ ok: boolean; backup: BackupEntry }>("/admin/backup/trigger", {
    method: "POST",
  });
}

export function listBackups() {
  return apiFetch<{ backups: BackupEntry[] }>("/admin/backup/list");
}

// ---- Cơ chế hoa hồng (config + KPI tier) ----

export function getCommissionConfig() {
  return apiFetch<CommissionConfig>("/admin/commission/config");
}

export function updateCommissionConfig(config: CommissionConfig) {
  return apiFetch<CommissionConfig>("/admin/commission/config", {
    method: "PATCH",
    body: config,
  });
}

export function getCommissionConfigHistory() {
  return apiFetch<{ versions: CommissionConfigVersion[] }>(
    "/admin/commission/config/history",
  );
}

export function restoreCommissionConfig(version: number) {
  return apiFetch<CommissionConfig>(
    `/admin/commission/config/restore/${version}`,
    { method: "POST" },
  );
}

export function resetCommissionConfig() {
  return apiFetch<CommissionConfig>("/admin/commission/config/reset", {
    method: "POST",
  });
}

export function previewCommission(payload: {
  deal_amount: number;
  sale_monthly_volume_before_deal?: number;
  with_referrer?: boolean;
  config?: CommissionConfig;
}) {
  return apiFetch<CommissionBreakdown>("/admin/commission/preview", {
    method: "POST",
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// CRM khách hàng — master view + reassign + hot lead + hiệu suất sale
// ---------------------------------------------------------------------------

export function listCrmLeads(params: {
  status?: string;
  sale_id?: string;
  source?: string;
  search?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.sale_id) qs.set("sale_id", params.sale_id);
  if (params.source) qs.set("source", params.source);
  if (params.search) qs.set("search", params.search);
  qs.set("page", String(params.page ?? 1));
  qs.set("page_size", String(params.page_size ?? 50));
  return apiFetch<CrmLeadPage>(`/admin/crm/leads?${qs.toString()}`);
}

/**
 * Tải TOÀN BỘ lead cho master view bằng cách phân trang theo lô an toàn
 * (page_size ≤ 200 — vừa khít cap `le=200` của backend, tránh lỗi 422 khiến
 * danh sách rỗng dù tổng số tăng). Gộp item các trang lại rồi trả 1 page.
 */
export async function listAllCrmLeads(
  params: { status?: string; sale_id?: string; source?: string; search?: string } = {},
): Promise<CrmLeadPage> {
  const PAGE = 200; // an toàn dưới cap backend; >200 sẽ tự lấy thêm trang
  const first = await listCrmLeads({ ...params, page: 1, page_size: PAGE });
  const items = [...first.items];
  const totalPages = Math.max(1, Math.ceil((first.total ?? items.length) / PAGE));
  for (let p = 2; p <= totalPages; p += 1) {
    const next = await listCrmLeads({ ...params, page: p, page_size: PAGE });
    items.push(...next.items);
    if (next.items.length === 0) break; // phòng total lệch
  }
  return { total: first.total ?? items.length, page: 1, page_size: items.length, items };
}

export function getCrmLead(id: string) {
  return apiFetch<CrmLeadDetail>(`/admin/crm/leads/${id}`);
}

/** Sửa thông tin khách (admin): name/phone/email/source/status/note/assigned. */
export function updateCrmLead(id: string, body: CrmLeadUpdate) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}`, {
    method: "PATCH",
    body,
  });
}

export function assignCrmLead(id: string, saleId: string) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}/assign`, {
    method: "PATCH",
    body: { sale_id: saleId },
  });
}

/** Gợi ý sale để phân công chăm sóc (điểm hiệu suất + online presence). */
export function getSaleSuggestions() {
  return apiFetch<SaleSuggestion[]>("/admin/crm/sale-suggestions");
}

/** Phân công chăm sóc 1 khách cho sale + (tuỳ chọn) kênh → ghi feed timeline. */
export function assignCareLead(id: string, body: AssignCareInput) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}/assign-care`, {
    method: "POST",
    body,
  });
}

export function softDeleteCrmLead(id: string) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}`, { method: "DELETE" });
}

/** Xoá CỨNG hàng loạt khách theo danh sách id (dọn nhanh khi import sai). */
export function bulkDeleteCrmLeads(ids: string[]) {
  return apiFetch<CrmBulkDeleteResult>("/admin/crm/leads/bulk-delete", {
    method: "POST",
    body: { ids },
  });
}

export function markCrmLeadHot(id: string) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}/mark-hot`, { method: "POST" });
}

export function autoDistributeHotLeads() {
  return apiFetch<{ distributed: number; leads: { lead_id: string; sale_id: string }[] }>(
    "/admin/crm/hot-leads/auto-distribute",
    { method: "POST" },
  );
}

export function getCrmStats() {
  return apiFetch<CrmStats>("/admin/crm/stats");
}

export function getCrmSalesPerformance() {
  return apiFetch<SalePerformance[]>("/admin/crm/sales/performance");
}

// ----- Live Match (Uber-style khách ↔ sale realtime) -----

export interface MatchStats {
  period: string;
  total: number;
  accepted: number;
  declined: number;
  expired: number;
  cancelled: number;
  live: number;
  completed: number;
  avg_duration_seconds: number;
  avg_accept_seconds: number;
  conversion_rate: number;
  online_sales: number;
  online_customers: number;
  active_calls: number;
}

export interface MatchPresenceRow {
  sale_id: string;
  sale_name: string;
  availability: "online" | "busy" | "away" | "dnd";
  active_calls: number;
  last_heartbeat_at?: string | null;
  last_match_at?: string | null;
}

export interface MatchRecord {
  id: string;
  customer_name: string;
  sale_id: string | null;
  sale_name: string | null;
  status: string;
  meet_link: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  outcome: string | null;
}

export function getMatchStats(period: "today" | "week" | "all" = "today") {
  return apiFetch<MatchStats>(`/admin/match/stats?period=${period}`);
}

export function getMatchPresence() {
  return apiFetch<{ counts: Record<string, number>; sales: MatchPresenceRow[] }>(
    "/admin/match/presence",
  );
}

export function getMatchHistory(limit = 50) {
  return apiFetch<MatchRecord[]>(`/admin/match/history?limit=${limit}`);
}

// ----- Google Workspace (Connect: refresh token cho Meet + Drive) -----

export interface WorkspaceStatus {
  connected: boolean;
  scopes: string[];
  email: string | null;
  connected_at: string | null;
  updated_at: string | null;
  redirect_uri: string;
}

export function getWorkspaceStatus() {
  return apiFetch<WorkspaceStatus>("/admin/google-workspace/status");
}

// ---------------------------------------------------------------------------
// TRUNG TÂM TÍCH HỢP & KẾT NỐI — /admin/integrations
// ---------------------------------------------------------------------------

export function listIntegrations() {
  return apiFetch<IntegrationsResponse>("/admin/integrations");
}

export function saveIntegration(
  service: string,
  values: Record<string, string | number | boolean>,
) {
  return apiFetch<IntegrationServiceView>(`/admin/integrations/${service}`, {
    method: "PUT",
    body: values,
  });
}

export function testIntegration(service: string) {
  return apiFetch<IntegrationTestResult>(
    `/admin/integrations/${service}/test`,
    { method: "POST" },
  );
}

export function deleteIntegration(service: string) {
  return apiFetch<IntegrationServiceView>(`/admin/integrations/${service}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// API KEYS — khoá truy cập API/MCP toàn quyền (/admin/api-keys)
// ---------------------------------------------------------------------------

export function listApiKeys() {
  return apiFetch<ApiKeysResponse>("/admin/api-keys");
}

export function createApiKey(name: string, scope = "admin_full") {
  return apiFetch<ApiKeyCreated>("/admin/api-keys", {
    method: "POST",
    body: { name, scope },
  });
}

export function revokeApiKey(keyId: string) {
  return apiFetch<ApiKey>(`/admin/api-keys/${keyId}`, { method: "DELETE" });
}

/**
 * URL điều hướng trình duyệt tới luồng Connect. Auth qua `?token=` (đúng
 * convention các endpoint cần admin trong ngữ cảnh trình duyệt, vd WS).
 */
export function workspaceConnectUrl(): string {
  const token = getToken();
  return `${API_URL}/admin/google-workspace/connect?token=${encodeURIComponent(
    token ?? "",
  )}`;
}

// ---------------------------------------------------------------------------
// Import khách CRM đa nguồn (Google Trang tính + file CSV/XLSX) — /admin/import
// ---------------------------------------------------------------------------

/** Đã Connect Google Workspace chưa + có scope Sheets chưa (bật/tắt nút import). */
export function getImportWorkspaceStatus() {
  return apiFetch<ImportWorkspaceStatus>("/admin/import/workspace-status");
}

/** Đọc Google Trang tính → headers + rows + gợi ý mapping (xem trước).
 *  `all_tabs=true` → đọc mọi tab, gắn nhãn tab vào vùng miền/tệp khách. */
export function parseImportGoogleSheet(payload: {
  sheet_url: string;
  sheet_name?: string | null;
  all_tabs?: boolean;
}) {
  return apiFetch<ImportParsePreview>("/admin/import/google-sheet/parse", {
    method: "POST",
    body: payload,
  });
}

/** Upload CSV/XLSX (multipart) → headers + rows + gợi ý mapping.
 *  `allTabs=true` (XLSX nhiều sheet) → đọc mọi sheet, gắn nhãn sheet vào tệp khách. */
export function parseImportFile(file: File, allTabs = false) {
  const form = new FormData();
  form.append("file", file);
  form.append("all_tabs", allTabs ? "true" : "false");
  return apiUpload<ImportParsePreview>("/admin/import/file/parse", form);
}

/** Tạo lead từ rows + mapping admin đã chỉnh (dedupe + auto-care + AI). */
export function commitImport(payload: ImportCommitPayload) {
  return apiFetch<ImportResult>("/admin/import/commit", {
    method: "POST",
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// AI CRM — insight + rescore (/ai-crm/*)
// ---------------------------------------------------------------------------

/** Insight 1 lead (tự chấm nếu chưa có / đã cũ). */
export function getLeadInsight(id: string) {
  return apiFetch<LeadInsight>(`/ai-crm/leads/${id}/insight`);
}

/** Chấm điểm lại 1 lead bằng AI (force). */
export function rescoreLead(id: string) {
  return apiFetch<LeadInsight>(`/ai-crm/leads/${id}/rescore`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Hồ sơ 360° + Pipeline kanban (/crm/*)
// ---------------------------------------------------------------------------

/** Hồ sơ 360° 1 khách: cơ bản + AI + timeline + giao dịch + kênh.
 *  rescore=true → trigger AI chấm lại trước khi dựng hồ sơ. */
export function getProfile360(id: string, rescore = false) {
  return apiFetch<Profile360>(
    `/crm/leads/${id}/profile-360${rescore ? "?rescore=true" : ""}`,
  );
}

/** Đăng 1 hoạt động chăm sóc (care feed) lên dòng thời gian hồ sơ 360°.
 *  Trả { item } đúng hình dạng 1 mục timeline để prepend ngay. */
export function addCareLog(id: string, body: CareLogInput) {
  return apiFetch<CareLogResult>(`/crm/leads/${id}/care`, {
    method: "POST",
    body,
  });
}

// ---------------------------------------------------------------------------
// Tổng đài (Call Center / Stringee) — click-to-call + ghi âm (/crm/call/*)
// ---------------------------------------------------------------------------

export interface CallConfig {
  configured: boolean;
  from_number: string | null;
  user_id: string;
}

export interface CallStartResult {
  mode: string; // "web_sdk" | "server_callout"
  log_id: string;
  to_number: string;
  from_number: string | null;
  user_id: string;
  custom_data: string;
  call_id?: string | null;
}

/** Trạng thái cấu hình tổng đài (ẩn/hiện nút Gọi). */
export function getCallConfig() {
  return apiFetch<CallConfig>("/crm/call/config");
}

/** Cấp client access token cho Web SDK (userId = sale hiện tại). */
export function getCallToken() {
  return apiFetch<{ access_token: string; user_id: string; expires_in: number }>(
    "/crm/call/token",
  );
}

/** Bắt đầu gọi 1 khách → ghi contact log "đang gọi" + trả thông tin gọi. */
export function startCall(leadId: string, serverCallout = false) {
  return apiFetch<CallStartResult>("/crm/call/start", {
    method: "POST",
    body: { lead_id: leadId, server_callout: serverCallout },
  });
}

/** Gắn call_id (Web SDK sinh) vào log để webhook ghi âm khớp được. */
export function attachCall(logId: string, callId: string) {
  return apiFetch<{ ok: boolean }>("/crm/call/attach", {
    method: "POST",
    body: { log_id: logId, call_id: callId },
  });
}

/** Cập nhật trạng thái cuối cuộc gọi (fallback khi webhook chưa tới — dev). */
export function updateCallStatus(
  logId: string,
  callStatus: string,
  duration?: number,
  outcome?: string,
) {
  return apiFetch<{ ok: boolean }>("/crm/call/status", {
    method: "POST",
    body: { log_id: logId, call_status: callStatus, duration, outcome },
  });
}

/** Tải blob ghi âm qua proxy backend (gắn JWT) để phát lại trong trình duyệt. */
export async function getCallRecordingBlob(logId: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_URL}/crm/call/recording/${encodeURIComponent(logId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `Lỗi tải ghi âm (${res.status})`;
    try {
      const d = await res.json();
      if (d?.detail && typeof d.detail === "string") detail = d.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  const ct = res.headers.get("content-type") || undefined;
  const buf = await res.arrayBuffer();
  return new Blob([buf], ct ? { type: ct } : undefined);
}

/** Leads nhóm theo giai đoạn pipeline (kanban). Admin lọc theo 1 sale + auto-advance. */
export function getPipeline(
  params: { sale_id?: string; auto_advance?: boolean } = {},
) {
  const qs = new URLSearchParams();
  if (params.sale_id) qs.set("sale_id", params.sale_id);
  if (params.auto_advance) qs.set("auto_advance", "true");
  const q = qs.toString();
  return apiFetch<PipelineResponse>(`/crm/pipeline${q ? `?${q}` : ""}`);
}

/** Đổi giai đoạn pipeline 1 khách (ghi log timeline). */
export function changeLeadStage(id: string, stage: string, note?: string) {
  return apiFetch<StageChangeResult>(`/crm/leads/${id}/stage`, {
    method: "POST",
    body: { stage, note },
  });
}

/** Chấm điểm AI hàng loạt (admin). Mặc định toàn bộ (scope='all'). */
export function rescoreAllLeads(
  payload: { scope?: string; lead_ids?: string[]; force?: boolean } = {
    scope: "all",
  },
) {
  return apiFetch<RescoreResult>("/ai-crm/rescore", {
    method: "POST",
    body: payload,
  });
}

// ---- Automation (kiểm soát workflow n8n) ----

/** Tổng quan automation: active/inactive, số chạy hôm nay, lỗi gần đây. */
export function getAutomationOverview() {
  return apiFetch<AutomationOverviewResponse>("/admin/automation/overview");
}

/** Danh sách workflow nhóm theo hạng mục + lần chạy gần nhất + tỉ lệ lỗi. */
export function getAutomationWorkflows() {
  return apiFetch<AutomationWorkflowsResponse>("/admin/automation/workflows");
}

/** Bật / tắt 1 workflow n8n. */
export function setWorkflowActive(id: string, active: boolean) {
  return apiFetch<ToggleWorkflowResult>(
    `/admin/automation/workflows/${id}/${active ? "activate" : "deactivate"}`,
    { method: "POST" },
  );
}

/** Lịch sử chạy gần nhất của 1 workflow. */
export function getWorkflowExecutions(id: string, limit = 20) {
  return apiFetch<AutomationExecutionsResponse>(
    `/admin/automation/workflows/${id}/executions?limit=${limit}`,
  );
}

// ---- Manager / Trung tâm điều hành ----

export function getManagerOverview() {
  return apiFetch<ManagerOverview>("/admin/manager/overview");
}

export function managerBroadcast(payload: ManagerBroadcastPayload) {
  return apiFetch<ManagerBroadcastResult>("/admin/manager/broadcast", {
    method: "POST",
    body: payload,
  });
}

export function managerAssignHotLeads(dryRun = false) {
  return apiFetch<ManagerAssignHotResult>("/admin/manager/assign-hot-leads", {
    method: "POST",
    body: { dry_run: dryRun },
  });
}

export function managerRestartPlatform(service: string) {
  return apiFetch<{ ok: boolean; service: string }>(
    `/admin/manager/platforms/${service}/restart`,
    { method: "POST" },
  );
}

export function managerCommand(payload: ManagerCommandPayload) {
  return apiFetch<ManagerCommandResult>("/admin/manager/command", {
    method: "POST",
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// Tài chính (/admin/finance) — chi phí, doanh thu, lợi nhuận, phân tích AI
// ---------------------------------------------------------------------------

/** Tổng quan tài chính: KPI kỳ + chuỗi tháng + cơ cấu chi phí + tách nguồn DT. */
export function getFinanceOverview(
  period: FinancePeriod = "month",
  monthsBack = 12,
) {
  return apiFetch<FinanceOverview>(
    `/admin/finance/overview?period=${period}&months_back=${monthsBack}`,
  );
}

export function getFinanceSummary(period: FinancePeriod = "month") {
  return apiFetch<FinancePeriodSummary>(`/admin/finance/summary?period=${period}`);
}

/** Danh sách chi phí. */
export function listFinanceCosts() {
  return apiFetch<{ costs: FinanceCost[]; count: number }>("/admin/finance/costs");
}

export function createFinanceCost(payload: FinanceCostInput) {
  return apiFetch<FinanceCost>("/admin/finance/costs", {
    method: "POST",
    body: payload,
  });
}

export function updateFinanceCost(id: string, payload: FinanceCostInput) {
  return apiFetch<FinanceCost>(`/admin/finance/costs/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteFinanceCost(id: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/admin/finance/costs/${id}`, {
    method: "DELETE",
  });
}

/** Các dòng doanh thu tổng hợp (hoa hồng + thủ công) theo kỳ. all=true bỏ lọc. */
export function listFinanceRevenue(period: FinancePeriod = "month", all = false) {
  return apiFetch<FinanceRevenueResponse>(
    `/admin/finance/revenue?period=${period}${all ? "&all=true" : ""}`,
  );
}

export function createManualRevenue(payload: FinanceManualRevenueInput) {
  return apiFetch<FinanceManualRevenue>("/admin/finance/revenue", {
    method: "POST",
    body: payload,
  });
}

export function updateManualRevenue(
  id: string,
  payload: FinanceManualRevenueInput,
) {
  return apiFetch<FinanceManualRevenue>(`/admin/finance/revenue/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteManualRevenue(id: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/admin/finance/revenue/${id}`, {
    method: "DELETE",
  });
}

/** Phân tích tài chính bằng AI (Claude) + dự báo kỳ tới. Fallback nếu thiếu key. */
export function getFinanceAIAnalysis(period: FinancePeriod = "month") {
  return apiFetch<FinanceAIAnalysis>(`/admin/finance/ai-analysis?period=${period}`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// NHÂN SỰ (HR) — phân quyền, mục tiêu KPI, báo cáo hiệu suất AI (/admin/hr)
// ---------------------------------------------------------------------------

// Import type HR đặt cuối file để KHÔNG đụng khối import dùng chung ở đầu file
// (giảm xung đột khi nhiều phiên cùng sửa). Import declaration được hoisted.
import type {
  HRObjective,
  HRObjectiveCreate,
  HRObjectiveUpdate,
  HROverview,
  HRPerformanceReport,
  HRPermissionMatrix,
  HRStaff,
  HRStaffCreate,
  HRStaffUpdate,
} from "./types";

export function getHROverview() {
  return apiFetch<HROverview>("/admin/hr/overview");
}

export function listHRStaff(includeClients = false) {
  return apiFetch<{ staff: HRStaff[]; count: number }>(
    `/admin/hr/staff${includeClients ? "?include_clients=true" : ""}`,
  );
}

export function createHRStaff(payload: HRStaffCreate) {
  return apiFetch<HRStaff>("/admin/hr/staff", { method: "POST", body: payload });
}

export function updateHRStaff(id: string, payload: HRStaffUpdate) {
  return apiFetch<HRStaff>(`/admin/hr/staff/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function setHRStaffStatus(id: string, isActive: boolean) {
  return apiFetch<HRStaff>(`/admin/hr/staff/${id}/status`, {
    method: "PATCH",
    body: { is_active: isActive },
  });
}

export function getHRPermissions() {
  return apiFetch<HRPermissionMatrix>("/admin/hr/permissions");
}

export function updateHRRolePermissions(
  role: string,
  permissions: Record<string, boolean>,
) {
  return apiFetch<HRPermissionMatrix>("/admin/hr/permissions", {
    method: "PUT",
    body: { role, permissions },
  });
}

export function resetHRPermissions() {
  return apiFetch<HRPermissionMatrix>("/admin/hr/permissions/reset", {
    method: "POST",
  });
}

export function listHRObjectives(staffId?: string) {
  return apiFetch<HRObjective[]>(
    `/admin/hr/objectives${staffId ? `?staff_id=${encodeURIComponent(staffId)}` : ""}`,
  );
}

export function createHRObjective(payload: HRObjectiveCreate) {
  return apiFetch<HRObjective>("/admin/hr/objectives", {
    method: "POST",
    body: payload,
  });
}

export function updateHRObjective(id: string, payload: HRObjectiveUpdate) {
  return apiFetch<HRObjective>(`/admin/hr/objectives/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteHRObjective(id: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/admin/hr/objectives/${id}`, {
    method: "DELETE",
  });
}

export function getHRPerformanceReport(staffId: string) {
  return apiFetch<HRPerformanceReport>(
    `/admin/hr/staff/${staffId}/performance-report`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// AI MARKETING — chiến dịch đa kênh + hiệu suất + sản xuất nội dung (/admin/marketing)
// ---------------------------------------------------------------------------

/** Tổng quan marketing: KPI + theo kênh + hiệu suất từng campaign. */
export function getMarketingOverview() {
  return apiFetch<MarketingOverview>("/admin/marketing/overview");
}

export function listCampaigns(params?: { channel?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.channel) q.set("channel", params.channel);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch<{ campaigns: MarketingCampaign[]; count: number }>(
    `/admin/marketing/campaigns${qs ? `?${qs}` : ""}`,
  );
}

export function getCampaign(id: string) {
  return apiFetch<{ campaign: MarketingCampaign; performance: CampaignPerformance }>(
    `/admin/marketing/campaigns/${id}`,
  );
}

export function createCampaign(payload: CampaignCreatePayload) {
  return apiFetch<MarketingCampaign>("/admin/marketing/campaigns", {
    method: "POST",
    body: payload,
  });
}

export function updateCampaign(id: string, payload: CampaignUpdatePayload) {
  return apiFetch<MarketingCampaign>(`/admin/marketing/campaigns/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function updateCampaignSpend(
  id: string,
  payload: { spent?: number; add?: number },
) {
  return apiFetch<MarketingCampaign>(`/admin/marketing/campaigns/${id}/spend`, {
    method: "POST",
    body: payload,
  });
}

export function deleteCampaign(id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/marketing/campaigns/${id}`, {
    method: "DELETE",
  });
}

/** Sinh nội dung marketing bằng AI (fallback mẫu nếu thiếu API key). */
export function generateMarketingContent(payload: ContentGeneratePayload) {
  return apiFetch<ContentGenerateResponse>("/admin/marketing/content/generate", {
    method: "POST",
    body: payload,
  });
}

export function listMarketingContent(params?: {
  limit?: number;
  content_type?: string;
  channel?: string;
}) {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.content_type) q.set("content_type", params.content_type);
  if (params?.channel) q.set("channel", params.channel);
  const qs = q.toString();
  return apiFetch<{ content: MarketingContentItem[]; count: number }>(
    `/admin/marketing/content${qs ? `?${qs}` : ""}`,
  );
}

export function deleteMarketingContent(id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/marketing/content/${id}`, {
    method: "DELETE",
  });
}

/** Gợi ý chiến dịch bằng AI dựa trên hiệu suất lead theo kênh. */
export function suggestCampaigns() {
  return apiFetch<CampaignSuggestResponse>("/admin/marketing/suggest", {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// MARKETING PIPELINE — dây chuyền sản xuất content AI (/admin/marketing/pipeline)
// ---------------------------------------------------------------------------

/** Danh sách pipeline (lọc kênh tuỳ chọn). */
export function listPipelines(params?: { channel?: string }) {
  const q = new URLSearchParams();
  if (params?.channel) q.set("channel", params.channel);
  const qs = q.toString();
  return apiFetch<{ pipelines: MarketingPipeline[]; count: number }>(
    `/admin/marketing/pipeline${qs ? `?${qs}` : ""}`,
  );
}

export function getMarketingPipeline(id: string) {
  return apiFetch<MarketingPipeline>(`/admin/marketing/pipeline/${id}`);
}

export function createPipeline(payload: PipelineCreatePayload) {
  return apiFetch<MarketingPipeline>("/admin/marketing/pipeline", {
    method: "POST",
    body: payload,
  });
}

export function updatePipeline(id: string, payload: PipelineUpdatePayload) {
  return apiFetch<MarketingPipeline>(`/admin/marketing/pipeline/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deletePipeline(id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/marketing/pipeline/${id}`, {
    method: "DELETE",
  });
}

/** Sửa tay output 1 giai đoạn (research/script/content/video_script). */
export function editPipelineStage(id: string, stage: PipelineStage, output: string) {
  return apiFetch<MarketingPipeline>(`/admin/marketing/pipeline/${id}/stage/${stage}`, {
    method: "PUT",
    body: { output },
  });
}

/** Chạy 1 giai đoạn AI. */
export function runPipelineStage(id: string, stage: PipelineStage) {
  return apiFetch<PipelineRunResponse>(
    `/admin/marketing/pipeline/${id}/run-stage/${stage}`,
    { method: "POST" },
  );
}

/** Chạy toàn bộ dây chuyền (mặc định dừng trước publish). */
export function runPipelineAll(id: string, payload?: PipelineRunAllPayload) {
  return apiFetch<PipelineRunResponse>(`/admin/marketing/pipeline/${id}/run-all`, {
    method: "POST",
    body: payload ?? {},
  });
}

/** Đăng nội dung pipeline lên kênh (bắt buộc confirm=true). */
export function publishPipeline(id: string, payload: PipelinePublishPayload) {
  return apiFetch<PipelineRunResponse>(`/admin/marketing/pipeline/${id}/publish`, {
    method: "POST",
    body: payload,
  });
}

// ---------------------------------------------------------------------------
// ĐỘI SALE AI (Sales Crew / CrewAI) — /admin/crew/* (require_admin)
// Chỉ ĐỌC + TẠO NHÁP. Không có endpoint gửi tin thật ở client.
// ---------------------------------------------------------------------------

/** Trạng thái runtime của crew (bật/tắt, live/fallback/disabled, điều kiện). */
export function getCrewStatus() {
  return apiFetch<CrewStatus>("/admin/crew/status");
}

/** Danh sách template agent (Tư vấn viên · Chăm sóc · Chốt deal). */
export function listCrewAgents() {
  return apiFetch<CrewAgentsResponse>("/admin/crew/agents");
}

/** Chạy đội sale cho 1 lead → phân tích + đề xuất + tin nhắn NHÁP. */
export function runCrewForLead(leadId: string, payload?: CrewRunPayload) {
  return apiFetch<CrewRunResult>(`/admin/crew/leads/${leadId}/run`, {
    method: "POST",
    body: payload ?? {},
  });
}

// ---------------------------------------------------------------------------
// ĐỘI SALE AI ("1000 saleman AI") — /admin/ai-sales/* (require_admin)
// Tự động gán (nội bộ) OK; mọi tin ra khách thật chỉ ở dạng NHÁP cần xác nhận.
// ---------------------------------------------------------------------------

/** Thống kê đội sale AI (tổng / hoạt động / đã gán / tải trung bình). */
export function getAiSalesStats() {
  return apiFetch<AiSalesStats>("/admin/ai-sales/stats");
}

/** Danh sách sale AI (phân trang/tìm kiếm/lọc). */
export function listAiSalesmen(params?: {
  status?: string;
  specialty?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.specialty) q.set("specialty", params.specialty);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  const qs = q.toString();
  return apiFetch<AiSalesPage>(`/admin/ai-sales${qs ? `?${qs}` : ""}`);
}

/** Khởi tạo roster (idempotent) — mặc định 1000 sale AI. */
export function seedAiSales(count = 1000) {
  return apiFetch<AiSalesSeedResult>("/admin/ai-sales/seed", {
    method: "POST",
    body: { count },
  });
}

/** Chi tiết 1 sale AI. */
export function getAiSalesman(id: string) {
  return apiFetch<AiSalesman>(`/admin/ai-sales/${id}`);
}

/** Gán / chuyển sale AI cho 1 lead (id trống → tự chọn cân tải). */
export function assignAiSalesman(
  leadId: string,
  payload?: { ai_salesman_id?: string; product_type?: string },
) {
  return apiFetch<AiSalesAssignResult>(`/admin/ai-sales/leads/${leadId}/assign`, {
    method: "POST",
    body: payload ?? {},
  });
}

/** Chạy chăm sóc 1 khách qua sale AI phụ trách → phân tích + tin NHÁP (không gửi). */
export function runAiCareForLead(leadId: string, payload?: CrewRunPayload) {
  return apiFetch<AiCareResult>(`/admin/ai-sales/leads/${leadId}/run-care`, {
    method: "POST",
    body: payload ?? {},
  });
}
