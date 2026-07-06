"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "elc_pwa_install_dismissed";

/**
 * Biểu ngữ "Cài đặt ứng dụng" gọn, hiện ở đáy màn hình mobile khi trình duyệt
 * phát beforeinstallprompt (Android/Chrome/Edge). Tự ẩn sau khi cài hoặc khi
 * người dùng đóng (ghi nhớ trong phiên qua sessionStorage).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setVisible(false);
      setDeferred(null);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-50 px-3 lg:left-auto lg:right-4 lg:bottom-4 lg:max-w-sm lg:px-0">
      <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-white p-3 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
          Happy Home
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-brand-900">
            Cài đặt ứng dụng Happy Home
          </div>
          <div className="truncate text-xs text-brand-600">
            Mở nhanh từ màn hình chính, dùng như app.
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50"
        >
          Để sau
        </button>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
        >
          Cài đặt
        </button>
      </div>
    </div>
  );
}
