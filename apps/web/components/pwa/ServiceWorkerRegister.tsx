"use client";

import { useEffect } from "react";

/**
 * Đăng ký service worker thủ công (không dùng next-pwa để tránh thêm dependency
 * và giữ next build luôn pass). Chỉ chạy ở production và khi trình duyệt hỗ trợ.
 * SW chỉ là lớp giao diện/offline — KHÔNG đụng auth/secret.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Chỉ bật ở production để không phá hot-reload khi dev.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* im lặng — PWA chỉ là enhancement */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
