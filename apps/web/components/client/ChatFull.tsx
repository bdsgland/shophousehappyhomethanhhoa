"use client";

import { useEffect, useRef, useState } from "react";

import { MessageCircle, Send, Sparkles } from "@/components/dashboard/icons";
import { postChat, type ChatTurn } from "@/lib/api";

const PROJECT_SLUG = "eurowindow-light-city";

const WELCOME =
  "Em là trợ lý AI của dự án ELC. Anh/chị muốn tư vấn về căn nào, vị trí, giá cả, hay chính sách bán hàng?";

const SUGGESTIONS = [
  "Dự án còn căn nào dưới 3 tỷ không?",
  "Chính sách thanh toán và chiết khấu thế nào?",
  "Tiện ích nội khu có gì nổi bật?",
  "Vị trí dự án ở đâu, kết nối giao thông ra sao?",
];

type Msg = { role: "user" | "assistant"; content: string };

export function ChatFull() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const history: ChatTurn[] = next.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const reply = await postChat({
        messages: history,
        projectSlug: PROJECT_SLUG,
      });
      setMessages((cur) => [...cur, { role: "assistant", content: reply.reply }]);
    } catch (err) {
      setMessages((cur) => [
        ...cur,
        {
          role: "assistant",
          content:
            (err as Error).message ||
            "Xin lỗi, trợ lý đang bận. Anh/chị thử lại sau giây lát nhé.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[520px] overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
      {/* Sidebar lịch sử (mock) */}
      <div className="hidden w-60 shrink-0 flex-col border-r border-brand-100 bg-brand-50/50 md:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={() => setMessages([{ role: "assistant", content: WELCOME }])}
            className="flex w-full items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <MessageCircle size={16} /> Trò chuyện mới
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-brand-800 ring-1 ring-brand-100">
            Tư vấn dự án ELC
          </div>
          <div className="mt-1 px-3 py-2 text-xs text-brand-400">
            Lịch sử trò chuyện sẽ lưu tại đây.
          </div>
        </div>
      </div>

      {/* Main chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-brand-100 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-brand-900">
              Trợ lý AI · Eurowindow Light City
            </div>
            <div className="text-[11px] text-emerald-600">● Trực tuyến</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-brand-50 text-brand-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-brand-50 px-4 py-3">
                <div className="flex gap-1">
                  <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                </div>
              </div>
            </div>
          )}

          {messages.length <= 1 && !loading && (
            <div className="flex flex-wrap gap-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs text-brand-700 hover:border-indigo-300 hover:text-indigo-700"
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập câu hỏi của bạn…"
            className="flex-1 rounded-xl border border-brand-100 bg-white px-4 py-2.5 text-sm text-brand-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            aria-label="Gửi"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-bounce rounded-full bg-brand-400"
      style={{ animationDelay: delay }}
    />
  );
}
