"use client";

import { useRef, useState } from "react";

import {
  AgencyHeader,
  Card,
  TierBadge,
  fmtNum,
} from "@/components/agency/AgencyKit";
import {
  askAgencyAssistant,
  type AgencyAssistantLead,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

type ChatMsg = { role: "user" | "ai"; text: string; source?: string };

const SUGGESTED = [
  "Tình hình sàn hiện tại thế nào?",
  "Khách nào nên ưu tiên gọi hôm nay?",
  "Đề xuất cách tăng tỉ lệ chốt?",
  "Đội sale của tôi đang hoạt động ra sao?",
];

export default function AgencyAssistantPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [topLeads, setTopLeads] = useState<AgencyAssistantLead[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const token = readToken();
    if (!token) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const r = await askAgencyAssistant(token, q);
      setMessages((m) => [
        ...m,
        { role: "ai", text: r.answer, source: r.source },
      ]);
      setTopLeads(r.top_priority_leads ?? []);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text:
            e instanceof Error
              ? e.message
              : "Xin lỗi, chưa trả lời được lúc này.",
        },
      ]);
    } finally {
      setLoading(false);
      window.setTimeout(() => {
        listRef.current?.scrollTo({
          top: listRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  }

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Trợ lý AI điều hành sàn"
        subtitle="Hỏi đáp dựa trên dữ liệu thật của sàn bạn"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="flex h-[60vh] flex-col rounded-2xl border border-brand-100 bg-white shadow-sm">
            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
                    AI
                  </span>
                  <p className="max-w-sm text-sm text-brand-600">
                    Hỏi trợ lý về tình hình sàn, khách cần ưu tiên, cách tăng
                    chốt… AI trả lời dựa trên dữ liệu sàn của bạn.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTED.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-brand-500 text-white"
                          : "border border-indigo-100 bg-indigo-50 text-indigo-900"
                      }`}
                    >
                      {m.text}
                      {m.role === "ai" && m.source === "fallback" ? (
                        <div className="mt-1 text-[10px] text-indigo-400">
                          (trả lời từ số liệu — chưa bật Claude)
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-sm text-indigo-500">
                    Đang phân tích…
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-brand-100 p-3">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send(input);
                  }}
                  placeholder="Nhập câu hỏi về sàn của bạn…"
                  className="flex-1 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Gửi
                </button>
              </div>
            </div>
          </section>
        </div>

        <Card title="Khách nên ưu tiên">
          {topLeads.length === 0 ? (
            <p className="text-sm text-brand-500">
              Sẽ hiện sau khi bạn hỏi trợ lý.
            </p>
          ) : (
            <ul className="space-y-2">
              {topLeads.map((l, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-brand-50 bg-brand-50/40 p-2.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-semibold text-brand-900">
                      {l.name ?? "Khách"}
                    </span>
                    <TierBadge tier={l.ai_tier} />
                  </div>
                  <div className="mt-0.5 text-xs text-brand-500">
                    Điểm AI {fmtNum(l.ai_score)} · {l.status}
                  </div>
                  {l.ai_next_action ? (
                    <div className="mt-1 text-xs text-emerald-700">
                      → {l.ai_next_action}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
