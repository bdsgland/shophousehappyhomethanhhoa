import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { TOKEN_COOKIE } from "@/lib/auth";

// Chặn ở tầng edge: route admin yêu cầu có cookie token. Việc kiểm tra
// role=admin thực sự do AdminGuard (client) + backend require_admin đảm nhiệm —
// middleware chỉ chặn người chưa đăng nhập để khỏi nháy UI.
// /auth/callback nhận token Google qua URL fragment (không gửi lên server) rồi
// set cookie ở client → phải công khai, nếu không middleware sẽ đẩy về /login.
const PUBLIC_PATHS = ["/login", "/auth"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const hasToken = Boolean(req.cookies.get(TOKEN_COOKIE)?.value);

  // Chưa đăng nhập + vào route bảo vệ → đẩy về /login (giữ lại đích đến).
  if (!isPublic && !hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Đã đăng nhập mà còn vào /login → đưa về dashboard.
  if (isPublic && hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Áp dụng cho mọi route trừ static/asset/_next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
