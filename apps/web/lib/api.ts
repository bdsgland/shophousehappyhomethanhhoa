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
