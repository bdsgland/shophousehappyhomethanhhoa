"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneOff, Play, Loader2 } from "lucide-react";

import {
  attachCall,
  getCallConfig,
  getCallRecordingBlob,
  getCallToken,
  startCall,
  updateCallStatus,
} from "@/lib/api";
import { loadStringeeSdk } from "@/lib/stringee";
import { Button } from "@/components/ui/button";

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
 * Nút "Gọi" (click-to-call) qua Stringee Web SDK. Lấy client token + thông tin
 * gọi từ backend rồi gọi thẳng từ trình duyệt; hiện widget trạng thái (đang gọi/
 * đổ chuông/đã kết nối/thời lượng/kết thúc). Chưa cấu hình Stringee → ẩn nút.
 *
 * `onEnded` được gọi khi cuộc gọi kết thúc để cha refresh hồ sơ 360 (timeline).
 */
export function CallButton({
  leadId,
  phone,
  onEnded,
}: {
  leadId: string;
  phone?: string | null;
  onEnded?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const clientRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const logIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalizedRef = useRef(false);

  const cfgQ = useQuery({ queryKey: ["call-config"], queryFn: getCallConfig });

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

  // Dọn dẹp khi unmount (rời trang giữa cuộc gọi).
  useEffect(() => () => cleanup(), [cleanup]);

  /** Kết thúc cuộc gọi: lưu trạng thái + thời lượng, refresh hồ sơ, dọn dẹp. */
  const finalize = useCallback(
    (status: string) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      stopTimer();
      const dur = seconds;
      const logId = logIdRef.current;
      if (logId) {
        updateCallStatus(
          logId,
          status,
          dur,
          status === "no_answer" ? "no_answer" : undefined,
        ).catch(() => {});
      }
      cleanup();
      setPhase("ended");
      onEnded?.();
    },
    [seconds, stopTimer, cleanup, onEnded],
  );

  const wireCall = useCallback(
    (call: any) => {
      call.on?.("addremotestream", (stream: MediaStream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current.play().catch(() => {});
        }
      });
      call.on?.("signalingstate", (state: any) => {
        // StringeeCall2 signaling code: 0 calling,1 ringing,2 answered,3 busy,4 ended,5 error
        const code = state?.code;
        if (code === 1) {
          setPhase("ringing");
        } else if (code === 2) {
          finalizedRef.current = false;
          setPhase("answered");
          setSeconds(0);
          stopTimer();
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } else if (code === 3) {
          setErr("Máy bận");
          finalize("no_answer");
        } else if (code === 4) {
          finalize("ended");
        } else if (code === 5) {
          setErr(state?.reason || "Lỗi tín hiệu");
          finalize("failed");
        }
      });
      call.on?.("error", (e: any) => {
        setErr(e?.message || "Lỗi cuộc gọi");
        setPhase("error");
      });
    },
    [finalize, stopTimer],
  );

  const start = useCallback(async () => {
    setErr(null);
    setPhase("preparing");
    finalizedRef.current = false;
    try {
      await loadStringeeSdk();
      const [tokenRes, started] = await Promise.all([
        getCallToken(),
        startCall(leadId),
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
      // Stringee echo lại trong call event (clientCustomData) → khớp đúng log.
      call.customDataToServer = started.log_id;
      wireCall(call);
      setPhase("calling");
      call.makeCall((res: any) => {
        if (res?.r !== 0) {
          setErr("Không gọi được: " + (res?.message ?? res?.r));
          finalize("failed");
        } else if (res?.callId) {
          attachCall(started.log_id, res.callId).catch(() => {});
        }
      });
    } catch (e) {
      setErr((e as Error).message);
      setPhase("error");
      cleanup();
    }
  }, [leadId, wireCall, finalize, cleanup]);

  const hangup = useCallback(() => {
    try {
      callRef.current?.hangup?.(() => {});
    } catch {
      /* ignore */
    }
    finalize("ended");
  }, [finalize]);

  // Chưa cấu hình Stringee → ẩn nút + hướng dẫn (chỉ hiện khi đã biết kết quả).
  if (cfgQ.data && !cfgQ.data.configured) {
    return (
      <span
        className="text-xs italic text-muted-foreground"
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
      {active ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="text-xs font-medium">
            {PHASE_LABEL[phase]}
            {phase === "answered" && ` · ${fmt(seconds)}`}
          </span>
          <Button size="sm" variant="danger" onClick={hangup} className="h-7 px-2">
            <PhoneOff className="h-3.5 w-3.5" /> Kết thúc
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={start}
          disabled={!phone || cfgQ.isLoading}
          title={!phone ? "Khách chưa có số điện thoại" : "Gọi qua tổng đài"}
        >
          {phase === "preparing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
          Gọi
        </Button>
      )}
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

/**
 * Nút "Nghe ghi âm" cho 1 mục cuộc gọi trong timeline 360. Tải blob qua proxy
 * backend (gắn JWT, xác thực Stringee server-side) rồi phát bằng <audio controls>.
 */
export function RecordingPlayer({ logId }: { logId: string }) {
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
      const blob = await getCallRecordingBlob(logId);
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
      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {loading ? "Đang tải ghi âm…" : "Nghe ghi âm"}
      {err && <span className="text-danger">· {err}</span>}
    </button>
  );
}
