// Wrapper fetch tới FastAPI agent-engine, tự gắn JWT Bearer.

import { clearToken, getToken } from "./auth";
import type {
  AuditEvent,
  BackupEntry,
  BulkImportResult,
  ChatwootConversation,
  CommissionBreakdown,
  CommissionConfig,
  CommissionConfigVersion,
  CommissionRow,
  ConversationDetail,
  ConversationSummary,
  CrmLead,
  DriveSyncConfig,
  DriveSyncJob,
  DriveSyncResult,
  CrmLeadDetail,
  CrmLeadPage,
  CrmStats,
  DashboardKpi,
  ImportCommitPayload,
  ImportParsePreview,
  ImportResult,
  ImportWorkspaceStatus,
  LeadInsight,
  RescoreResult,
  InventoryBackupInfo,
  InventorySyncResult,
  InventoryUnit,
  KbStats,
  LearningDocument,
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

export function assignCrmLead(id: string, saleId: string) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}/assign`, {
    method: "PATCH",
    body: { sale_id: saleId },
  });
}

export function softDeleteCrmLead(id: string) {
  return apiFetch<CrmLead>(`/admin/crm/leads/${id}`, { method: "DELETE" });
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

/** Đọc Google Trang tính → headers + rows + gợi ý mapping (xem trước). */
export function parseImportGoogleSheet(payload: {
  sheet_url: string;
  sheet_name?: string | null;
}) {
  return apiFetch<ImportParsePreview>("/admin/import/google-sheet/parse", {
    method: "POST",
    body: payload,
  });
}

/** Upload CSV/XLSX (multipart) → headers + rows + gợi ý mapping. */
export function parseImportFile(file: File) {
  const form = new FormData();
  form.append("file", file);
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
