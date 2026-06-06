// Quản lý token JWT phía client.
//
// Token được lưu trong COOKIE (không httpOnly — JS cần đọc để gắn header) để:
//   1. middleware.ts (edge) kiểm tra sự tồn tại token và chặn route admin,
//   2. lib/api.ts đọc token gắn vào Authorization Bearer.
// Đây là mức bảo mật MVP; production nên chuyển sang httpOnly cookie + refresh.

import type { User } from "./types";

export const TOKEN_COOKIE = "elc_admin_token";
const USER_KEY = "elc_admin_user";

function isBrowser() {
  return typeof document !== "undefined";
}

export function getToken(): string | null {
  if (!isBrowser()) return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TOKEN_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function setToken(token: string, expiresInSeconds: number) {
  if (!isBrowser()) return;
  const maxAge = Math.max(60, expiresInSeconds);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearToken() {
  if (!isBrowser()) return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function cacheUser(user: User) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function getCachedUser(): User | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
