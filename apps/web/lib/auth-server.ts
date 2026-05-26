import { cookies } from "next/headers";

import { AUTH_COOKIE } from "@/lib/auth";

export function getServerToken(): string | null {
  return cookies().get(AUTH_COOKIE)?.value ?? null;
}
