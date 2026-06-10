// Nạp Stringee Web SDK từ CDN (1 lần, dùng chung). SDK expose global
// `StringeeClient` + `StringeeCall2`. KHÔNG bundle vào app — chỉ tải khi cần gọi.

const SDK_URL = "https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    StringeeClient?: any;
    StringeeCall2?: any;
  }
}

let sdkPromise: Promise<void> | null = null;

/** Tải Stringee Web SDK (idempotent). Trả Promise resolve khi global sẵn sàng. */
export function loadStringeeSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Stringee SDK chỉ chạy trên trình duyệt"));
  }
  if (window.StringeeClient) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Không tải được Stringee Web SDK")));
      if (window.StringeeClient) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Không tải được Stringee Web SDK (kiểm tra mạng/CDN)."));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}
