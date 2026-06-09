"use client";

// Hook WebSocket cho KHÁCH: tự kết nối khi vào portal, nhận trạng thái match,
// hiển thị Meet link khi sale sẵn sàng. Tự reconnect khi rớt.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type MatchRequest,
  type WsMessage,
  customerMatchWsUrl,
} from "@/lib/match";

export type CustomerMatchPhase =
  | "connecting"
  | "assigning" // đang tìm sale
  | "assigned" // sale đã nhận, đang tạo Meet
  | "ready" // Meet sẵn sàng
  | "no_sale" // không có sale → fallback
  | "completed";

export type CustomerMatchState = {
  phase: CustomerMatchPhase;
  connected: boolean;
  saleName: string | null;
  meetLink: string | null;
  fallbackMessage: string | null;
  match: MatchRequest | null;
};

const HEARTBEAT_MS = 25_000;

export function useCustomerMatch(token: string | null): CustomerMatchState {
  const [phase, setPhase] = useState<CustomerMatchPhase>("connecting");
  const [connected, setConnected] = useState(false);
  const [saleName, setSaleName] = useState<string | null>(null);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchRequest | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const closedRef = useRef(false);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    if (!token) return;
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      const ws = new WebSocket(customerMatchWsUrl(token));
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setConnected(true);
        setPhase((p) => (p === "ready" || p === "completed" ? p : "assigning"));
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(
          () => send({ type: "heartbeat" }),
          HEARTBEAT_MS,
        );
      };

      ws.onmessage = (e) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(e.data) as WsMessage;
        } catch {
          return;
        }
        if (msg.match) setMatch(msg.match);
        switch (msg.type) {
          case "match:assigning":
            setPhase((p) => (p === "ready" ? p : "assigning"));
            break;
          case "match:assigned":
            setSaleName(msg.sale?.name ?? msg.match?.sale_name ?? null);
            setPhase("assigned");
            break;
          case "match:meet_ready":
            setMeetLink(msg.meet_link ?? msg.match?.meet_link ?? null);
            setSaleName(msg.match?.sale_name ?? null);
            setPhase("ready");
            break;
          case "match:no_sale_available":
            setFallbackMessage(
              (msg.fallback as string) ??
                "Chuyên viên sẽ liên hệ với bạn qua điện thoại trong ít phút.",
            );
            setPhase("no_sale");
            break;
          case "match:completed":
            setPhase("completed");
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (closedRef.current) return;
        attemptsRef.current += 1;
        const delay = Math.min(15_000, 1000 * 2 ** (attemptsRef.current - 1));
        reconnectRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, [token, send]);

  return { phase, connected, saleName, meetLink, fallbackMessage, match };
}
