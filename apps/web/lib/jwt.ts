/**
 * Decode JWT payload (KHÔNG verify chữ ký).
 *
 * Dùng trong middleware Edge runtime — chỉ để đọc role nhằm chuyển hướng UI.
 * KHÔNG thay thế cho việc backend verify token thật sự ở mỗi request /admin.
 */
export type JwtPayload = {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  [k: string]: unknown;
};

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}
