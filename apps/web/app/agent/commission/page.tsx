"use client";

import { useEffect, useState } from "react";

import { Award, DollarSign, TrendingUp, Users } from "@/components/dashboard/icons";
import {
  fetchCommission,
  fetchMyCommissionTier,
  type CommissionData,
  type MyCommissionTier,
} from "@/lib/api";
import { readToken, readUserFromCookie } from "@/lib/auth";

function vnd(n: number): string {
  if (!n) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

const MONTH_LABELS = ["T1", "T2", "T3", "T4", "T5", "T6"];

// Bảng minh hoạ 5 bậc — hoa hồng 4% trên căn 5 tỷ = 200 triệu.
const TIER_TABLE = [
  {
    bac: 1,
    role: "Ekip công ty",
    pct: "20% → 5% (giảm khi frontline lũy tiến)",
    money: "40tr → 10tr",
  },
  { bac: 2, role: "Giám đốc dự án", pct: "10%", money: "20tr" },
  { bac: 3, role: "Trưởng phòng", pct: "5%", money: "10tr" },
  { bac: 4, role: "Sale Leader", pct: "15%", money: "30tr" },
  {
    bac: 5,
    role: "Sale Frontline",
    pct: "50% → 65% (lũy tiến)",
    money: "100tr → 130tr",
    highlight: true,
  },
];

const LUY_TIEN_ROWS = [
  { label: "Căn 1", pct: 50 },
  { label: "Căn 2", pct: 55 },
  { label: "Căn 3", pct: 60 },
  { label: "Căn 4+", pct: 65 },
];

export default function CommissionPage() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [tier, setTier] = useState<MyCommissionTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setError("Bạn chưa đăng nhập.");
      setLoading(false);
      return;
    }
    fetchCommission(token)
      .then(setData)
      .catch((e) => setError(e.message ?? "Không tải được dữ liệu"))
      .finally(() => setLoading(false));

    // Bậc KPI lũy tiến (cấu hình động từ admin) — chỉ sale/admin mới gọi được.
    const user = readUserFromCookie();
    if (user && (user.role === "sale" || user.role === "admin")) {
      fetchMyCommissionTier(token)
        .then(setTier)
        .catch(() => setTier(null));
    }
  }, []);

  if (loading) {
    return <div className="text-sm text-brand-700">Đang tải số liệu hoa hồng…</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error ?? "Không có dữ liệu."}
      </div>
    );
  }

  const stats = [
    {
      label: "Tổng hoa hồng đã nhận",
      value: vnd(data.total_received),
      Icon: DollarSign,
      tone: "from-emerald-500 to-emerald-600",
    },
    {
      label: "Hoa hồng tháng này",
      value: vnd(data.this_month),
      Icon: TrendingUp,
      tone: "from-amber-500 to-orange-500",
    },
    {
      label: "Hoa hồng đang chờ",
      value: vnd(data.pending),
      Icon: Award,
      tone: "from-sky-500 to-blue-600",
    },
    {
      label: "Số căn đã chốt",
      value: String(data.closed_count),
      Icon: Users,
      tone: "from-violet-500 to-purple-600",
    },
  ];

  const maxRevenue = Math.max(1, ...data.monthly_revenue);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Hoa hồng của tôi</h1>
        <p className="text-sm text-brand-700">
          Theo dõi thu nhập, bậc hoa hồng lũy tiến và cơ chế chia hoa hồng đa tầng.
        </p>
      </header>

      {/* Bậc KPI hiện tại (cấu hình động từ admin) */}
      {tier && (
        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-800">
            Bậc KPI hiện tại của bạn
          </h2>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-extrabold text-brand-900">
                {tier.current_tier.name}
              </h3>
              <p className="text-sm text-brand-700">
                Doanh số tháng: <b>{vnd(tier.monthly_volume_so_far)}</b>
              </p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-600">
                {tier.current_tier.frontline_percentage}% hoa hồng
              </p>
              {tier.current_tier.description_vi && (
                <p className="mt-1 text-xs text-brand-500">
                  {tier.current_tier.description_vi}
                </p>
              )}
            </div>
            <div className="w-full sm:max-w-xs">
              {tier.next_tier ? (
                <>
                  <p className="text-sm text-brand-700">
                    Còn <b>{vnd(tier.amount_to_next_tier)}</b> để lên{" "}
                    <b>{tier.next_tier.name}</b>
                  </p>
                  <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, tier.progress_percentage))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-brand-600">
                    Lên bậc tiếp = {tier.next_tier.frontline_percentage}% hoa hồng
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">
                  🏆 Bạn đang ở bậc cao nhất!
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Stats 4 cột */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, Icon, tone }) => (
          <div
            key={label}
            className={`rounded-xl bg-gradient-to-br ${tone} p-4 text-white shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <Icon size={22} className="opacity-90" />
            </div>
            <div className="mt-3 text-2xl font-extrabold leading-tight">
              {value}
            </div>
            <div className="mt-0.5 text-xs font-medium opacity-90">{label}</div>
          </div>
        ))}
      </div>

      {/* Bậc hoa hồng hiện tại */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-sm">
            <Award size={16} />
            {data.current_tier_label} (Cấp 5)
          </span>
          <span className="text-sm font-semibold text-orange-700">
            Đang ở mức {data.luy_tien_pct}%
          </span>
        </div>
        <p className="mt-3 text-sm text-brand-800">
          Bạn đang ở mức <b>{data.luy_tien_pct}%</b> (căn thứ{" "}
          {data.luy_tien_level}). Bán thêm để lũy tiến lên 55% → 60% → 65% (tối đa).
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {LUY_TIEN_ROWS.map((row, i) => {
            const isCurrent = i + 1 === data.luy_tien_level;
            const reached = i + 1 <= data.luy_tien_level;
            return (
              <div
                key={row.label}
                className={`rounded-xl border p-3 text-center ${
                  isCurrent
                    ? "border-orange-400 bg-white shadow-sm ring-2 ring-orange-300"
                    : reached
                    ? "border-amber-200 bg-white"
                    : "border-amber-100 bg-white/60"
                }`}
              >
                <div className="text-xs font-medium text-brand-700">
                  {row.label}
                </div>
                <div
                  className={`mt-1 text-xl font-extrabold ${
                    isCurrent ? "text-orange-600" : "text-brand-900"
                  }`}
                >
                  {row.pct}%
                </div>
                {isCurrent && (
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-orange-600">
                    ← Hiện tại
                  </div>
                )}
                {i === 3 && (
                  <div className="mt-1 text-[11px] font-medium text-brand-500">
                    Tối đa
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Cơ chế hoa hồng đa tầng */}
      <section className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
        <div className="border-b border-brand-100 bg-brand-50 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
            Cơ chế hoa hồng đa tầng (5 bậc)
          </h2>
          <p className="mt-0.5 text-xs text-brand-700">
            Minh hoạ trên hoa hồng 4% của 1 căn 5 tỷ = 200 triệu đồng.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-brand-600">
                <th className="px-4 py-2.5">Bậc</th>
                <th className="px-4 py-2.5">Vai trò</th>
                <th className="px-4 py-2.5">% của 4%</th>
                <th className="px-4 py-2.5">Tiền (căn 5 tỷ)</th>
              </tr>
            </thead>
            <tbody>
              {TIER_TABLE.map((row) => (
                <tr
                  key={row.bac}
                  className={`border-b border-brand-50 ${
                    row.highlight ? "bg-amber-50 font-semibold" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        row.highlight
                          ? "bg-orange-500 text-white"
                          : "bg-brand-100 text-brand-800"
                      }`}
                    >
                      {row.bac}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-brand-900">{row.role}</td>
                  <td className="px-4 py-2.5 text-brand-700">{row.pct}</td>
                  <td className="px-4 py-2.5 text-brand-900">{row.money}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Hoa hồng giới thiệu khách */}
      <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
          Hoa hồng giới thiệu khách
        </h2>
        <p className="mt-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Mang khách về (data) → nhận{" "}
          <b>{data.referral_commission_pct}% của hoa hồng</b> (≈ 0.2% giá nhà).
          Ví dụ căn 5 tỷ → bạn nhận ~10 triệu đồng dù không trực tiếp chốt.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-brand-600">
                <th className="px-3 py-2">Tên khách</th>
                <th className="px-3 py-2">Dự án</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Hoa hồng dự kiến</th>
              </tr>
            </thead>
            <tbody>
              {data.referral_deals.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-sm text-brand-500"
                  >
                    Chưa có khách giới thiệu nào. Chia sẻ link giới thiệu của bạn
                    để bắt đầu.
                  </td>
                </tr>
              ) : (
                data.referral_deals.map((d, i) => (
                  <tr key={i} className="border-b border-brand-50">
                    <td className="px-3 py-2.5 text-brand-900">{d.customer}</td>
                    <td className="px-3 py-2.5 text-brand-700">{d.project}</td>
                    <td className="px-3 py-2.5 text-brand-700">{d.status}</td>
                    <td className="px-3 py-2.5 text-brand-900">
                      {vnd(d.expected_commission)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Lịch sử giao dịch */}
      <section className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
        <div className="border-b border-brand-100 bg-brand-50 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
            Lịch sử giao dịch
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-brand-600">
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">Loại</th>
                <th className="px-3 py-2">Khách hàng</th>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2">Doanh số</th>
                <th className="px-3 py-2">Hoa hồng của bạn</th>
                <th className="px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-brand-500"
                  >
                    Chưa có giao dịch. Khi bạn chốt căn đầu tiên, hoa hồng sẽ hiển
                    thị tại đây.
                  </td>
                </tr>
              ) : (
                data.transactions.map((t, i) => (
                  <tr key={i} className="border-b border-brand-50">
                    <td className="px-3 py-2.5 text-brand-700">{t.date}</td>
                    <td className="px-3 py-2.5 text-brand-700">{t.type}</td>
                    <td className="px-3 py-2.5 text-brand-900">{t.customer}</td>
                    <td className="px-3 py-2.5 text-brand-700">{t.product}</td>
                    <td className="px-3 py-2.5 text-brand-900">{vnd(t.revenue)}</td>
                    <td className="px-3 py-2.5 font-semibold text-emerald-700">
                      {vnd(t.commission)}
                    </td>
                    <td className="px-3 py-2.5 text-brand-700">{t.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Biểu đồ doanh thu 6 tháng */}
      <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
          Doanh thu 6 tháng gần nhất
        </h2>
        <div className="mt-5 flex items-end justify-between gap-3" style={{ height: 180 }}>
          {data.monthly_revenue.map((v, i) => {
            const h = Math.round((v / maxRevenue) * 140);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-[11px] font-medium text-brand-600">
                  {v ? vnd(v) : "—"}
                </div>
                <div
                  className="w-full max-w-[44px] rounded-t-lg bg-gradient-to-t from-amber-400 to-orange-500"
                  style={{ height: Math.max(4, h) }}
                  title={vnd(v)}
                />
                <div className="text-xs text-brand-500">{MONTH_LABELS[i]}</div>
              </div>
            );
          })}
        </div>
        {maxRevenue === 1 && (
          <p className="mt-3 text-center text-xs text-brand-500">
            Chưa có doanh thu ghi nhận trong 6 tháng qua.
          </p>
        )}
      </section>
    </div>
  );
}
