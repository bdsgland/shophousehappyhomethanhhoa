import type { AuthUser } from "@/lib/api";

export const AUTH_COOKIE = "auth_token";
export const USER_COOKIE = "auth_user";

function isProd() {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

export function setAuthCookie(token: string, expiresInSeconds: number) {
  if (typeof document === "undefined") return;
  const maxAge = Math.max(60, expiresInSeconds);
  const flags = `Path=/; Max-Age=${maxAge}; SameSite=Lax${isProd() ? "; Secure" : ""}`;
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; ${flags}`;
}

export function setUserCookie(user: AuthUser, expiresInSeconds: number) {
  if (typeof document === "undefined") return;
  const maxAge = Math.max(60, expiresInSeconds);
  const flags = `Path=/; Max-Age=${maxAge}; SameSite=Lax${isProd() ? "; Secure" : ""}`;
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(JSON.stringify(user))}; ${flags}`;
}

export function clearAuthCookies() {
  if (typeof document === "undefined") return;
  const expire = "Path=/; Max-Age=0; SameSite=Lax";
  document.cookie = `${AUTH_COOKIE}=; ${expire}`;
  document.cookie = `${USER_COOKIE}=; ${expire}`;
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.substring(name.length + 1));
}

export function readUserFromCookie(): AuthUser | null {
  const raw = readCookie(USER_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  return readCookie(AUTH_COOKIE);
}

/**
 * URL của app Admin (Next app riêng, deploy domain riêng).
 * Có thể override bằng env NEXT_PUBLIC_ADMIN_APP_URL khi đổi domain.
 */
export const ADMIN_APP_URL =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ??
  "https://admin.eurowindowlightcity.net";

/** true nếu href là URL tuyệt đối (http/https) → cần điều hướng bằng window.location. */
export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * "Vào dashboard" theo vai trò:
 * - admin → app Admin riêng (external)
 * - sale  → CRM + giao dịch
 * - client→ khu khách hàng
 */
export function getDashboardUrl(role: string | undefined | null): string {
  switch (role) {
    case "admin":
      return ADMIN_APP_URL;
    case "client":
      return "/client";
    case "sale":
      return "/agent/crm";
    default:
      return "/login";
  }
}

/**
 * Đích điều hướng NGAY SAU khi đăng nhập/đăng ký TRÊN WEB www.
 *
 * Khác với getDashboardUrl (nút "vào dashboard" cho admin đang lướt www, có thể
 * sang app Admin riêng): sau khi đăng nhập ở www, user phải LUÔN ở lại domain
 * www, không bị bounce sang ADMIN_APP_URL. App Admin (apps/admin) có cổng login
 * Google riêng nên admin không bị khoá khỏi admin.
 *
 * - admin  → trang chủ www "/" (KHÔNG dùng URL admin tuyệt đối)
 * - client → khu khách hàng
 * - sale   → CRM
 */
export function redirectByRole(role: string | undefined | null): string {
  if (role === "admin") return "/";
  return getDashboardUrl(role);
}
