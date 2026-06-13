export const AGENT_ENGINE_URL =
  process.env.NEXT_PUBLIC_AGENT_ENGINE_URL || "http://localhost:8000";

export type Lead = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  source_channel: string;
  project: string | null;
  project_slug: string | null;
  facebook_url: string | null;
  notes: string | null;
  status: "new" | "nurturing" | "hot" | "handed_off" | "lost";
  intent_score: number;
  created_at: string;
  updated_at: string;
};

export type ProjectSummary = {
  project_slug: string;
  project: string;
  lead_count: number;
};

export async function fetchHealth(): Promise<{
  status: string;
  service: string;
  version: string;
  llm_mode: string;
} | null> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchLeads(
  opts?: { project?: string; token?: string },
): Promise<Lead[]> {
  try {
    const qs = opts?.project
      ? `?project=${encodeURIComponent(opts.project)}`
      : "";
    const res = await fetch(`${AGENT_ENGINE_URL}/leads${qs}`, {
      cache: "no-store",
      headers: authHeaders(opts?.token),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchProjects(opts?: {
  token?: string;
}): Promise<ProjectSummary[]> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/leads/projects`, {
      cache: "no-store",
      headers: authHeaders(opts?.token),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  dob?: string | null;
  region?: string | null;
  referral_code?: string | null;
  upline_email?: string | null;
  projects_interested?: string[];
  favorites?: string[];
  telegram_chat_id?: string | null;
  created_at: string;
};

export type AdminOverview = {
  users_total: number;
  users_active: number;
  users_by_role: Record<string, number>;
  leads_total: number;
  backend_status: string;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
            .map(
              (d: { msg?: string }) =>
                typeof d?.msg === "string" ? d.msg : JSON.stringify(d),
            )
            .join(", ")
        : `Lỗi ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function authRegister(payload: {
  email: string;
  full_name: string;
  password: string;
  phone?: string;
  role?: "sale" | "client";
  ref?: string;
  projects_interested?: string[];
}): Promise<AuthTokenResponse> {
  return postJson<AuthTokenResponse>("/auth/register", payload);
}

export function authLogin(payload: {
  email: string;
  password: string;
}): Promise<AuthTokenResponse> {
  return postJson<AuthTokenResponse>("/auth/login", payload);
}

// ----- Đại lý F2 (đăng ký nhanh + hồ sơ điều kiện trong /agency) -----

export type AgencySaleInput = {
  name: string;
  phone?: string;
  email?: string;
};

export type AgencyRegisterPayload = {
  ten_san: string;
  nguoi_dai_dien: string;
  email: string;
  phone?: string;
  password: string;
};

export type AgencyBusinessInfo = {
  ten_dn?: string | null;
  ma_so_thue?: string | null;
  dia_chi?: string | null;
  nguoi_dai_dien_phap_luat?: string | null;
};

export type AgencyProgress = {
  business_ok: boolean;
  brokerage_ok: boolean;
  sales_count: number;
  sales_required: number;
  sales_ok: boolean;
  eligible: boolean;
};

export type Agency = {
  id: string;
  owner_user_id: string;
  ten_san: string;
  nguoi_dai_dien: string | null;
  phone: string | null;
  email: string | null;
  status: "pending" | "active" | "rejected";
  commission_tier: string;
  commission_pct: number | null;
  business_info: AgencyBusinessInfo;
  brokerage_declared: boolean;
  gpkd_so: string | null;
  sales: AgencySaleInput[];
  can_config_sale_commission: boolean;
  submitted_for_review: boolean;
  eligible: boolean;
  progress: AgencyProgress;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyProfileUpdate = {
  ten_san?: string;
  nguoi_dai_dien?: string;
  phone?: string;
  business_info?: AgencyBusinessInfo;
  brokerage_declared?: boolean;
  gpkd_so?: string;
  sales?: AgencySaleInput[];
  ghi_chu?: string;
};

/** Đăng ký nhanh làm đại lý → tạo tài khoản agency + trả token (auto login). */
export function agencyRegister(
  payload: AgencyRegisterPayload,
): Promise<AuthTokenResponse> {
  return postJson<AuthTokenResponse>("/agency/register", payload);
}

/** Hồ sơ đại lý của tài khoản hiện tại (role agency). */
export function fetchAgencyMe(token: string): Promise<Agency> {
  return requestJson<Agency>("/agency/me", { token });
}

/** Chủ sàn tự cập nhật hồ sơ điều kiện F2. */
export function updateAgencyProfile(
  token: string,
  body: AgencyProfileUpdate,
): Promise<Agency> {
  return requestJson<Agency>("/agency/me/profile", {
    method: "PUT",
    token,
    body,
  });
}

/** Gửi hồ sơ F2 cho admin duyệt (chỉ khi đủ điều kiện). */
export function submitAgencyForReview(token: string): Promise<Agency> {
  return requestJson<Agency>("/agency/me/submit-for-review", {
    method: "POST",
    token,
  });
}

export async function fetchAdminOverview(
  token: string,
): Promise<AdminOverview | null> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/admin/overview`, {
      cache: "no-store",
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as AdminOverview;
  } catch {
    return null;
  }
}

export async function fetchAdminUsers(token: string): Promise<AuthUser[]> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/admin/users`, {
      cache: "no-store",
      headers: authHeaders(token),
    });
    if (!res.ok) return [];
    return (await res.json()) as AuthUser[];
  } catch {
    return [];
  }
}

export async function patchAdminUser(
  token: string,
  userId: string,
  body: { role?: string; is_active?: boolean },
): Promise<AuthUser> {
  const res = await fetch(`${AGENT_ENGINE_URL}/admin/users/${userId}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : `Lỗi ${res.status}`);
  }
  return data as AuthUser;
}

export async function fetchMe(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/auth/me`, {
      cache: "no-store",
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthUser;
  } catch {
    return null;
  }
}

// ----- Portal cá nhân (/me) -----

export type CommissionTransaction = {
  date: string;
  type: string;
  customer: string;
  product: string;
  revenue: number;
  commission: number;
  status: string;
};

export type CommissionData = {
  total_received: number;
  this_month: number;
  pending: number;
  closed_count: number;
  current_tier: string;
  current_tier_label: string;
  luy_tien_level: number;
  luy_tien_pct: number;
  referral_commission_pct: number;
  transactions: CommissionTransaction[];
  referral_deals: Array<{
    customer: string;
    project: string;
    status: string;
    expected_commission: number;
  }>;
  monthly_revenue: number[];
};

export type ReferralNode = {
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  region?: string | null;
  closed_count?: number;
  commission_to_me?: number;
};

export type ReferralsData = {
  referral_code: string | null;
  upline: ReferralNode | null;
  downlines: ReferralNode[];
  team_size: number;
  team_revenue: number;
  team_commission_to_me: number;
};

async function requestJson<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${AGENT_ENGINE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...authHeaders(opts.token),
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

export function fetchAgentMe(token: string): Promise<AuthUser> {
  return requestJson<AuthUser>("/me", { token });
}

export function updateAgentProfile(
  token: string,
  body: {
    full_name?: string;
    phone?: string;
    dob?: string;
    region?: string;
    projects_interested?: string[];
  },
): Promise<AuthUser> {
  return requestJson<AuthUser>("/me", { method: "PATCH", token, body });
}

export function changeAgentPassword(
  token: string,
  body: { old_password: string; new_password: string },
): Promise<{ ok: boolean; message: string }> {
  return requestJson("/me/change-password", { method: "POST", token, body });
}

// ----- Liên kết Telegram -----

export type TelegramStatus = {
  linked: boolean;
  chat_id: string | null;
  bot_username: string;
};

export type TelegramLinkToken = {
  verification_token: string;
  bot_username: string;
  deep_link: string;
  expires_in: number;
};

export function fetchTelegramStatus(token: string): Promise<TelegramStatus> {
  return requestJson<TelegramStatus>("/me/telegram", { token });
}

export function requestTelegramLinkToken(
  token: string,
): Promise<TelegramLinkToken> {
  return requestJson<TelegramLinkToken>("/me/telegram/link-token", {
    method: "POST",
    token,
  });
}

export function unlinkTelegram(
  token: string,
): Promise<{ ok: boolean; linked: boolean }> {
  return requestJson("/me/telegram", { method: "DELETE", token });
}

export function fetchCommission(token: string): Promise<CommissionData> {
  return requestJson<CommissionData>("/me/commission", { token });
}

export type FrontlineKPITier = {
  tier_id: number;
  name: string;
  min_monthly_volume: number;
  max_monthly_volume: number | null;
  frontline_percentage: number;
  ekip_bonus_percentage: number;
  description_vi: string;
};

export type MyCommissionTier = {
  current_tier: FrontlineKPITier;
  monthly_volume_so_far: number;
  next_tier: FrontlineKPITier | null;
  progress_percentage: number;
  amount_to_next_tier: number;
  all_tiers: FrontlineKPITier[];
  referral_bonus: { enabled: boolean; percentage_of_commission: number };
};

/** Bậc KPI lũy tiến hiện tại của sale frontline (cấu hình động từ admin). */
export function fetchMyCommissionTier(token: string): Promise<MyCommissionTier> {
  return requestJson<MyCommissionTier>("/sale/commission/me/current-tier", {
    token,
  });
}

export function fetchReferrals(token: string): Promise<ReferralsData> {
  return requestJson<ReferralsData>("/me/referrals", { token });
}

export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type ChatReply = {
  reply: string;
  intent_score: number;
  is_hot: boolean;
  suggested_next_step: string | null;
};

// ----- Inventory (quỹ căn) -----

export type InventoryUnit = {
  code: string;
  zone: string;
  type: string;
  area: number;
  facade: number;
  status: string;
  price: string;
  fund?: string; // quỹ (key: exclusive|bonus|agency_f1|mid|not_open)
  gia_ny_gom_vat_kpbt?: number; // N — giá niêm yết chi tiết (0/None = chưa có)
  has_price?: boolean; // true khi có giá chi tiết → cho lập phiếu tính giá
  position?: { x: number; y: number };
};

export type InventoryStats = {
  total: number;
  available: number;
  sold: number;
  reserved: number;
};

const INVENTORY_SLUG = "eurowindow-light-city";

/** Lấy danh sách quỹ căn. Trả null nếu không kết nối được API (để UI fallback). */
export async function fetchInventory(opts?: {
  phankhu?: string;
  status?: string;
  quy?: string;
  signal?: AbortSignal;
}): Promise<InventoryUnit[] | null> {
  try {
    const params = new URLSearchParams();
    if (opts?.phankhu && opts.phankhu !== "Tất cả")
      params.set("phankhu", opts.phankhu);
    if (opts?.status && opts.status !== "Tất cả")
      params.set("status", opts.status);
    if (opts?.quy && opts.quy !== "Tất cả") params.set("quy", opts.quy);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(
      `${AGENT_ENGINE_URL}/inventory/${INVENTORY_SLUG}/units${qs}`,
      { cache: "no-store", signal: opts?.signal },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      id: string;
      phan_khu: string;
      loai: string;
      dien_tich: number;
      mat_tien: number;
      trang_thai: string;
      gia: string;
      quy?: string;
      gia_ny_gom_vat_kpbt?: number;
      position?: { x: number; y: number };
    }>;
    return data.map((u) => {
      const ny = Number(u.gia_ny_gom_vat_kpbt) || 0;
      return {
        code: u.id,
        zone: u.phan_khu,
        type: u.loai,
        area: u.dien_tich,
        facade: u.mat_tien,
        status: u.trang_thai,
        price: u.gia,
        fund: u.quy,
        gia_ny_gom_vat_kpbt: ny,
        has_price: ny > 0,
        position: u.position,
      };
    });
  } catch {
    return null;
  }
}

/** Thống kê quỹ căn. Trả null nếu không kết nối được API. */
export async function fetchInventoryStats(
  signal?: AbortSignal,
): Promise<InventoryStats | null> {
  try {
    const res = await fetch(
      `${AGENT_ENGINE_URL}/inventory/${INVENTORY_SLUG}/stats`,
      { cache: "no-store", signal },
    );
    if (!res.ok) return null;
    return (await res.json()) as InventoryStats;
  } catch {
    return null;
  }
}

// ----- Nội dung dự án (Project CMS — admin sửa, đồng bộ ra sale/khách) -----

export type ProjectHeroImage = { src: string; caption: string };
export type ProjectKeyValue = { label: string; value: string };
export type ProjectConnection = { place: string; time: string };
export type ProjectTrainingItem = {
  title: string;
  size: string;
  date: string;
  href: string;
  ready: boolean;
};
export type ProjectSubzone = {
  name: string;
  style: string;
  units: string;
  desc: string;
  img: string;
};
export type ProjectTour360 = { title: string; img: string; ready: boolean };
export type ProjectPolicyCard = {
  title: string;
  date: string;
  open: boolean;
  summary: string;
  highlights: string[];
};
export type ProjectPriceRow = { product: string; area: string; from: string };
export type ProjectTimelineItem = {
  period: string;
  title: string;
  desc: string;
  img: string;
};
export type ProjectNewsItem = {
  title: string;
  date: string;
  excerpt: string;
  img: string;
  url: string;
};

export type ProjectContent = {
  overview: { hero_images: ProjectHeroImage[]; rows: ProjectKeyValue[] };
  location: {
    description: string;
    connections: ProjectConnection[];
    map_lat: number | null;
    map_lng: number | null;
  };
  training: { items: ProjectTrainingItem[] };
  subzones: { items: ProjectSubzone[] };
  gallery360: { items: ProjectTour360[] };
  policy: {
    policies: ProjectPolicyCard[];
    price_table: ProjectPriceRow[];
    commission_note: string;
  };
  timeline: { items: ProjectTimelineItem[] };
  news: { items: ProjectNewsItem[] };
};

export type ProjectDoc = {
  slug: string;
  name: string;
  tagline: string;
  status: string;
  developer: string;
  location: string;
  content: ProjectContent;
  version: number;
  last_updated_at: string | null;
};

/** Nội dung biên tập dự án (CMS). Lỗi/không kết nối → null để UI fallback elc-data. */
export async function fetchProject(slug: string): Promise<ProjectDoc | null> {
  try {
    const res = await fetch(
      `${AGENT_ENGINE_URL}/projects/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProjectDoc;
  } catch {
    return null;
  }
}

// ----- Portal khách hàng (/client) -----

/** Raw unit từ backend (giữ field tiếng Việt) cho phần gợi ý/yêu thích. */
export type RawUnit = {
  id: string;
  lo: string;
  phan_khu: string;
  loai: string;
  dien_tich: number;
  mat_tien: number;
  trang_thai: string;
  gia_tri: number;
  gia: string;
  quy?: string;
  gia_ny_gom_vat_kpbt?: number;
  position?: { x: number; y: number };
};

/** Chuẩn hoá RawUnit → InventoryUnit (field tiếng Anh) dùng chung cho UI. */
export function normalizeUnit(u: RawUnit): InventoryUnit {
  const ny = Number(u.gia_ny_gom_vat_kpbt) || 0;
  return {
    code: u.id,
    zone: u.phan_khu,
    type: u.loai,
    area: u.dien_tich,
    facade: u.mat_tien,
    status: u.trang_thai,
    price: u.gia,
    fund: u.quy,
    gia_ny_gom_vat_kpbt: ny,
    has_price: ny > 0,
    position: u.position,
  };
}

export function fetchRecommended(token: string): Promise<RawUnit[]> {
  return requestJson<RawUnit[]>("/client/recommended", { token });
}

export function fetchFavorites(
  token: string,
): Promise<{ unit_ids: string[]; units: RawUnit[] }> {
  return requestJson("/me/favorites", { token });
}

export function addFavorite(
  token: string,
  unitId: string,
): Promise<{ ok: boolean; unit_ids: string[] }> {
  return requestJson(`/me/favorites/${encodeURIComponent(unitId)}`, {
    method: "POST",
    token,
  });
}

export function removeFavorite(
  token: string,
  unitId: string,
): Promise<{ ok: boolean; unit_ids: string[] }> {
  return requestJson(`/me/favorites/${encodeURIComponent(unitId)}`, {
    method: "DELETE",
    token,
  });
}

// ----- Tài liệu dự án (đồng bộ từ Google Drive, hiển thị ở Chi tiết dự án) -----

export type ProjectDocument = {
  id: string;
  title: string;
  type: string;
  size: number;
  group: string | null;
  category: string;
  source: string;
  updated: string | null;
  download_url: string;
};

/** Danh sách tài liệu của 1 dự án (mọi user đăng nhập). Lỗi → trả [] để UI fallback. */
export async function fetchProjectDocuments(
  slug: string,
  token?: string,
): Promise<ProjectDocument[]> {
  try {
    const res = await fetch(
      `${AGENT_ENGINE_URL}/projects/${encodeURIComponent(slug)}/documents`,
      { cache: "no-store", headers: authHeaders(token) },
    );
    if (!res.ok) return [];
    return (await res.json()) as ProjectDocument[];
  } catch {
    return [];
  }
}

// Đuôi file xem inline được; còn lại (Office…) → tải về.
const VIEWABLE_DOC_EXTS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "md",
]);
const DOC_NOT_READY =
  "Tài liệu chưa sẵn sàng trên máy chủ (cần đồng bộ lại / kiểm tra lưu trữ).";

async function fetchProjectDocBlob(
  doc: ProjectDocument,
  token?: string,
): Promise<Blob> {
  const res = await fetch(`${AGENT_ENGINE_URL}${doc.download_url}`, {
    cache: "no-store",
    headers: authHeaders(token),
  });
  if (res.status === 404) throw new Error(DOC_NOT_READY);
  if (!res.ok) throw new Error(`Lỗi tải tài liệu (${res.status})`);
  const ct = res.headers.get("content-type") || undefined;
  const buf = await res.arrayBuffer();
  return new Blob([buf], ct ? { type: ct } : undefined);
}

function docExt(doc: ProjectDocument): string {
  return (doc.type || doc.download_url.split(".").pop() || "").toLowerCase();
}

/** Tải 1 tài liệu dự án (Bearer → blob MIME đúng → trigger download). */
export async function downloadProjectDocument(
  doc: ProjectDocument,
  token?: string,
): Promise<void> {
  const blob = await fetchProjectDocBlob(doc, token);
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
 * Xem tài liệu dự án theo ĐÚNG loại: PDF/ảnh/text → mở tab mới (inline, MIME
 * đúng); Office (xlsx/docx…) → tải về. 404 → báo rõ "chưa sẵn sàng trên máy chủ".
 */
export async function viewProjectDocument(
  doc: ProjectDocument,
  token?: string,
): Promise<void> {
  const blob = await fetchProjectDocBlob(doc, token);
  const url = URL.createObjectURL(blob);
  if (VIEWABLE_DOC_EXTS.has(docExt(doc))) {
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

export async function postChat(args: {
  messages: ChatTurn[];
  projectSlug?: string;
  signal?: AbortSignal;
}): Promise<ChatReply> {
  const res = await fetch(`${AGENT_ENGINE_URL}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: args.messages,
      project_slug: args.projectSlug ?? null,
    }),
    signal: args.signal,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data?.detail === "string" ? data.detail : "";
    } catch {
      // ignore
    }
    throw new Error(
      detail || `Agent trả lỗi ${res.status}. Vui lòng thử lại sau.`,
    );
  }
  return (await res.json()) as ChatReply;
}

// ===========================================================================
// AGENCY / Quản lý điều hành — gọi /admin/manager/* và /admin/ai-sales/*
// ---------------------------------------------------------------------------
// Mọi endpoint dưới đây backend gác bằng require_admin (JWT role=admin HOẶC API
// key admin_full). FE chỉ truyền Bearer JWT của tài khoản quản lý. Lỗi 401/403 →
// ApiError(status) để UI hiển thị "Tài khoản không có quyền quản lý".
// ===========================================================================

/** Lỗi API mang theo HTTP status để phân biệt 401/403 (thiếu quyền). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** true nếu lỗi là do thiếu quyền/đăng nhập (401/403). */
export function isPermissionError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

async function managerRequest<T>(
  path: string,
  token: string | null | undefined,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_ENGINE_URL}${path}`, {
      method: opts?.method ?? "GET",
      headers: {
        ...authHeaders(token ?? undefined),
        ...(opts?.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra kết nối mạng.");
  }
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
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ----- Types: báo cáo hệ thống (/admin/manager/system-report) -----

export type SystemReportLeads = {
  available: boolean;
  total?: number;
  hot?: number;
  warm?: number;
  cold?: number;
  customers?: number;
  lost?: number;
  conversion_rate?: number;
  top_sources?: Array<{ source?: string; count?: number } | unknown>;
};

export type SystemReportFunnel = {
  key: string;
  label: string;
  count: number | null;
};

export type SystemReportInventory = {
  total: number;
  available: number;
  sold: number;
  reserved: number;
  is_demo: boolean;
};

export type SystemReportSales = {
  orders_reserved: number;
  revenue_projection_ty: number;
  commission_rate: number;
  inventory: SystemReportInventory;
};

export type CommissionByStatus = Record<
  string,
  { count: number; amount: number }
>;

export type CommissionSummary = {
  deals: number;
  total_amount: number;
  by_status: CommissionByStatus;
};

export type SystemReportFinance = {
  available: boolean;
  period_label?: string;
  revenue?: number;
  cost?: number;
  profit?: number;
  margin?: number;
  deal_count?: number;
  commission?: CommissionSummary;
};

export type SystemReportAiCare = {
  available: boolean;
  total?: number;
  pending?: number;
  approved?: number;
  skipped?: number;
  sent?: number;
};

export type SystemReportAiSales = {
  available: boolean;
  total?: number;
  active?: number;
  inactive?: number;
  total_capacity?: number;
  total_assigned?: number;
  avg_load?: number;
  capacity_left?: number;
  load_ratio?: number;
};

export type MarketingChannel = {
  channel: string;
  leads: number;
  spent: number;
  cpl: number;
};

export type SystemReportMarketing = {
  available: boolean;
  total_spent?: number;
  total_leads?: number;
  avg_cpl?: number;
  roi?: number;
  by_channel?: MarketingChannel[];
};

export type PlatformHealth = {
  key: string;
  name: string;
  url: string;
  status?: string;
  code?: number | null;
  error?: string;
};

export type AutomationOverview = {
  configured: boolean;
  total?: number;
  active?: number;
  inactive?: number;
  runs_today?: number;
  errors_recent?: number;
  error?: string;
};

export type SystemReport = {
  generated_at: string;
  leads: SystemReportLeads;
  funnel: SystemReportFunnel[];
  sales: SystemReportSales;
  finance: SystemReportFinance;
  ai_care: SystemReportAiCare;
  ai_sales: SystemReportAiSales;
  marketing: SystemReportMarketing;
  platforms: PlatformHealth[];
  automation: AutomationOverview;
  openclaw: { configured: boolean; telegram_configured: boolean; bot_url?: string };
};

export function fetchManagerSystemReport(token: string): Promise<SystemReport> {
  return managerRequest<SystemReport>("/admin/manager/system-report", token);
}

// ----- Types: overview điều hành (/admin/manager/overview) -----

export type SalePerformance = {
  sale_id: string;
  sale_name: string;
  week_start?: string;
  avg_daily_score?: number;
  total_leads_added?: number;
  total_hot_leads_received?: number;
  total_deals_closed?: number;
  eligibility_score?: number;
  rank?: number;
};

export type ManagerOverview = {
  generated_at: string;
  sales: SystemReportSales;
  leads: Record<string, unknown>;
  top_sales: SalePerformance[];
  commission: CommissionSummary;
  automation: AutomationOverview;
  platforms: PlatformHealth[];
  openclaw: { configured: boolean; telegram_configured: boolean; bot_url?: string };
};

export function fetchManagerOverview(token: string): Promise<ManagerOverview> {
  return managerRequest<ManagerOverview>("/admin/manager/overview", token);
}

// ----- Types: Trung tâm quyết định (/admin/manager/decisions) -----

export type DecisionItem = {
  id: string;
  type: string;
  title: string;
  context: string;
  priority: "high" | "medium" | "low" | string;
  created_at?: string | null;
  actions: string[];
  meta?: Record<string, unknown>;
};

export type DecisionGroup = {
  type: string;
  label: string;
  count: number;
  priority: string;
  items: DecisionItem[];
};

export type DecisionsResponse = {
  generated_at: string;
  total: number;
  counts: Record<string, number>;
  groups: DecisionGroup[];
  items: DecisionItem[];
};

export type DecisionAction = "approve" | "execute" | "reject";

export type DecisionActResult = {
  type: string;
  id: string;
  action: string;
  ok?: boolean;
  message?: string;
  assigned_sale_id?: string;
  status?: string;
};

export function fetchManagerDecisions(token: string): Promise<DecisionsResponse> {
  return managerRequest<DecisionsResponse>("/admin/manager/decisions", token);
}

export function actOnManagerDecision(
  token: string,
  body: { type: string; id: string; action: DecisionAction },
): Promise<DecisionActResult> {
  return managerRequest<DecisionActResult>(
    "/admin/manager/decisions/act",
    token,
    { method: "POST", body },
  );
}

// ----- Types: Đề xuất cải tiến AI (/admin/manager/improvements) -----

export type Improvement = {
  title: string;
  area: string;
  severity: "high" | "medium" | "low" | string;
  detail: string;
  suggested_action: string;
};

export type ImprovementsResponse = {
  generated_by: string;
  generated_at: string;
  focus: string | null;
  improvements: Improvement[];
  report?: unknown;
};

export function generateManagerImprovements(
  token: string,
  focus?: string,
): Promise<ImprovementsResponse> {
  return managerRequest<ImprovementsResponse>(
    "/admin/manager/improvements",
    token,
    { method: "POST", body: focus ? { focus } : {} },
  );
}

// ----- Types: Đội Sale AI + hàng đợi chăm sóc (/admin/ai-sales/*) -----

export type AiSalesStats = {
  total?: number;
  active?: number;
  inactive?: number;
  total_capacity?: number;
  total_assigned?: number;
  avg_load?: number;
  capacity_left?: number;
  by_specialty?: Array<{
    key: string;
    label: string;
    count: number;
    assigned: number;
  }>;
};

export type CareQueueStats = {
  total?: number;
  pending?: number;
  approved?: number;
  skipped?: number;
  sent?: number;
  by_status?: Record<string, number>;
  config?: Record<string, unknown>;
};

export function fetchAiSalesStats(token: string): Promise<AiSalesStats> {
  return managerRequest<AiSalesStats>("/admin/ai-sales/stats", token);
}

export function fetchCareQueueStats(token: string): Promise<CareQueueStats> {
  return managerRequest<CareQueueStats>(
    "/admin/ai-sales/care-queue/stats",
    token,
  );
}
