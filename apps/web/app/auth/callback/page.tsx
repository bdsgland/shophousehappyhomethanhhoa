"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchMe } from "@/lib/api";
import { isExternalUrl, redirectByRole, setAuthCookie, setUserCookie } from "@/lib/auth";

// Bản đồ mã lỗi từ backend → thông báo tiếng Việt cho người dùng.
const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Đăng nhập Google thất bại. Vui lòng thử lại.",
  missing_params: "Thiếu thông tin xác thực từ Google.",
  invalid_state: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  google_exchange_failed: "Không kết nối được Google. Vui lòng thử lại.",
  no_email: "Không lấy được email từ tài khoản Google.",
  email_unverified: "Email Google chưa được xác minh.",
  not_workspace: "Tài khoản này không thuộc tổ chức Happy Home Thanh Hóa.",
  not_admin: "Tài khoản này không có quyền quản trị viên.",
  account_disabled: "Tài khoản đã bị khoá. Liên hệ quản trị viên.",
  user_create_failed: "Không tạo được tài khoản. Vui lòng thử lại.",
};

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get("token");
    const errCode = params.get("error");
    const next = params.get("next");
    const isNewUser = params.get("new_user") === "true";

    if (errCode || !token) {
      setError(ERROR_MESSAGES[errCode || "oauth_failed"] || ERROR_MESSAGES.oauth_failed);
      const t = setTimeout(() => router.replace("/login?error=oauth_failed"), 2500);
      return () => clearTimeout(t);
    }

    // Token hợp lệ: lấy thông tin user để lưu cookie + điều hướng theo vai trò.
    (async () => {
      const user = await fetchMe(token);
      if (!user) {
        setError(ERROR_MESSAGES.oauth_failed);
        setTimeout(() => router.replace("/login?error=oauth_failed"), 2500);
        return;
      }
      // JWT backend 365 ngày; cookie 365 ngày để không đá user ra.
      const maxAge = 60 * 60 * 24 * 365;
      setAuthCookie(token, maxAge);
      setUserCookie(user, maxAge);
      const dest = next || redirectByRole(user.role);
      if (isExternalUrl(dest)) {
        window.location.href = dest;
        return;
      }
      router.replace(dest);
      router.refresh();
    })();
  }, [router]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center p-12 text-center">
      {error ? (
        <>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
          <p className="mt-3 text-xs text-brand-600">Đang đưa bạn về trang đăng nhập…</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
          <p className="mt-4 text-sm text-brand-700">Đang xử lý đăng nhập Google…</p>
        </>
      )}
    </div>
  );
}
