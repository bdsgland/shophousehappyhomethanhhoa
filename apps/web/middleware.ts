import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth";
import { decodeJwtPayload } from "@/lib/jwt";

const PROTECTED_PREFIXES = ["/leads", "/admin"];
const ADMIN_PREFIX = "/admin";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/elc-home.html", req.url));
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminArea =
    pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  if (isAdminArea) {
    const payload = decodeJwtPayload(token);
    if (!payload || payload.role !== "admin") {
      const denyUrl = req.nextUrl.clone();
      denyUrl.pathname = "/leads";
      denyUrl.searchParams.set("denied", "admin");
      return NextResponse.redirect(denyUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/leads/:path*", "/leads", "/admin/:path*", "/admin"],
};
