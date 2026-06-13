import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, isAgencyRole } from "@/lib/auth";
import { decodeJwtPayload } from "@/lib/jwt";

const PROTECTED_PREFIXES = [
  "/leads",
  "/admin",
  "/agency",
  "/agency-admin",
  "/agency-onboarding",
  "/dashboard",
  "/agent",
  "/client",
];
const ADMIN_PREFIX = "/admin";
// Khu điều hành chủ sàn (Agency) — chỉ admin/manager.
const AGENCY_PREFIX = "/agency";
// Khu QUẢN TRỊ SÀN F2 (đại lý tự đăng ký, role="agency") — đa-tenant, tách khỏi
// /agency (vốn dành admin/manager toàn nền tảng).
const AGENCY_ADMIN_PREFIX = "/agency-admin";
const CLIENT_PREFIX = "/client";
// Khu vực nội bộ (sale/admin) — khách hàng (client) không được vào.
const STAFF_PREFIXES = ["/leads", "/dashboard", "/agent", "/admin", "/agency"];

/**
 * Redirect "về portal của tôi" khi bị chặn vào khu không thuộc quyền.
 * - admin/manager → khu điều hành chủ sàn PWA "/agency" (giữ trong domain www)
 * - sale          → CRM
 * - client        → khu khách hàng
 */
function redirectToPortal(req: NextRequest, role: string | undefined) {
  const url = req.nextUrl.clone();
  url.search = "";
  if (role === "agency") {
    // Đại lý F2 tự đăng ký → khu QUẢN TRỊ SÀN F2 đa-tenant (không phải /agency
    // điều hành toàn nền tảng). Khu này tự gồm link sang hồ sơ/onboarding.
    url.pathname = "/agency-admin";
  } else if (isAgencyRole(role)) {
    url.pathname = "/agency";
  } else if (role === "client") {
    url.pathname = "/client";
  } else {
    url.pathname = "/agent/crm";
  }
  return NextResponse.redirect(url);
}

function startsWithPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Phân loại landing theo TÊN MIỀN (host-based) khi truy cập trang gốc "/".
 * - host bắt đầu "app."    → landing APP (giới thiệu + đăng ký/đăng nhập khách & sale)
 * - host bắt đầu "agency." → landing AGENCY (giới thiệu sàn + đăng nhập chủ sàn)
 * - host khác (www / root) → giữ nguyên trang chủ www hiện tại (/elc-home.html)
 *
 * Chỉ dùng next REWRITE nội bộ (URL trên trình duyệt vẫn là "/"), không redirect
 * nên KHÔNG gây vòng lặp. Các route khác (/login, /agent, /agency, /client, …)
 * KHÔNG bị ảnh hưởng — chúng đi tiếp xuống logic bảo vệ bên dưới như cũ.
 */
function homeRewriteTarget(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith("app.")) return "/landing/app";
  if (h.startsWith("agency.")) return "/landing/agency";
  return "/elc-home.html";
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/") {
    // Header host (có thể kèm port). req.headers.get("host") đáng tin trên Vercel/Node.
    const host = req.headers.get("host") ?? req.nextUrl.host ?? "";
    return NextResponse.rewrite(new URL(homeRewriteTarget(host), req.url));
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

  // Khu điều hành chủ sàn (Agency): chỉ admin/manager. Còn lại bị đẩy về portal.
  if (startsWithPrefix(pathname, AGENCY_PREFIX) && !isAgencyRole(role)) {
    return redirectToPortal(req, role);
  }

  // Khu QUẢN TRỊ SÀN F2 (đa-tenant): chỉ role "agency" (admin được vào để hỗ trợ).
  if (
    startsWithPrefix(pathname, AGENCY_ADMIN_PREFIX) &&
    role !== "agency" &&
    role !== "admin"
  ) {
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

  // Chủ sàn F2 (agency) KHÔNG được vào khu sale/dashboard nội bộ → đẩy về khu
  // quản trị sàn riêng. Gốc lỗi cũ: agency lọt vào /agent/crm (dashboard sale).
  if (inStaffArea && role === "agency") {
    return redirectToPortal(req, "agency");
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
    "/agency/:path*",
    "/agency",
    "/agency-admin/:path*",
    "/agency-admin",
    "/agency-onboarding/:path*",
    "/agency-onboarding",
    "/dashboard/:path*",
    "/dashboard",
    "/agent/:path*",
    "/agent",
    "/client/:path*",
    "/client",
  ],
};
