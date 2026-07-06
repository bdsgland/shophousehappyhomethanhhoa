"use client";

/**
 * Facebook Sign-In Button — dùng FB SDK client-side.
 *
 * Luồng:
 *  1. Load FB SDK 1 lần (script tag), khởi tạo FB.init bằng NEXT_PUBLIC_FACEBOOK_APP_ID.
 *  2. User click → FB.login({scope:'public_profile,email'}) → SDK trả accessToken.
 *  3. POST { access_token, role, ref } → /auth/facebook/token (backend xác thực
 *     + tạo/link user + trả JWT).
 *  4. Lưu cookie auth + user → điều hướng theo vai trò (hoặc ?next=).
 *
 * Khi không có NEXT_PUBLIC_FACEBOOK_APP_ID → component ẩn (tránh render button chết).
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isExternalUrl, redirectByRole, setAuthCookie, setUserCookie } from "@/lib/auth";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const APP_ID =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ||
      process.env.NEXT_PUBLIC_FB_APP_ID ||
      "")) ||
  "";

const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "https://api-happyhomethanhhoa.bdsg.land";

const FB_VERSION = "v19.0";

function loadFbSdk(): Promise<void> {
  return new Promise((resolve) => {
    if (!APP_ID) return resolve();
    if (typeof window === "undefined") return resolve();
    if (window.FB) return resolve();

    window.fbAsyncInit = function () {
      window.FB!.init({
        appId: APP_ID,
        cookie: true,
        xfbml: false,
        version: FB_VERSION,
      });
      try {
        window.FB!.AppEvents.logPageView();
      } catch {}
      resolve();
    };

    const id = "facebook-jssdk";
    if (document.getElementById(id)) {
      // Script đã có nhưng FB chưa ready → đợi fbAsyncInit.
      return;
    }
    const js = document.createElement("script");
    js.id = id;
    js.src = `https://connect.facebook.net/vi_VN/sdk.js`;
    js.async = true;
    js.defer = true;
    document.body.appendChild(js);
  });
}

type Props = {
  role?: "client" | "sale";
  refCode?: string;
};

export default function FacebookSignInButton({
  role = "client",
  refCode,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!APP_ID) return;
    loadFbSdk().then(() => setReady(true));
  }, []);

  if (!APP_ID) return null;

  async function onClick() {
    setError(null);
    if (!window.FB) {
      setError("Facebook SDK chưa sẵn sàng, thử lại sau.");
      return;
    }
    setLoading(true);
    window.FB.login(
      (response: any) => {
        (async () => {
          try {
            if (response?.status !== "connected" || !response?.authResponse?.accessToken) {
              setError("Bạn đã huỷ đăng nhập Facebook hoặc không cấp quyền.");
              return;
            }
            const accessToken = response.authResponse.accessToken;

            const res = await fetch(`${API_BASE}/auth/facebook/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: accessToken,
                role,
                ref: refCode || undefined,
              }),
              credentials: "include",
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body?.detail || "Đăng nhập Facebook thất bại");
            }
            const data = await res.json();
            setAuthCookie(data.access_token, data.expires_in);
            setUserCookie(data.user, data.expires_in);
            const dest = next || redirectByRole(data.user.role);
            if (isExternalUrl(dest)) {
              window.location.href = dest;
              return;
            }
            router.replace(dest);
            router.refresh();
          } catch (err) {
            setError((err as Error).message || "Đăng nhập Facebook thất bại.");
          } finally {
            setLoading(false);
          }
        })();
      },
      { scope: "public_profile,email" }
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!ready || loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-100 bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.261c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33V21.88C18.343 21.128 22 16.991 22 12z" />
        </svg>
        {loading ? "Đang xử lý…" : "Đăng nhập với Facebook"}
      </button>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
