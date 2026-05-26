"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChatWidget } from "@/components/ChatWidget";

const INITIAL_HEIGHT = 1600;

export default function HomePage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(INITIAL_HEIGHT);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const body = doc.body;
        const html = doc.documentElement;
        if (!body || !html) return;
        const next = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.scrollHeight,
          html.offsetHeight,
        );
        if (!cancelled && next > 0) {
          setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
        }
      } catch {
        // same-origin, hiếm khi vào nhánh này
      }
    };

    const attachObserver = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || !("ResizeObserver" in window)) return;
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => measure());
        if (doc.body) resizeObserver.observe(doc.body);
      } catch {
        /* ignore */
      }
    };

    const onLoad = () => {
      measure();
      attachObserver();
      // LadiPage render dần (font, ảnh, slider) — đo lại trong ~12s
      let ticks = 0;
      interval = setInterval(() => {
        measure();
        ticks += 1;
        if (ticks > 24 && interval) {
          clearInterval(interval);
          interval = null;
        }
      }, 500);
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      onLoad();
    }

    return () => {
      cancelled = true;
      iframe.removeEventListener("load", onLoad);
      if (interval) clearInterval(interval);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        src="/elc-home.html"
        title="Eurowindow Light City — Giới thiệu dự án"
        className="block w-full border-0"
        style={{ height: `${height}px` }}
        loading="eager"
      />
      <Link
        href="/login"
        className="fixed right-4 top-4 z-40 rounded-full border border-white/50 bg-white/70 px-3 py-1.5 text-xs font-medium text-brand-900 shadow-sm backdrop-blur transition hover:bg-white"
      >
        Đăng nhập Sale
      </Link>
      <ChatWidget />
    </>
  );
}
