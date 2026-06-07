// Wrapper fetch tới FastAPI agent-engine, tự gắn JWT Bearer.

import { clearToken, getToken } from "./auth";
import type {
  AuditEvent,
  BackupEntry,
  BulkImportResult,
  ChatwootConversation,
  CommissionRow,
  ConversationDetail,
  ConversationSummary,
  DashboardKpi,
  InventoryUnit,
  KbStats,
  LearningDocument,
  PlatformsHealthResponse,
  ReferralNode,
  ResetPasswordResult,
  SaleRow,
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
}) {
  const q = new URLSearchParams();
  if (params?.phan_khu) q.set("phan_khu", params.phan_khu);
  if (params?.loai) q.set("loai", params.loai);
  if (params?.trang_thai) q.set("trang_thai", params.trang_thai);
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
  position?: { x: number; y: number };
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

export function listLearningDocuments(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<LearningDocument[]>(`/learning/documents${qs}`);
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

export function reindexKb() {
  return apiFetch<{ ok: boolean; documents: number; chunks: number }>(
    "/admin/kb/reindex-all",
    { method: "POST" },
  );
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
