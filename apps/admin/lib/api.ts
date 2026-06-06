// Wrapper fetch tới FastAPI agent-engine, tự gắn JWT Bearer.

import { clearToken, getToken } from "./auth";
import type {
  DashboardKpi,
  PlatformsHealthResponse,
  TokenResponse,
  User,
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
