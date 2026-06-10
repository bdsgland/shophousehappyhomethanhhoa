"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";

import { Phone, RefreshCw, X } from "@/components/dashboard/icons";
import {
  attachCall,
  getCallConfig,
  getCallRecordingBlob,
  getCallToken,
  startCall,
  updateCallStatus,
} from "@/lib/crm";
import { loadStringeeSdk } from "@/lib/stringee";

type Phase =
  | "idle"
  | "preparing"
  | "calling"
  | "ringing"
  | "answered"
  | "ended"
  | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  preparing: "Đang chuẩn bị…",
  calling: "Đang gọi…",
  ringing: "Đang đổ chuông…",
  answered: "Đã kết nối",
  ended: "Đã kết thúc",
  error: "Lỗi",
};

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * Nút "Gọi" (click-to-call) qua Stringee Web SDK cho portal sale. Lấy client
 * token + thông tin gọi từ backend rồi gọi từ trình duyệt; hiện trạng thái cuộc
 * gọi + thời lượng. Chưa cấu hình Stringee → ẩn nút. `onEnded` để cha refresh 360.
 */
export function CallButton({
  token,
  leadId,
  phone,
  onEnded,
}: {
  token: string;
  leadId: string;
  phone?: string | null;
  onEnded?: () => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const clientRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const logIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalizedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    getCallConfig(token)
      .then((c) => alive && setConfigured(c.configured))
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopTimer();
    try {
      callRef.current?.hangup?.(() => {});
    } catch {
      /* ignore */
    }
    try {
      clientRef.current?.disconnect?.();
    } catch {
      /* ignore */
    }
    callRef.current = null;
    clientRef.current = null;
  }, [stopTimer]);

  useEffect(() => () => cleanup(), [cleanup]);

  const finalize = useCallback(
    (status: string) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      stopTimer();
      const logId = logIdRef.current;
      if (logId) {
        updateCallStatus(
          token,
          logId,
          status,
          seconds,
          status === "no_answer" ? "no_answer" : undefined,
        ).catch(() => {});
      }
      cleanup();
      setPhase("ended");
      onEnded?.();
    },
    [token, seconds, stopTimer, cleanup, onEnded],
  );

  const startTimerOnce = useCallback(() => {
    if (timerRef.current) return;
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const wireCall = useCallback(
    (call: any) => {
      // Call2 Web SDK: audio nhận qua 'addremotetrack' → track.attach() trả element.
      call.on?.("addremotetrack", (track: any) => {
        try {
          const el = track.attach();
          el.autoplay = true;
          el.style.display = "none";
          mediaRef.current?.appendChild(el);
        } catch {
          /* ignore */
        }
      });
      // Fallback cho SDK cũ (nếu emit stream thay vì track).
      call.on?.("addremotestream", (stream: MediaStream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current.play().catch(() => {});
        }
      });
      call.on?.("signalingstate", (state: any) => {
        // StringeeCallState: 1 CALLING, 2 RINGING, 3 ANSWERED, 4 CONNECTED, 5 BUSY, 6 ENDED
        const code = state?.code;
        if (code === 2) {
          setPhase("ringing");
        } else if (code === 3 || code === 4) {
          finalizedRef.current = false;
          setPhase("answered");
          startTimerOnce();
        } else if (code === 5) {
          setErr("Máy bận / từ chối");
          finalize("no_answer");
        } else if (code === 6) {
          finalize("ended");
        }
      });
      call.on?.("error", (e: any) => {
        setErr(e?.message || "Lỗi cuộc gọi");
        setPhase("error");
      });
    },
    [finalize, startTimerOnce],
  );

  const start = useCallback(async () => {
    setErr(null);
    setPhase("preparing");
    finalizedRef.current = false;
    try {
      await loadStringeeSdk();
      const [tokenRes, started] = await Promise.all([
        getCallToken(token),
        startCall(token, leadId),
      ]);
      logIdRef.current = started.log_id;

      const client = new window.StringeeClient();
      clientRef.current = client;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        client.on("authen", (res: any) => {
          if (settled) return;
          settled = true;
          if (res?.r === 0) resolve();
          else reject(new Error("Xác thực Stringee lỗi: " + (res?.message ?? res?.r)));
        });
        client.on("disconnect", () => {
          if (!settled) {
            settled = true;
            reject(new Error("Mất kết nối tới Stringee"));
          }
        });
        client.connect(tokenRes.access_token);
        setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Hết thời gian kết nối Stringee"));
          }
        }, 12000);
      });

      const from = started.from_number || started.user_id;
      const call = new window.StringeeCall2(client, from, started.to_number, false);
      callRef.current = call;
      call.customDataToServer = started.log_id;
      wireCall(call);
      setPhase("calling");
      call.makeCall((res: any) => {
        if (res?.r !== 0) {
          setErr("Không gọi được: " + (res?.message ?? res?.r));
          finalize("failed");
        } else if (res?.callId) {
          attachCall(token, started.log_id, res.callId).catch(() => {});
        }
      });
    } catch (e) {
      setErr((e as Error).message);
      setPhase("error");
      cleanup();
    }
  }, [token, leadId, wireCall, finalize, cleanup]);

  const hangup = useCallback(() => {
    try {
      callRef.current?.hangup?.(() => {});
    } catch {
      /* ignore */
    }
    finalize("ended");
  }, [finalize]);

  if (configured === false) {
    return (
      <span
        className="text-xs italic text-brand-400"
        title="Đặt STRINGEE_API_KEY_SID / STRINGEE_API_KEY_SECRET / STRINGEE_FROM_NUMBER trên server để bật tổng đài"
      >
        Tổng đài chưa cấu hình
      </span>
    );
  }

  const active =
    phase === "preparing" ||
    phase === "calling" ||
    phase === "ringing" ||
    phase === "answered";

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} autoPlay className="hidden" />
      <div ref={mediaRef} className="hidden" />
      {active ? (
        <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/50 px-2.5 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-brand-800">
            {PHASE_LABEL[phase]}
            {phase === "answered" && ` · ${fmt(seconds)}`}
          </span>
          <button
            onClick={hangup}
            className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600"
          >
            <X size={13} /> Kết thúc
          </button>
        </div>
      ) : (
        <button
          onClick={start}
          disabled={!phone || configured === null}
          title={!phone ? "Khách chưa có số điện thoại" : "Gọi qua tổng đài"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {phase === "preparing" ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Phone size={15} />
          )}
          Gọi
        </button>
      )}
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}

/**
 * Nút "Nghe ghi âm" cho 1 mục cuộc gọi trong timeline 360 (portal sale). Tải blob
 * qua proxy backend (gắn JWT) rồi phát bằng <audio controls>.
 */
export function RecordingPlayer({
  token,
  logId,
}: {
  token: string;
  logId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const blob = await getCallRecordingBlob(token, logId);
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    return <audio src={url} controls className="mt-1 h-8 w-full max-w-xs" />;
  }
  return (
    <button
      onClick={load}
      disabled={loading}
      className="mt-1 inline-flex items-center gap-1 text-xs text-orange-600 hover:underline disabled:opacity-60"
    >
      {loading ? <RefreshCw size={12} className="animate-spin" /> : <Phone size={12} />}
      {loading ? "Đang tải ghi âm…" : "Nghe ghi âm"}
      {err && <span className="text-rose-600">· {err}</span>}
    </button>
  );
}
