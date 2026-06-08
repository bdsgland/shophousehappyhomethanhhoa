import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth";
import { decodeJwtPayload } from "@/lib/jwt";

const PROTECTED_PREFIXES = ["/leads", "/admin", "/dashboard", "/agent", "/client"];
const ADMIN_PREFIX = "/admin";
const CLIENT_PREFIX = "/client";
// Khu vực nội bộ (sale/admin) — khách hàng (client) không được vào.
const STAFF_PREFIXES = ["/leads", "/dashboard", "/agent", "/admin"];

// App Admin riêng (đồng bộ với ADMIN_APP_URL bên lib/auth.ts).
const ADMIN_APP_URL =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ??
  "https://admin.eurowindowlightcity.net";

/**
 * Redirect "về portal của tôi" khi bị chặn vào khu không thuộc quyền.
 * - admin → app Admin riêng (external)
 * - sale  → CRM
 * - client→ khu khách hàng
 */
function redirectToPortal(req: NextRequest, role: string | undefined) {
  if (role === "admin") {
    return NextResponse.redirect(ADMIN_APP_URL);
  }
  const url = req.nextUrl.clone();
  url.pathname = role === "client" ? "/client" : "/agent/crm";
  url.search = "";
  return NextResponse.redirect(url);
}

function startsWithPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/elc-home.html", req.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((p) =>
    startsWithPrefix(pathname, p),
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwtPayload(token);
  const role = payload?.role;

  // Khu admin: chỉ admin. Sale/client bị đẩy về portal của họ.
  if (startsWithPrefix(pathname, ADMIN_PREFIX) && role !== "admin") {
    return redirectToPortal(req, role);
  }

  // Khu /client: chỉ khách hàng. Sale/admin bị đẩy về portal của họ.
  if (startsWithPrefix(pathname, CLIENT_PREFIX) && role !== "client") {
    return redirectToPortal(req, role);
  }

  // Khu nội bộ (sale/admin): khách hàng không được vào → đẩy về /client.
  const inStaffArea = STAFF_PREFIXES.some((p) => startsWithPrefix(pathname, p));
  if (inStaffArea && role === "client") {
    return redirectToPortal(req, "client");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/leads/:path*",
    "/leads",
    "/admin/:path*",
    "/admin",
    "/dashboard/:path*",
    "/dashboard",
    "/agent/:path*",
    "/agent",
    "/client/:path*",
    "/client",
  ],
};
