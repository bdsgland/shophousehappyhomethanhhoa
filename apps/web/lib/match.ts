// Live Match — types + helper WebSocket/REST cho khách & sale.
// Khớp record backend (app/schemas/match.py). Tách riêng khỏi CRM.

import { AGENT_ENGINE_URL } from "@/lib/api";

export type MatchStatus =
  | "pending"
  | "invited"
  | "accepted"
  | "live"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled";

export type MatchOutcome =
  | "interested"
  | "not_interested"
  | "booked"
  | "follow_up";

export type MatchRequest = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  sale_id: string | null;
  sale_name: string | null;
  status: MatchStatus;
  meet_link: string | null;
  meet_event_id: string | null;
  invited_sales: string[];
  declined_by: string[];
  invite_expires_at: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  outcome: MatchOutcome | null;
  outcome_note: string | null;
};

// Mọi message server push qua WebSocket.
export type WsMessage = {
  type: string;
  match?: MatchRequest;
  match_id?: string;
  meet_link?: string;
  expires_at?: string;
  timeout_seconds?: number;
  availability?: string;
  stats?: MatchStats;
  sale?: { id: string; name: string | null };
  fallback?: string;
  message?: string;
  [k: string]: unknown;
};

export type MatchStats = {
  period: string;
  total: number;
  accepted: number;
  declined: number;
  expired: number;
  cancelled: number;
  live: number;
  completed: number;
  avg_duration_seconds: number;
  avg_accept_seconds: number;
  conversion_rate: number;
  online_sales: number;
  online_customers: number;
  active_calls: number;
};

/** Base WS URL (http→ws, https→wss). */
export function wsBase(): string {
  return AGENT_ENGINE_URL.replace(/^http/i, "ws");
}

export function salePresenceWsUrl(token: string): string {
  return `${wsBase()}/ws/sale-presence?token=${encodeURIComponent(token)}`;
}

export function customerMatchWsUrl(token: string): string {
  return `${wsBase()}/ws/customer-match?token=${encodeURIComponent(token)}`;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Sale POST kết quả sau call (REST). */
export async function completeMatch(
  token: string,
  matchId: string,
  outcome: MatchOutcome,
  note?: string,
): Promise<MatchRequest> {
  const res = await fetch(`${AGENT_ENGINE_URL}/match/${matchId}/complete`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ outcome, note: note ?? null }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Lỗi lưu kết quả (${res.status})`);
  return (await res.json()) as MatchRequest;
}

/** Khách huỷ match (REST fallback). */
export async function cancelMatch(token: string, matchId: string): Promise<void> {
  await fetch(`${AGENT_ENGINE_URL}/match/${matchId}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
    cache: "no-store",
  }).catch(() => undefined);
}

/** Beep ngắn báo có khách (Web Audio — không cần file mp3, optional). */
export function playIncomingBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    // đóng context sau khi phát để khỏi rò
    window.setTimeout(() => ctx.close().catch(() => undefined), 800);
  } catch {
    /* trình duyệt chặn autoplay — bỏ qua */
  }
}
