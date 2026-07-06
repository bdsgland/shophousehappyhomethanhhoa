"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  BookOpen,
  Calculator,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Search,
  Send,
  Sparkles,
} from "@/components/dashboard/icons";
import type { AuthUser } from "@/lib/api";
import { fetchInventory, type InventoryUnit } from "@/lib/api";
import { readToken, readUserFromCookie } from "@/lib/auth";
import {
  askLearning,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  createPolicyQuote,
  createQuote,
  downloadFile,
  fetchDocuments,
  fetchSalesPolicy,
  formatBytes,
  type AskSource,
  type DocumentCategory,
  type LearningDocument,
  type PolicyQuoteResult,
  type QuoteResult,
  type SalesPolicyConfig,
} from "@/lib/learning";

type Tab = "library" | "ask" | "quote" | "policy";

const TABS: { id: Tab; label: string; Icon: typeof BookOpen }[] = [
  { id: "library", label: "Thư viện", Icon: BookOpen },
  { id: "ask", label: "Hỏi AI", Icon: Sparkles },
  // Tab "Phiếu báo giá" (QuoteTab cũ) đã ẩn — thay bằng "Phiếu tính giá".
  { id: "policy", label: "Phiếu tính giá", Icon: Calculator },
];

const TAB_IDS: Tab[] = ["library", "ask", "quote", "policy"];

export function LearningCenter({
  initialTab,
  initialUnit,
}: {
  initialTab?: string;
  initialUnit?: string;
} = {}) {
  const [tab, setTab] = useState<Tab>(
    TAB_IDS.includes(initialTab as Tab) ? (initialTab as Tab) : "library",
  );
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setToken(readToken());
    setUser(readUserFromCookie());
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-900">
          <BookOpen size={24} className="text-orange-500" /> Kho học tập
        </h1>
        <p className="text-sm text-brand-700">
          Tài liệu chính thống, hỏi đáp AI có trích dẫn nguồn và lập phiếu báo giá
          căn hộ Happy Home Thanh Hóa.
        </p>
      </header>

      <div className="flex gap-1 rounded-xl bg-brand-50 p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === id
                ? "bg-white text-orange-700 shadow-sm ring-1 ring-amber-200"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {!token ? (
        <div className="rounded-xl border border-brand-100 bg-white p-8 text-center text-sm text-brand-600">
          Đang tải phiên đăng nhập…
        </div>
      ) : tab === "library" ? (
        <LibraryTab token={token} />
      ) : tab === "ask" ? (
        <AskTab token={token} />
      ) : tab === "quote" ? (
        <QuoteTab token={token} user={user} />
      ) : (
        <PolicyQuoteTab token={token} user={user} initialUnit={initialUnit} />
      )}
    </div>
  );
}

// ============================================================
// Tab 1 — Thư viện
// ============================================================

function LibraryTab({ token }: { token: string }) {
  const [docs, setDocs] = useState<LearningDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DocumentCategory | "all">("all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDocuments(token)
      .then((d) => active && setDocs(d))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const shown = filter === "all" ? docs : docs.filter((d) => d.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          Tất cả ({docs.length})
        </Chip>
        {CATEGORY_ORDER.map((c) => {
          const n = docs.filter((d) => d.category === c).length;
          return (
            <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
              {CATEGORY_LABELS[c]} ({n})
            </Chip>
          );
        })}
      </div>

      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <ErrorBox message={error} />
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-500">
          Chưa có tài liệu trong nhóm này.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((d) => (
            <DocumentCard key={d.id} doc={d} token={token} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc, token }: { doc: LearningDocument; token: string }) {
  const [busy, setBusy] = useState(false);
  async function onDownload() {
    setBusy(true);
    try {
      await downloadFile(
        token,
        doc.download_url,
        `${doc.title}.${doc.type}`,
      );
    } catch {
      /* lỗi tải — bỏ qua, người dùng thử lại */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-brand-100 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 text-orange-600">
          <FileText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-brand-900" title={doc.title}>
            {doc.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-500">
            <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium uppercase">
              {doc.type}
            </span>
            <span>{formatBytes(doc.size)}</span>
            {doc.indexed && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">
                ● đã index ({doc.chunks})
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/agent/learning/documents/${doc.id}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-100 px-3 py-1.5 text-xs font-medium text-brand-700 hover:border-orange-300 hover:text-orange-700"
        >
          <Eye size={14} /> Xem
        </Link>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Download size={14} /> {busy ? "Đang tải…" : "Tải"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Tab 2 — Hỏi AI
// ============================================================

type AskMsg = { role: "user" | "assistant"; content: string; sources?: AskSource[] };

/** Thay tin nhắn cuối bằng bản mới (bất biến) nếu nó là của assistant. */
function patchLast(msgs: AskMsg[], fn: (last: AskMsg) => AskMsg): AskMsg[] {
  if (msgs.length === 0) return msgs;
  const last = msgs[msgs.length - 1];
  if (last.role !== "assistant") return msgs;
  return [...msgs.slice(0, -1), fn(last)];
}

const ASK_SUGGESTIONS = [
  "Chính sách hoa hồng dự án Happy Home?",
  "Tiến độ thanh toán chuẩn gồm những đợt nào?",
  "Pháp lý dự án đã có những giấy tờ gì?",
  "Chiết khấu thanh toán nhanh là bao nhiêu?",
];

function AskTab({ token }: { token: string }) {
  const [messages, setMessages] = useState<AskMsg[]>([
    {
      role: "assistant",
      content:
        "Em là AI tư vấn nội bộ Happy Home. Anh/chị hỏi về chính sách, pháp lý, giá hay " +
        "tiến độ — em trả lời dựa trên tài liệu chính thống và trích dẫn nguồn.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", content: q },
      { role: "assistant", content: "", sources: [] },
    ]);
    setStreaming(true);
    try {
      await askLearning(token, q, null, (ev) => {
        // Cập nhật bất biến (immutable): tạo object tin nhắn mới thay vì mutate —
        // tránh nhân đôi khi React StrictMode gọi updater 2 lần ở môi trường dev.
        if (ev.type === "sources") {
          setMessages((m) => patchLast(m, (last) => ({ ...last, sources: ev.sources })));
        } else if (ev.type === "delta") {
          setMessages((m) =>
            patchLast(m, (last) => ({ ...last, content: last.content + ev.text })),
          );
        }
      });
    } catch (e) {
      setMessages((m) =>
        patchLast(m, (last) => ({
          ...last,
          content:
            (e as Error).message || "Xin lỗi, AI đang bận. Anh/chị thử lại sau nhé.",
        })),
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-20rem)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-2"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-orange-500 text-white"
                  : "bg-brand-50 text-brand-900"
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {m.sources.map((s, si) => (
                  <Link
                    key={si}
                    href={`/agent/learning/documents/${s.document_id}`}
                    className="group max-w-[260px] rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-800 hover:bg-amber-100"
                    title={s.snippet}
                  >
                    <span className="font-semibold">📄 {s.title}</span>
                    <span className="ml-1 text-amber-600">
                      ({CATEGORY_LABELS[s.category as DocumentCategory] ?? s.category})
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {messages.length <= 1 && !streaming && (
          <div className="flex flex-wrap gap-2 pt-2">
            {ASK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs text-brand-700 hover:border-orange-300 hover:text-orange-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-brand-100 p-3"
      >
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-brand-100 bg-white px-3">
          <Search size={16} className="text-brand-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi về tài liệu, chính sách, pháp lý…"
            className="flex-1 bg-transparent py-2.5 text-sm text-brand-900 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          aria-label="Gửi"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

// ============================================================
// Tab 3 — Phiếu báo giá
// ============================================================

const PLAN_OPTIONS: { id: "standard" | "fast" | "loan"; label: string }[] = [
  { id: "standard", label: "Tiến độ chuẩn" },
  { id: "fast", label: "Thanh toán nhanh" },
  { id: "loan", label: "Vay ngân hàng" },
];

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
}

function QuoteTab({ token, user }: { token: string; user: AuthUser | null }) {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [form, setForm] = useState({
    unit_id: "",
    customer_name: "",
    customer_phone: "",
    payment_plan: "standard" as "standard" | "fast" | "loan",
    discount_pct: 0,
    note: "",
  });
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory().then((u) => {
      if (u) {
        setUnits(u);
        setForm((f) => (f.unit_id ? f : { ...f, unit_id: u[0]?.code ?? "" }));
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function submit() {
    if (!form.unit_id || !form.customer_name.trim()) {
      setError("Vui lòng chọn căn và nhập tên khách hàng.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const q = await createQuote(token, {
        unit_id: form.unit_id,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        sale_name: user?.full_name,
        sale_phone: user?.phone ?? undefined,
        payment_plan: form.payment_plan,
        discount_pct: Number(form.discount_pct) || 0,
        note: form.note.trim() || undefined,
      });
      setResult(q);
      // Tải PDF (kèm Bearer) để preview trong iframe.
      const { fetchBlobUrl } = await import("@/lib/learning");
      const url = await fetchBlobUrl(token, q.pdf_url);
      setPdfUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-900">Thông tin phiếu</h2>

        <Field label="Căn hộ">
          <select
            value={form.unit_id}
            onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
          >
            {units.length === 0 && <option value="">Đang tải quỹ căn…</option>}
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} · {u.zone} · {u.area}m² · {u.price}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tên khách hàng">
            <input
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              placeholder="Nguyễn Văn A"
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
          </Field>
          <Field label="SĐT khách">
            <input
              value={form.customer_phone}
              onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
              placeholder="09xx xxx xxx"
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
          </Field>
        </div>

        <Field label="Phương án thanh toán">
          <div className="flex gap-2">
            {PLAN_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setForm({ ...form, payment_plan: p.id })}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                  form.payment_plan === p.id
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-brand-100 text-brand-600 hover:border-orange-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`Chiết khấu: ${form.discount_pct}%`}>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={form.discount_pct}
            onChange={(e) => setForm({ ...form, discount_pct: Number(e.target.value) })}
            className="w-full accent-orange-500"
          />
        </Field>

        <Field label="Ghi chú (tuỳ chọn)">
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            placeholder="Ưu tiên hướng, lưu ý cho khách…"
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
        </Field>

        {error && <ErrorBox message={error} />}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Calculator size={16} /> {busy ? "Đang lập phiếu…" : "Lập phiếu báo giá"}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-900">Bản xem trước</h2>
          {result && (
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  token,
                  result.pdf_url,
                  `phieu-bao-gia-${result.unit_id}.pdf`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
            >
              <Download size={14} /> Tải PDF
            </button>
          )}
        </div>

        {!result ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-200 text-center text-sm text-brand-400">
            <FileText size={32} />
            Điền thông tin và nhấn “Lập phiếu báo giá”.
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-brand-50 p-3 text-sm">
              <Row label="Giá niêm yết" value={fmtVnd(result.list_price)} />
              <Row
                label={`Chiết khấu (${result.discount_pct}%)`}
                value={"− " + fmtVnd(result.discount_amount)}
              />
              <div className="my-1 border-t border-brand-100" />
              <Row
                label="Tổng sau chiết khấu"
                value={fmtVnd(result.total_price)}
                strong
              />
            </div>
            {pdfUrl && (
              <iframe
                title="Phiếu báo giá"
                src={pdfUrl}
                className="h-72 w-full rounded-lg border border-brand-100"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tab 4 — Phiếu tính giá theo chính sách bán hàng
// ============================================================

// Chính sách MẶC ĐỊNH tích hợp sẵn — dùng khi API /learning/sales-policy lỗi
// (Failed to fetch / chưa deploy), để form vẫn chọn được phương án + ưu đãi.
// Key khớp backend (thuong/som95/htls, early_bird/qua_he/dau_tu).
const DEFAULT_POLICY: SalesPolicyConfig = {
  base_plans: [
    { key: "thuong", label: "Thanh toán thường", payment_discount_pct: 5, enabled: true },
    { key: "som95", label: "Thanh toán sớm 95%", payment_discount_pct: 12, enabled: true },
    { key: "htls", label: "Hỗ trợ lãi suất ngân hàng", payment_discount_pct: 0, enabled: true },
  ],
  addons: [
    { key: "early_bird", label: "Early Bird", pct: 2, enabled: true },
    { key: "qua_he", label: "Chào Hè", pct: 1.5, enabled: true },
    { key: "dau_tu", label: "Ưu đãi đầu tư", pct: 2, enabled: true },
  ],
  deposit_amount: 200_000_000,
  note: "",
  version: 0,
};

export function PolicyQuoteTab({
  token,
  user,
  initialUnit,
}: {
  token: string;
  user: AuthUser | null;
  initialUnit?: string;
}) {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [policy, setPolicy] = useState<SalesPolicyConfig | null>(null);
  const [policyWarn, setPolicyWarn] = useState<string | null>(null);
  const [form, setForm] = useState({
    unit_id: initialUnit ?? "",
    customer_name: "",
    customer_phone: "",
    base_plan: "",
    addons: [] as string[],
    gift_cash: 0,
    note: "",
  });
  const [result, setResult] = useState<PolicyQuoteResult | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory().then((u) => {
      if (u) {
        setUnits(u);
        setForm((f) => (f.unit_id ? f : { ...f, unit_id: u[0]?.code ?? "" }));
      }
    });
    const applyPolicy = (p: SalesPolicyConfig) => {
      setPolicy(p);
      setForm((f) =>
        f.base_plan
          ? f
          : { ...f, base_plan: p.base_plans.find((b) => b.enabled)?.key ?? "" },
      );
    };
    fetchSalesPolicy()
      .then((p) => {
        applyPolicy(p);
        setPolicyWarn(null);
      })
      .catch(() => {
        // API lỗi → dùng chính sách mặc định để form vẫn hoạt động.
        applyPolicy(DEFAULT_POLICY);
        setPolicyWarn(
          "Không tải được chính sách từ máy chủ — đang dùng cấu hình mặc định. " +
            "Phiếu vẫn lập được; % có thể khác bản chính thức.",
        );
      });
  }, [token]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const toggleAddon = (key: string) =>
    setForm((f) => ({
      ...f,
      addons: f.addons.includes(key)
        ? f.addons.filter((k) => k !== key)
        : [...f.addons, key],
    }));

  async function submit() {
    if (!form.unit_id || !form.customer_name.trim() || !form.base_plan) {
      setError("Vui lòng chọn căn, phương án và nhập tên khách hàng.");
      return;
    }
    const u = units.find((x) => x.code === form.unit_id);
    if (u && !u.has_price) {
      setError("Căn chưa có giá chi tiết, vui lòng liên hệ báo giá.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const q = await createPolicyQuote(token, {
        unit_id: form.unit_id,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        sale_name: user?.full_name,
        sale_phone: user?.phone ?? undefined,
        base_plan: form.base_plan,
        addons: form.addons,
        gift_cash: Number(form.gift_cash) || 0,
        note: form.note.trim() || undefined,
      });
      setResult(q);
      const { fetchBlobUrl } = await import("@/lib/learning");
      setPdfUrl(await fetchBlobUrl(token, q.pdf_url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const plans = (policy?.base_plans ?? []).filter((b) => b.enabled);
  const addons = (policy?.addons ?? []).filter((a) => a.enabled);
  const selectedUnit = units.find((u) => u.code === form.unit_id);
  const noPrice = Boolean(selectedUnit && !selectedUnit.has_price);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-900">
          Thông tin phiếu tính giá
        </h2>

        {policyWarn && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {policyWarn}
          </div>
        )}

        <Field label="Căn hộ">
          <select
            value={form.unit_id}
            onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
          >
            {units.length === 0 && <option value="">Đang tải quỹ căn…</option>}
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} · {u.zone} · {u.area}m²
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tên khách hàng">
            <input
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              placeholder="Nguyễn Văn A"
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
          </Field>
          <Field label="SĐT khách">
            <input
              value={form.customer_phone}
              onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
              placeholder="09xx xxx xxx"
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
          </Field>
        </div>

        <Field label="Phương án thanh toán">
          <div className="flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setForm({ ...form, base_plan: p.key })}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                  form.base_plan === p.key
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-brand-100 text-brand-600 hover:border-orange-200"
                }`}
              >
                {p.label}
                <br />
                <span className="text-[11px] font-normal">
                  CK TT {p.payment_discount_pct}%
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Ưu đãi cộng thêm (chồng tuần tự)">
          <div className="flex flex-wrap gap-2">
            {addons.length === 0 && (
              <span className="text-xs text-brand-400">Không có ưu đãi.</span>
            )}
            {addons.map((a) => {
              const on = form.addons.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggleAddon(a.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    on
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-brand-100 text-brand-600 hover:border-orange-200"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {a.label} +{a.pct}%
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Quà tặng tiền mặt (VND, tuỳ chọn)">
          <input
            type="number"
            value={form.gift_cash}
            onChange={(e) =>
              setForm({ ...form, gift_cash: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
        </Field>

        <Field label="Ghi chú (tuỳ chọn)">
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
        </Field>

        {noPrice && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Căn này chưa có giá chi tiết — vui lòng liên hệ báo giá. Chưa thể lập
            phiếu tính giá.
          </div>
        )}

        {error && <ErrorBox message={error} />}

        <button
          type="button"
          onClick={submit}
          disabled={busy || noPrice}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Calculator size={16} /> {busy ? "Đang tính giá…" : "Lập phiếu tính giá"}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-900">Bản xem trước</h2>
          {result && (
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  token,
                  result.pdf_url,
                  `phieu-tinh-gia-${result.unit_id}.pdf`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
            >
              <Download size={14} /> Tải PDF
            </button>
          )}
        </div>

        {!result ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-200 text-center text-sm text-brand-400">
            <FileText size={32} />
            Chọn phương án + ưu đãi rồi nhấn “Lập phiếu tính giá”.
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-brand-50 p-3 text-sm">
              <Row
                label="Niêm yết (gồm VAT, KPBT)"
                value={fmtVnd(result.gia_ny_gom_vat_kpbt)}
              />
              <Row
                label="Niêm yết chưa VAT/KPBT"
                value={fmtVnd(result.niem_yet_chua_vat_kpbt)}
              />
              {result.gift_cash > 0 && (
                <Row
                  label="Quà tặng tiền mặt"
                  value={"− " + fmtVnd(result.gift_cash)}
                />
              )}
              {result.discount_lines.map((d, i) => (
                <Row
                  key={i}
                  label={`${d.label} (${d.pct}%)`}
                  value={"− " + fmtVnd(d.amount)}
                />
              ))}
              <div className="my-1 border-t border-brand-100" />
              <Row
                label="GTSP gồm VAT, chưa KPBT (F28)"
                value={fmtVnd(result.gtsp_gom_vat_chua_kpbt)}
              />
              <Row label="Phí bảo trì (KPBT)" value={"+ " + fmtVnd(result.kpbt)} />
              <div className="my-1 border-t border-brand-100" />
              <Row
                label="GIÁ BÁN (gồm VAT, KPBT)"
                value={fmtVnd(result.gtsp_final)}
                strong
              />
              <Row label="Đơn giá /m²" value={fmtVnd(result.don_gia)} />
              {result.bank_total > 0 && (
                <Row
                  label="Ngân hàng giải ngân"
                  value={fmtVnd(result.bank_total)}
                />
              )}
            </div>
            {pdfUrl && (
              <iframe
                title="Phiếu tính giá"
                src={pdfUrl}
                className="h-72 w-full rounded-lg border border-brand-100"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
// ============================================================
// Bộ phận dùng chung
// ============================================================

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-orange-500 text-white"
          : "border border-brand-100 bg-white text-brand-600 hover:border-orange-300"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-brand-600">{label}</span>
      {children}
    </label>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-brand-600">{label}</span>
      <span className={strong ? "font-bold text-orange-700" : "text-brand-900"}>
        {value}
      </span>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl border border-brand-100 bg-brand-50"
        />
      ))}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <MessageCircle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
