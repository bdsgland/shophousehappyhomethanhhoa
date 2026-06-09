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
  signal?: AbortSignal;
}): Promise<InventoryUnit[] | null> {
  try {
    const params = new URLSearchParams();
    if (opts?.phankhu && opts.phankhu !== "Tất cả")
      params.set("phankhu", opts.phankhu);
    if (opts?.status && opts.status !== "Tất cả")
      params.set("status", opts.status);
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
      position?: { x: number; y: number };
    }>;
    return data.map((u) => ({
      code: u.id,
      zone: u.phan_khu,
      type: u.loai,
      area: u.dien_tich,
      facade: u.mat_tien,
      status: u.trang_thai,
      price: u.gia,
      position: u.position,
    }));
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
  position?: { x: number; y: number };
};

/** Chuẩn hoá RawUnit → InventoryUnit (field tiếng Anh) dùng chung cho UI. */
export function normalizeUnit(u: RawUnit): InventoryUnit {
  return {
    code: u.id,
    zone: u.phan_khu,
    type: u.loai,
    area: u.dien_tich,
    facade: u.mat_tien,
    status: u.trang_thai,
    price: u.gia,
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
