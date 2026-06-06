"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Heart } from "@/components/dashboard/icons";
import { fetchFavorites, removeFavorite, type RawUnit } from "@/lib/api";
import { readToken } from "@/lib/auth";

export default function FavoritesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [units, setUnits] = useState<RawUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    fetchFavorites(t)
      .then((res) => setUnits(res.units))
      .catch(() => setUnits([]))
      .finally(() => setLoading(false));
  }, []);

  async function remove(unitId: string) {
    if (!token) return;
    setUnits((u) => u.filter((x) => x.id !== unitId));
    try {
      await removeFavorite(token, unitId);
    } catch {
      // im lặng — sẽ đồng bộ lại ở lần load sau
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Căn yêu thích</h1>
        <p className="text-sm text-brand-700">
          Những căn bạn đã lưu để theo dõi và so sánh.
        </p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-8 text-center text-sm text-brand-500">
          Đang tải…
        </div>
      ) : units.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center">
          <Heart size={32} className="mx-auto mb-3 text-brand-300" />
          <div className="text-sm font-medium text-brand-800">
            Bạn chưa lưu căn nào
          </div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-brand-500">
            Nhấn vào biểu tượng trái tim ở danh mục căn để lưu lại những căn bạn quan tâm.
          </p>
          <Link
            href="/dashboard/project/eurowindow-light-city"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Xem danh mục căn
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => (
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
                  onClick={() => remove(u.id)}
                  aria-label="Bỏ yêu thích"
                  className="rounded-full bg-rose-50 p-2 text-rose-500 hover:bg-rose-100"
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
                  href="/client/compare"
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  So sánh
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
