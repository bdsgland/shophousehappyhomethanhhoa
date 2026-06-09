"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ChevronLeft,
  Download,
  FileText,
  Send,
  Sparkles,
} from "@/components/dashboard/icons";
import { readToken } from "@/lib/auth";
import {
  askLearning,
  CATEGORY_LABELS,
  downloadFile,
  fetchBlobUrl,
  fetchDocument,
  formatBytes,
  type AskSource,
  type DocumentCategory,
  type LearningDocument,
} from "@/lib/learning";

export function DocumentDetail({ id }: { id: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [doc, setDoc] = useState<LearningDocument | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(readToken());
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let createdUrl: string | null = null;
    fetchDocument(token, id)
      .then(async (d) => {
        if (!active) return;
        setDoc(d);
        if (d.type === "pdf") {
          createdUrl = await fetchBlobUrl(token, d.download_url);
          if (active) setPdfUrl(createdUrl);
          else if (createdUrl) URL.revokeObjectURL(createdUrl);
        }
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [token, id]);

  return (
    <div className="space-y-4">
      <Link
        href="/agent/learning"
        className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-orange-700"
      >
        <ChevronLeft size={16} /> Kho học tập
      </Link>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : !doc ? (
        <div className="h-40 animate-pulse rounded-xl border border-brand-100 bg-brand-50" />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 text-orange-600">
                <FileText size={24} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-brand-900">{doc.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brand-500">
                  <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                    {CATEGORY_LABELS[doc.category]}
                  </span>
                  <span className="uppercase">{doc.type}</span>
                  <span>{formatBytes(doc.size)}</span>
                  {doc.indexed && (
                    <span className="text-emerald-600">● đã index ({doc.chunks} đoạn)</span>
                  )}
                </div>
              </div>
            </div>
            {token && (
              <button
                type="button"
                onClick={() =>
                  downloadFile(token, doc.download_url, `${doc.title}.${doc.type}`)
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                <Download size={16} /> Tải tài liệu
              </button>
            )}
          </header>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              {pdfUrl ? (
                <iframe
                  title={doc.title}
                  src={pdfUrl}
                  className="h-[70vh] min-h-[420px] w-full rounded-2xl border border-brand-100 bg-white"
                />
              ) : (
                <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-white text-center text-sm text-brand-500">
                  <FileText size={32} />
                  {doc.type === "pdf"
                    ? "Đang tải bản xem trước…"
                    : "Định dạng này không xem trước được — vui lòng tải về."}
                </div>
              )}
            </div>
            <div className="lg:col-span-2">
              {token && <AskAboutDoc token={token} doc={doc} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string; sources?: AskSource[] };

/** Thay tin nhắn cuối bằng bản mới (bất biến) nếu nó là của assistant. */
function patchLast(msgs: Msg[], fn: (last: Msg) => Msg): Msg[] {
  if (msgs.length === 0) return msgs;
  const last = msgs[msgs.length - 1];
  if (last.role !== "assistant") return msgs;
  return [...msgs.slice(0, -1), fn(last)];
}

function AskAboutDoc({ token, doc }: { token: string; doc: LearningDocument }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: `Hỏi em bất cứ điều gì về “${doc.title}” — em trả lời theo tài liệu chính thống.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    // Gắn tên tài liệu vào câu hỏi để RAG ưu tiên đúng ngữ cảnh.
    const scoped = `Trong tài liệu "${doc.title}": ${q}`;
    setMessages((m) => [
      ...m,
      { role: "user", content: q },
      { role: "assistant", content: "", sources: [] },
    ]);
    setStreaming(true);
    try {
      await askLearning(token, scoped, null, (ev) => {
        if (ev.type === "delta")
          setMessages((m) =>
            patchLast(m, (last) => ({ ...last, content: last.content + ev.text })),
          );
        else if (ev.type === "sources")
          setMessages((m) => patchLast(m, (last) => ({ ...last, sources: ev.sources })));
      });
    } catch (e) {
      setMessages((m) =>
        patchLast(m, (last) => ({
          ...last,
          content: (e as Error).message || "AI đang bận, thử lại sau nhé.",
        })),
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-brand-100 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
          <Sparkles size={16} />
        </div>
        <div className="text-sm font-semibold text-brand-900">Hỏi AI về tài liệu</div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-1.5"}>
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-indigo-600 text-white" : "bg-brand-50 text-brand-900"
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {m.sources.map((s, si) => (
                  <Link
                    key={si}
                    href={`/agent/learning/documents/${s.document_id}`}
                    className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
                    title={s.snippet}
                  >
                    📄 {s.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-brand-100 p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập câu hỏi…"
          className="flex-1 rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          aria-label="Gửi"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
