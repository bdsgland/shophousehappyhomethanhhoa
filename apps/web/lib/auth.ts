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
