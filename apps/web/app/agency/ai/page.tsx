"use client";

import { useState } from "react";

import {
  AgencyError,
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
  fmtTimeAgo,
  useAgencyAuth,
} from "@/components/agency/AgencyKit";
import { Sparkles } from "@/components/dashboard/icons";
import {
  generateManagerImprovements,
  type ImprovementsResponse,
} from "@/lib/api";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-brand-100 text-brand-700",
};

const SEVERITY_LABEL: Record<string, string> = {
  high: "Ưu tiên cao",
  medium: "Trung bình",
  low: "Thấp",
};

const AREA_LABEL: Record<string, string> = {
  lead: "Lead",
  marketing: "Marketing",
  sales_ai: "Sale AI",
  care: "Chăm sóc",
  finance: "Tài chính",
  platform: "Nền tảng",
  automation: "Tự động hoá",
  other: "Khác",
};

export default function AgencyAiPage() {
  const { token, ready } = useAgencyAuth();
  const [focus, setFocus] = useState("");
  const [data, setData] = useState<ImprovementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onGenerate() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateManagerImprovements(token, focus.trim() || undefined);
      setData(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <AgencyLoading />;

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Đề xuất cải tiến (AI)"
        subtitle="Gợi ý vận hành dựa trên số liệu thật — chỉ tham khảo, không tự thực thi"
      />

      <Card>
        <label className="block text-sm font-medium text-brand-800">
          Tập trung vào (tuỳ chọn)
        </label>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="VD: chi phí marketing, SLA nhận khách nóng…"
          className="mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading || !token}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          <Sparkles size={18} />
          {loading ? "Đang phân tích…" : "Tạo đề xuất cải tiến"}
        </button>
      </Card>

      {error && <AgencyError error={error} onRetry={onGenerate} />}
      {loading && !data && <AgencyLoading label="AI đang phân tích số liệu…" />}

      {!error && data && (
        <>
          <div className="text-xs text-brand-600">
            Nguồn:{" "}
            {data.generated_by === "ai" ? "Phân tích AI" : "Phân tích nội bộ"} ·{" "}
            {fmtTimeAgo(data.generated_at)}
          </div>
          {data.improvements.length === 0 ? (
            <EmptyState text="Chưa có đề xuất nào." />
          ) : (
            <div className="space-y-3">
              {data.improvements.map((imp, i) => (
                <Card key={`${imp.title}-${i}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-brand-900">
                      {imp.title}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        SEVERITY_STYLE[imp.severity] ?? SEVERITY_STYLE.low
                      }`}
                    >
                      {SEVERITY_LABEL[imp.severity] ?? imp.severity}
                    </span>
                  </div>
                  <div className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                    {AREA_LABEL[imp.area] ?? imp.area}
                  </div>
                  <p className="mt-2 text-sm text-brand-800">{imp.detail}</p>
                  {imp.suggested_action && (
                    <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      <span className="font-semibold">Đề xuất: </span>
                      {imp.suggested_action}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
