/**
 * Client API cho Sale Learning Center (backend /learning/*).
 *
 * Mọi endpoint cần JWT (sale + admin). Tải file/PDF dùng fetch kèm Bearer rồi
 * tạo blob URL — vì link trực tiếp/iframe không gắn được header Authorization.
 */
import { AGENT_ENGINE_URL } from "@/lib/api";

export type DocumentCategory =
  | "policy"
  | "pricing"
  | "contract"
  | "brochure"
  | "training";

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  policy: "Chính sách",
  pricing: "Bảng giá",
  contract: "Hợp đồng & Pháp lý",
  brochure: "Giới thiệu dự án",
  training: "Đào tạo sale",
};

export const CATEGORY_ORDER: DocumentCategory[] = [
  "policy",
  "pricing",
  "contract",
  "brochure",
  "training",
];

export type LearningDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  type: string;
  size: number;
  version: number;
  chunks: number;
  indexed: boolean;
  uploaded_by: string | null;
  indexed_at: string | null;
  download_url: string;
};

export type SearchPassage = {
  document_id: string;
  title: string;
  category: string;
  source_file: string;
  chunk_index: number;
  score: number;
  text: string;
};

export type AskSource = {
  document_id: string;
  title: string;
  category: string;
  source_file: string;
  score: number;
  snippet: string;
};

export type PaymentMilestone = { label: string; pct: number; amount: number };

export type QuoteResult = {
  quote_id: string;
  unit_id: string;
  customer_name: string;
  sale_name: string;
  list_price: number;
  discount_pct: number;
  discount_amount: number;
  total_price: number;
  payment_plan: string;
  milestones: PaymentMilestone[];
  pdf_url: string;
  created_at: string;
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
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

export async function fetchDocuments(
  token: string,
  category?: DocumentCategory,
): Promise<LearningDocument[]> {
  const qs = category ? `?category=${category}` : "";
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/documents${qs}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as LearningDocument[];
}

export async function fetchDocument(
  token: string,
  id: string,
): Promise<LearningDocument> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/documents/${id}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as LearningDocument;
}

export async function uploadDocument(
  token: string,
  file: File,
  title: string,
  category: DocumentCategory,
): Promise<{ document_id: string; chunks: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  form.append("category", category);
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/documents`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { document_id: string; chunks: number };
}

export async function deleteDocument(token: string, id: string): Promise<void> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/documents/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function searchLearning(
  token: string,
  query: string,
  topK = 5,
): Promise<SearchPassage[]> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/search`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return ((await res.json()) as { passages: SearchPassage[] }).passages;
}

export async function createQuote(
  token: string,
  payload: {
    unit_id: string;
    customer_name: string;
    customer_phone?: string;
    sale_name?: string;
    sale_phone?: string;
    payment_plan: "standard" | "fast" | "loan";
    discount_pct: number;
    note?: string;
  },
): Promise<QuoteResult> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/quote`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as QuoteResult;
}

// ----- Phiếu TÍNH GIÁ theo Chính sách bán hàng (khớp mẫu Excel CĐT) -----

export type SalesBasePlan = {
  key: string;
  label: string;
  payment_discount_pct: number;
  enabled: boolean;
};
export type SalesPolicyAddon = {
  key: string;
  label: string;
  pct: number;
  enabled: boolean;
};
export type SalesPolicyConfig = {
  base_plans: SalesBasePlan[];
  addons: SalesPolicyAddon[];
  deposit_amount: number;
  note: string;
  version: number;
};

export type DiscountLine = {
  key: string;
  label: string;
  pct: number;
  amount: number;
};
export type PolicyMilestoneOut = {
  label: string;
  kind: string;
  days_offset?: number | null;
  pct: number;
  customer_amount: number;
  bank_amount: number;
};
export type PolicyQuoteResult = {
  quote_id: string;
  unit_id: string;
  customer_name: string;
  sale_name: string;
  base_plan: string;
  base_plan_label: string;
  dien_tich: number;
  gia_ny_gom_vat_kpbt: number;
  vat: number;
  kpbt: number;
  gt_xay: number;
  niem_yet_chua_vat_kpbt: number;
  gift_cash: number;
  discount_lines: DiscountLine[];
  total_discount: number;
  gtsp_gom_vat_chua_kpbt: number;
  gtsp_final: number;
  don_gia: number;
  gt_dat: number;
  five_pct_hdmb: number;
  milestones: PolicyMilestoneOut[];
  bank_total: number;
  pdf_url: string;
  created_at: string;
};

/**
 * Đọc chính sách bán hàng. Endpoint PUBLIC → gọi KHÔNG kèm Authorization để
 * thành "simple request" (giống fetchInventory đang chạy ổn), tránh preflight
 * CORS gây "Failed to fetch".
 */
export async function fetchSalesPolicy(): Promise<SalesPolicyConfig> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/sales-policy`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as SalesPolicyConfig;
}

export async function createPolicyQuote(
  token: string,
  payload: {
    unit_id: string;
    customer_name: string;
    customer_phone?: string;
    sale_name?: string;
    sale_phone?: string;
    base_plan: string;
    addons: string[];
    gift_cash?: number;
    note?: string;
  },
): Promise<PolicyQuoteResult> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/policy-quote`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PolicyQuoteResult;
}

/** Tải 1 endpoint nhị phân (PDF/file) kèm Bearer → trả blob URL (nhớ revoke sau). */
export async function fetchBlobUrl(token: string, path: string): Promise<string> {
  const url = path.startsWith("http") ? path : `${AGENT_ENGINE_URL}${path}`;
  const res = await fetch(url, { headers: authHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Tải file về máy (tạo blob rồi click thẻ <a>). */
export async function downloadFile(
  token: string,
  path: string,
  filename: string,
): Promise<void> {
  const objectUrl = await fetchBlobUrl(token, path);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

export type AskStreamEvent =
  | { type: "sources"; session_id?: string | null; sources: AskSource[] }
  | { type: "delta"; text: string }
  | { type: "done" };

/**
 * Gọi /learning/ask (stream NDJSON). Gọi onEvent cho từng dòng JSON.
 * Trả promise hoàn tất khi stream kết thúc.
 */
export async function askLearning(
  token: string,
  question: string,
  sessionId: string | null,
  onEvent: (ev: AskStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${AGENT_ENGINE_URL}/learning/ask`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await parseError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as AskStreamEvent);
      } catch {
        // dòng chưa trọn vẹn — bỏ qua, sẽ ghép ở vòng sau
      }
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()) as AskStreamEvent);
    } catch {
      /* ignore */
    }
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
