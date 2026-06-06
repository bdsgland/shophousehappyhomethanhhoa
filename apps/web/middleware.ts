import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth";
import { decodeJwtPayload } from "@/lib/jwt";

const PROTECTED_PREFIXES = ["/leads", "/admin", "/dashboard", "/agent", "/client"];
const ADMIN_PREFIX = "/admin";
const CLIENT_PREFIX = "/client";
// Khu vực nội bộ (sale/admin) — khách hàng (client) không được vào.
const STAFF_PREFIXES = ["/leads", "/dashboard", "/agent", "/admin"];

/** Portal mặc định theo role — đồng bộ với redirectByRole bên client. */
function portalFor(role: string | undefined): string {
  if (role === "admin") return "/dashboard/project/eurowindow-light-city";
  if (role === "client") return "/client";
  return "/agent/profile";
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

  // Khu admin: chỉ admin.
  if (startsWithPrefix(pathname, ADMIN_PREFIX) && role !== "admin") {
    const denyUrl = req.nextUrl.clone();
    denyUrl.pathname = portalFor(role);
    denyUrl.search = "";
    denyUrl.searchParams.set("denied", "admin");
    return NextResponse.redirect(denyUrl);
  }

  // Khu /client: chỉ khách hàng. Sale/admin bị đẩy về portal của họ.
  if (startsWithPrefix(pathname, CLIENT_PREFIX) && role !== "client") {
    const denyUrl = req.nextUrl.clone();
    denyUrl.pathname = portalFor(role);
    denyUrl.search = "";
    return NextResponse.redirect(denyUrl);
  }

  // Khu nội bộ (sale/admin): khách hàng không được vào → đẩy về /client.
  const inStaffArea = STAFF_PREFIXES.some((p) => startsWithPrefix(pathname, p));
  if (inStaffArea && role === "client") {
    const denyUrl = req.nextUrl.clone();
    denyUrl.pathname = "/client";
    denyUrl.search = "";
    return NextResponse.redirect(denyUrl);
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
