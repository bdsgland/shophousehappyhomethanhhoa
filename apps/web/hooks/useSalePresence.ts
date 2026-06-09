"use client";

// Hook WebSocket cho SALE: giữ kết nối presence, heartbeat, nhận match:incoming,
// gửi accept/decline. Tự reconnect (backoff) khi rớt mạng.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type MatchRequest,
  type MatchStats,
  type WsMessage,
  playIncomingBeep,
  salePresenceWsUrl,
} from "@/lib/match";

export type SaleAvailability = "online" | "busy" | "away" | "dnd";

export type SalePresenceState = {
  connected: boolean;
  availability: SaleAvailability;
  incoming: MatchRequest | null; // invite đang chờ sale bấm
  live: MatchRequest | null; // match đã có Meet (đang/ sắp call)
  stats: MatchStats | null;
  setAvailability: (a: SaleAvailability) => void;
  accept: (matchId: string) => void;
  decline: (matchId: string) => void;
  clearLive: () => void;
};

const HEARTBEAT_MS = 25_000;

export function useSalePresence(token: string | null): SalePresenceState {
  const [connected, setConnected] = useState(false);
  const [availability, setAvailabilityState] = useState<SaleAvailability>("online");
  const [incoming, setIncoming] = useState<MatchRequest | null>(null);
  const [live, setLive] = useState<MatchRequest | null>(null);
  const [stats, setStats] = useState<MatchStats | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const closedRef = useRef(false);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const setAvailability = useCallback(
    (a: SaleAvailability) => {
      setAvailabilityState(a);
      send({ type: "set_availability", availability: a });
    },
    [send],
  );

  const accept = useCallback(
    (matchId: string) => {
      send({ type: "accept_match", match_id: matchId });
      setIncoming(null);
    },
    [send],
  );

  const decline = useCallback(
    (matchId: string) => {
      send({ type: "decline_match", match_id: matchId });
      setIncoming(null);
    },
    [send],
  );

  const clearLive = useCallback(() => setLive(null), []);

  useEffect(() => {
    if (!token) return;
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      const ws = new WebSocket(salePresenceWsUrl(token));
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setConnected(true);
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
        switch (msg.type) {
          case "presence:state":
            if (msg.availability)
              setAvailabilityState(msg.availability as SaleAvailability);
            if (msg.stats) setStats(msg.stats);
            break;
          case "match:incoming":
            if (msg.match) {
              setIncoming(msg.match);
              playIncomingBeep();
            }
            break;
          case "match:meet_ready":
            if (msg.match) {
              setLive(msg.match);
              setIncoming(null);
            }
            break;
          case "match:cancelled":
          case "match:expired":
          case "match:gone":
            // invite/biến mất → đóng modal nếu trùng id
            setIncoming((cur) =>
              cur && msg.match_id && cur.id === msg.match_id ? null : cur,
            );
            break;
          case "match:completed":
            setLive((cur) =>
              cur && msg.match_id && cur.id === msg.match_id ? null : cur,
            );
            break;
          case "match:meet_error":
            setIncoming(null);
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (closedRef.current) return;
        // Reconnect backoff: 1s, 2s, 4s … tối đa 15s.
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

  return {
    connected,
    availability,
    incoming,
    live,
    stats,
    setAvailability,
    accept,
    decline,
    clearLive,
  };
}
