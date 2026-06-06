"use client";

import { useEffect, useState } from "react";

import { Copy, Share2, Users } from "@/components/dashboard/icons";
import { fetchReferrals, type ReferralsData } from "@/lib/api";
import { readToken } from "@/lib/auth";

const REGISTER_BASE = "https://eurowindowlightcity.net/register";

function vnd(n: number): string {
  if (!n) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1
    ? parts[0].slice(0, 2)
    : parts[parts.length - 2][0] + parts[parts.length - 1][0]
  ).toUpperCase();
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    const t = readToken();
    if (!t) {
      setLoading(false);
      return;
    }
    fetchReferrals(t)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-brand-700">Đang tải cây giới thiệu…</div>;
  }

  const code = data?.referral_code ?? "—";
  const link = `${REGISTER_BASE}?ref=${data?.referral_code ?? ""}`;

  function copy(what: "code" | "link") {
    const text = what === "code" ? code : link;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const shareFb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
  const shareMail = `mailto:?subject=${encodeURIComponent(
    "Đăng ký làm chuyên viên Eurowindow Light City",
  )}&body=${encodeURIComponent(`Đăng ký qua link giới thiệu của tôi: ${link}`)}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Cây giới thiệu</h1>
        <p className="text-sm text-brand-700">
          Mời thêm chuyên viên vào tuyến dưới của bạn để nhận hoa hồng đa tầng.
        </p>
      </header>

      {/* Mã giới thiệu */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-orange-700">
          Mã giới thiệu của bạn
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-white px-4 py-2 font-mono text-lg font-bold tracking-wider text-orange-700 shadow-sm">
            {code}
          </span>
          <button
            type="button"
            onClick={() => copy("code")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
          >
            <Copy size={16} />
            {copied === "code" ? "Đã copy" : "Copy mã"}
          </button>
        </div>

        <div className="mt-4">
          <div className="text-xs font-medium text-brand-700">Link đăng ký đầy đủ</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={link}
              className="min-w-0 flex-1 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-700"
            />
            <button
              type="button"
              onClick={() => copy("link")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm font-medium text-brand-800 hover:border-orange-400"
            >
              <Copy size={16} />
              {copied === "link" ? "Đã copy" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={shareFb}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Share2 size={16} /> Facebook
            </a>
            <a
              href={`https://zalo.me/share?u=${encodeURIComponent(link)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
            >
              <Share2 size={16} /> Zalo
            </a>
            <a
              href={shareMail}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm font-medium text-brand-800 hover:border-orange-400"
            >
              <Share2 size={16} /> Email
            </a>
          </div>
        </div>
      </section>

      {/* Upline */}
      <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
          Upline (người giới thiệu bạn)
        </h2>
        {data?.upline ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white">
              {initials(data.upline.full_name)}
            </div>
            <div>
              <div className="text-sm font-semibold text-brand-900">
                {data.upline.full_name}
              </div>
              <div className="text-xs text-brand-600">
                {data.upline.role === "admin" ? "Quản trị" : "Chuyên viên"} ·{" "}
                {data.upline.email}
                {data.upline.phone ? ` · ${data.upline.phone}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-brand-500">
            Bạn là <b>gốc cây</b> — không có người giới thiệu phía trên.
          </p>
        )}
      </section>

      {/* Stats team */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Tổng số downline", value: String(data?.team_size ?? 0) },
          { label: "Tổng doanh số team", value: vnd(data?.team_revenue ?? 0) },
          {
            label: "Hoa hồng team chia về bạn",
            value: vnd(data?.team_commission_to_me ?? 0),
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm"
          >
            <div className="text-xs uppercase tracking-wide text-brand-600">
              {s.label}
            </div>
            <div className="mt-1 text-xl font-extrabold text-brand-900">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Downline list */}
      <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-900">
          <Users size={16} className="text-orange-500" />
          Downline (người bạn giới thiệu)
        </h2>
        {data && data.downlines.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {data.downlines.map((d) => (
              <li
                key={d.email}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
                    {initials(d.full_name)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-brand-900">
                      {d.full_name}
                    </div>
                    <div className="text-xs text-brand-600">
                      Chuyên viên{d.region ? ` · ${d.region}` : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-brand-700">
                  <div>
                    Đã bán: <b>{d.closed_count ?? 0}</b> căn
                  </div>
                  <div>
                    Hoa hồng về bạn:{" "}
                    <b className="text-emerald-700">
                      {vnd(d.commission_to_me ?? 0)}
                    </b>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-brand-200 bg-brand-50 px-4 py-8 text-center text-sm text-brand-500">
            Bạn chưa giới thiệu ai. Chia sẻ link đăng ký phía trên để xây dựng tuyến
            dưới và nhận hoa hồng đa tầng.
          </div>
        )}
      </section>
    </div>
  );
}
