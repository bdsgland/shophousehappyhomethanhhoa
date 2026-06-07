/**
 * Client API cho flow đặt lịch xem nhà (backend /bookings + /me/bookings).
 *
 * POST /bookings cho phép khách ẩn danh (không cần token); các thao tác quản lý
 * (list, đổi trạng thái, đổi giờ) cần JWT. Khoảnh khắc khách đặt lịch = HOT LEAD.
 */
import { AGENT_ENGINE_URL } from "@/lib/api";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  completed: "Đã hoàn thành",
  cancelled: "Đã huỷ",
  no_show: "Khách không đến",
};

/** Tailwind classes cho badge trạng thái. */
export const STATUS_BADGE: Record<BookingStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  confirmed: "bg-sky-50 text-sky-700 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-brand-100 text-brand-600 ring-brand-200",
  no_show: "bg-rose-50 text-rose-700 ring-rose-200",
};

export type Booking = {
  id: string;
  unit_id: string;
  unit_summary: string;
  lead_id: string;
  sale_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  scheduled_at: string;
  status: BookingStatus;
  notes: string | null;
  ai_score: number;
  referral_code: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingListResponse = {
  items: Booking[];
  total: number;
  page: number;
  page_size: number;
};

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((d: { msg?: string }) => (typeof d?.msg === "string" ? d.msg : ""))
      .filter(Boolean)
      .join(", ");
  return `Lỗi ${res.status}`;
}

// ============= Tạo booking =============

export async function createBooking(payload: {
  unit_id: string;
  scheduled_at: string; // ISO datetime
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  notes?: string;
  referral_code?: string;
}): Promise<Booking> {
  // Gửi kèm token nếu khách đã đăng nhập (để tính AI score + gắn chủ sở hữu).
  const { readToken } = await import("@/lib/auth");
  const token = readToken();
  const res = await fetch(`${AGENT_ENGINE_URL}/bookings`, {
    method: "POST",
    headers: { ...authHeaders(token ?? undefined), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Booking;
}

// ============= Đọc booking =============

export async function fetchBookings(
  token: string,
  opts?: {
    status?: BookingStatus;
    sale_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
  },
): Promise<BookingListResponse> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.sale_id) params.set("sale_id", opts.sale_id);
  if (opts?.date_from) params.set("date_from", opts.date_from);
  if (opts?.date_to) params.set("date_to", opts.date_to);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.page_size) params.set("page_size", String(opts.page_size));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${AGENT_ENGINE_URL}/bookings${qs}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as BookingListResponse;
}

export async function fetchMyBookings(token: string): Promise<Booking[]> {
  const res = await fetch(`${AGENT_ENGINE_URL}/me/bookings`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Booking[];
}

export async function fetchBooking(token: string, id: string): Promise<Booking> {
  const res = await fetch(`${AGENT_ENGINE_URL}/bookings/${id}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Booking;
}

// ============= Cập nhật booking =============

export async function updateBookingStatus(
  token: string,
  id: string,
  status: BookingStatus,
): Promise<Booking> {
  const res = await fetch(`${AGENT_ENGINE_URL}/bookings/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Booking;
}

export async function rescheduleBooking(
  token: string,
  id: string,
  scheduledAt: string,
): Promise<Booking> {
  const res = await fetch(`${AGENT_ENGINE_URL}/bookings/${id}/reschedule`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ scheduled_at: scheduledAt }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Booking;
}

// ============= Tiện ích =============

/** Định dạng ISO datetime → "HH:mm · dd/MM/yyyy" (vi). */
export function formatBookingTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(
    d.getMonth() + 1,
  )}/${d.getFullYear()}`;
}

/** Booking có giờ hẹn trong tương lai (chưa diễn ra). */
export function isUpcoming(b: Booking): boolean {
  return new Date(b.scheduled_at).getTime() > Date.now();
}

/** Giờ hẹn < 24h nữa (cảnh báo đỏ cho sale). */
export function isUrgent(b: Booking): boolean {
  const diff = new Date(b.scheduled_at).getTime() - Date.now();
  return diff > 0 && diff < 24 * 3600 * 1000;
}

/** Mặc định cho date picker: mai 10:00 sáng, định dạng cho <input datetime-local>. */
export function defaultSlot(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Chuyển value của <input datetime-local> → ISO string gửi backend. */
export function localToIso(local: string): string {
  return new Date(local).toISOString();
}
