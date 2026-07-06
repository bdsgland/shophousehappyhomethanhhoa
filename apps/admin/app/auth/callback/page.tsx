"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getMe } from "@/lib/api";
import { cacheUser, clearToken, setToken } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Đăng nhập Google thất bại. Vui lòng thử lại.",
  missing_params: "Thiếu thông tin xác thực từ Google.",
  invalid_state: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  google_exchange_failed: "Không kết nối được Google. Vui lòng thử lại.",
  no_email: "Không lấy được email từ tài khoản Google.",
  email_unverified: "Email Google chưa được xác minh.",
  not_workspace: "Tài khoản không thuộc tổ chức Happy Home Thanh Hóa.",
  not_admin: "Tài khoản này không có quyền quản trị viên.",
  account_disabled: "Tài khoản đã bị khoá.",
  user_create_failed: "Không tạo được tài khoản. Vui lòng thử lại.",
};

export default function AdminAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get("token");
    const errCode = params.get("error");

    if (errCode || !token) {
      setError(ERROR_MESSAGES[errCode || "oauth_failed"] || ERROR_MESSAGES.oauth_failed);
      setTimeout(() => router.replace("/login"), 2500);
      return;
    }

    // JWT backend 365 ngày; cookie giữ 365 ngày để không đá user ra.
    setToken(token, 60 * 60 * 24 * 365);
    (async () => {
      try {
        const user = await getMe();
        if (user.role !== "admin") {
          clearToken();
          setError(ERROR_MESSAGES.not_admin);
          setTimeout(() => router.replace("/login"), 2500);
          return;
        }
        cacheUser(user);
        router.replace("/");
      } catch {
        clearToken();
        setError(ERROR_MESSAGES.oauth_failed);
        setTimeout(() => router.replace("/login"), 2500);
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-br from-background to-secondary p-4 text-center">
      {error ? (
        <>
          <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
          <p className="text-xs text-muted-foreground">Đang đưa bạn về trang đăng nhập…</p>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Đang xử lý đăng nhập Google…</p>
        </>
      )}
    </div>
  );
}
