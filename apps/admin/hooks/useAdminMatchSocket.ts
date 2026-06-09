"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { API_URL } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * Mở WebSocket `/ws/admin-match` để nhận cập nhật Live Match realtime (push).
 *
 * Backend đẩy `match:snapshot` (lúc kết nối) + `match:update` (mỗi lần 1 match
 * đổi trạng thái). Mỗi event → invalidate cache react-query của 3 query trên
 * trang Live Match để chúng refetch ngay, thay vì chờ polling.
 *
 * - Tự reconnect sau 3s khi rớt (trừ khi unmount).
 * - Heartbeat mỗi 25s giữ kết nối.
 * - Cleanup đầy đủ khi unmount.
 *
 * Trả `{ connected }` để page nới refetchInterval khi WS đang sống (polling chỉ
 * còn là fallback).
 */
export function useAdminMatchSocket(): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closedByUnmount = false;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["match-stats"] });
      queryClient.invalidateQueries({ queryKey: ["match-presence"] });
      queryClient.invalidateQueries({ queryKey: ["match-history"] });
    };

    const connect = () => {
      const token = getToken();
      if (!token) return; // chưa đăng nhập → không mở WS

      // http(s)://host → ws(s)://host, theo đúng base URL của REST API.
      const wsUrl = `${API_URL.replace(/^http/, "ws")}/ws/admin-match?token=${encodeURIComponent(
        token,
      )}`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        let data: { type?: string };
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === "heartbeat:ack") return;
        // snapshot / update đều kích hoạt refetch cache (UI lấy data mới nhất).
        invalidate();
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (!closedByUnmount) {
          reconnectTimer = setTimeout(connect, 3_000); // tự reconnect
        }
      };

      ws.onerror = () => {
        ws?.close(); // onclose sẽ lo reconnect
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeat) clearInterval(heartbeat);
      ws?.close();
    };
  }, [queryClient]);

  return { connected };
}
