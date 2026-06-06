"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Calculator,
  DollarSign,
  GitCompare,
  Heart,
  MessageCircle,
  User,
} from "@/components/dashboard/icons";
import {
  addFavorite,
  fetchRecommended,
  removeFavorite,
  type AuthUser,
  type RawUnit,
} from "@/lib/api";
import { readToken, readUserFromCookie } from "@/lib/auth";

const FEATURES = [
  {
    href: "/client/chat",
    title: "Chat AI tư vấn",
    desc: "Hỏi đáp 24/7 về dự án",
    Icon: MessageCircle,
    color: "from-sky-400 to-indigo-500",
  },
  {
    href: "/client/pricing",
    title: "Phiếu tính giá",
    desc: "Chiết khấu, VAT, tổng tiền",
    Icon: Calculator,
    color: "from-emerald-400 to-teal-500",
  },
  {
    href: "/client/loan",
    title: "Tính lãi vay",
    desc: "Lịch trả nợ ngân hàng",
    Icon: DollarSign,
    color: "from-amber-400 to-orange-500",
  },
  {
    href: "/client/compare",
    title: "So sánh căn hộ",
    desc: "Đặt 2–4 căn cạnh nhau",
    Icon: GitCompare,
    color: "from-fuchsia-400 to-purple-500",
  },
];

export default function ClientDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RawUnit[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const u = readUserFromCookie();
    const t = readToken();
    setUser(u);
    setToken(t);
    setFavorites(u?.favorites ?? []);
    if (t) {
      fetchRecommended(t)
        .then(setRecommended)
        .catch(() => setRecommended([]));
    }
  }, []);

  async function toggleFav(unitId: string) {
    if (!token) return;
    const isFav = favorites.includes(unitId);
    // optimistic
    setFavorites((f) =>
      isFav ? f.filter((x) => x !== unitId) : [...f, unitId],
    );
    try {
      const res = isFav
        ? await removeFavorite(token, unitId)
        : await addFavorite(token, unitId);
      setFavorites(res.unit_ids);
    } catch {
      // revert on error
      setFavorites((f) =>
        isFav ? [...f, unitId] : f.filter((x) => x !== unitId),
      );
    }
  }

  const firstName = user?.full_name?.trim().split(/\s+/).slice(-1)[0] ?? "bạn";

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 to-sky-500 p-6 text-white shadow-sm">
        <h1 className="text-2xl font-bold">
          Xin chào {user?.full_name ?? firstName} 👋
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-indigo-50">
          Chào mừng đến không gian khách hàng của{" "}
          <b>Eurowindow Light City</b> — khu đô thị 176ha bên sông Mã, TP Thanh Hoá.
          Khám phá quỹ căn, tính giá, lãi vay và đặt câu hỏi cho trợ lý AI bất cứ lúc nào.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/client/chat"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Bắt đầu trò chuyện AI
          </Link>
          <Link
            href="/dashboard/project/eurowindow-light-city"
            className="rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Xem mặt bằng quỹ căn
          </Link>
        </div>
      </div>

      {/* 4 tính năng */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ href, title, desc, Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-brand-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white`}
            >
              <Icon size={22} />
            </div>
            <div className="mt-3 text-sm font-bold text-brand-900">{title}</div>
            <div className="text-xs text-brand-600">{desc}</div>
          </Link>
        ))}
      </div>

      {/* Căn gợi ý */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-brand-900">
          Căn hộ gợi ý cho bạn
        </h2>
        {recommended.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-8 text-center text-sm text-brand-500">
            Đang tải gợi ý căn hộ…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((u) => {
              const isFav = favorites.includes(u.id);
              return (
                <div
                  key={u.id}
                  className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-base font-bold text-brand-900">{u.id}</div>
                      <div className="text-xs text-brand-600">
                        {u.phan_khu} · {u.loai}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFav(u.id)}
                      aria-label="Yêu thích"
                      className={`rounded-full p-2 transition ${
                        isFav
                          ? "bg-rose-50 text-rose-500"
                          : "text-brand-300 hover:bg-brand-50 hover:text-rose-400"
                      }`}
                    >
                      <Heart size={18} />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-brand-600">
                    <div>
                      DT: <b className="text-brand-900">{u.dien_tich} m²</b>
                    </div>
                    <div>
                      MT: <b className="text-brand-900">{u.mat_tien} m</b>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-indigo-700">{u.gia}</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                      {u.trang_thai}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/client/pricing"
                      className="flex-1 rounded-lg border border-brand-100 px-3 py-1.5 text-center text-xs font-medium text-brand-800 hover:border-indigo-300"
                    >
                      Tính giá
                    </Link>
                    <Link
                      href="/client/chat"
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Hỏi AI
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sale phụ trách */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-brand-900">Sale phụ trách bạn</h2>
        <div className="flex items-center gap-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-400">
            <User size={24} />
          </div>
          <div>
            <div className="text-sm font-semibold text-brand-900">
              Đang phân công chuyên viên
            </div>
            <div className="text-xs text-brand-600">
              Chuyên viên kinh doanh ELC sẽ sớm liên hệ hỗ trợ bạn. Trong lúc chờ, bạn
              có thể hỏi trợ lý AI bất cứ điều gì.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
