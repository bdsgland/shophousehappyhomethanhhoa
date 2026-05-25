"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { postChat, type ChatTurn } from "@/lib/api";

const PROJECT_SLUG = "eurowindow-light-city";

const GREETING: ChatTurn = {
  role: "assistant",
  content:
    "Em chào Anh/Chị 👋\n\nEm là trợ lý tư vấn của dự án **Eurowindow Light City**. Anh/Chị quan tâm về vị trí, giá bán, chính sách thanh toán hay pháp lý dự án ạ? Em sẵn lòng hỗ trợ.",
};

type DisplayMessage = ChatTurn & { id: string };

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderInline(text: string, keyPrefix: string) {
  // chỉ xử lý **bold** — đủ dùng cho output Claude hiện tại
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function MessageContent({ content, id }: { content: string; id: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 text-[14px] leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.replace(/^#{1,6}\s+/, "");
        if (line.trim() === "---") {
          return (
            <hr
              key={`${id}-${idx}`}
              className="my-2 border-t border-current opacity-20"
            />
          );
        }
        if (line.trim() === "") {
          return <div key={`${id}-${idx}`} className="h-1" />;
        }
        const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div
              key={`${id}-${idx}`}
              className="flex gap-2 pl-1"
            >
              <span aria-hidden className="select-none opacity-60">
                •
              </span>
              <span>{renderInline(bulletMatch[1], `${id}-${idx}`)}</span>
            </div>
          );
        }
        return (
          <div key={`${id}-${idx}`}>
            {renderInline(line, `${id}-${idx}`)}
          </div>
        );
      })}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" />
    </div>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    { ...GREETING, id: makeId() },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [open, messages, isSending]);

  useEffect(() => {
    if (open) {
      // focus input sau khi mở
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setErrorMsg(null);
    const userMsg: DisplayMessage = {
      id: makeId(),
      role: "user",
      content: text,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const payload: ChatTurn[] = nextHistory.map(({ role, content }) => ({
        role,
        content,
      }));
      const reply = await postChat({
        messages: payload,
        projectSlug: PROJECT_SLUG,
        signal: controller.signal,
      });
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: reply.reply },
      ]);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg(
        (err as Error).message ||
          "Không kết nối được trợ lý. Vui lòng thử lại trong giây lát.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      {/* Bong bóng nổi */}
      <button
        type="button"
        aria-label={open ? "Đóng cửa sổ chat" : "Mở cửa sổ chat tư vấn"}
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-900/20 transition hover:bg-brand-600 sm:bottom-6 sm:right-6 ${
          open ? "scale-95" : "scale-100"
        }`}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-6 w-6"
            aria-hidden
          >
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7"
            aria-hidden
          >
            <path d="M12 3C6.477 3 2 6.806 2 11.5c0 2.32 1.1 4.42 2.9 5.94L4 21l4.18-1.39c1.2.35 2.49.54 3.82.54 5.523 0 10-3.806 10-8.5S17.523 3 12 3z" />
          </svg>
        )}
      </button>

      {/* Cửa sổ chat */}
      {open && (
        <div
          role="dialog"
          aria-label="Trợ lý tư vấn Eurowindow Light City"
          className="fixed inset-x-3 bottom-24 z-50 flex max-h-[min(80vh,640px)] flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-2xl shadow-brand-900/15 sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[380px]"
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-brand-100 bg-brand-900 px-4 py-3 text-white">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-base font-semibold">
              ELC
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                Tư vấn Eurowindow Light City
              </div>
              <div className="flex items-center gap-1.5 text-xs text-brand-100">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Trợ lý AI · phản hồi 24/7
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="rounded-md p-1 text-brand-100 transition hover:bg-white/10 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
                aria-hidden
              >
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Lịch sử tin nhắn */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-[#fbf9f5] px-4 py-4"
          >
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      isUser
                        ? "rounded-br-md bg-brand-500 text-white"
                        : "rounded-bl-md border border-brand-100 bg-white text-brand-900"
                    }`}
                  >
                    <MessageContent content={m.content} id={m.id} />
                  </div>
                </div>
              );
            })}
            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-brand-100 bg-white px-3 py-2 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Ô nhập */}
          <form
            onSubmit={onSubmit}
            className="border-t border-brand-100 bg-white px-3 py-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Nhập câu hỏi của Anh/Chị…"
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                aria-label="Gửi tin nhắn"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-100 disabled:text-brand-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2 .4 6.6z" />
                </svg>
              </button>
            </div>
            <div className="mt-1.5 text-[11px] text-brand-700/70">
              Enter để gửi · Shift + Enter để xuống dòng
            </div>
          </form>
        </div>
      )}
    </>
  );
}
