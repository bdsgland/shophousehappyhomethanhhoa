"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  fetchAgencyMe,
  submitAgencyForReview,
  updateAgencyProfile,
  type Agency,
  type AgencySaleInput,
} from "@/lib/api";
import { clearAuthCookies, readToken } from "@/lib/auth";

const MIN_SALES = 5;

type SaleRow = { name: string; phone: string; email: string };

const inputCls =
  "mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "block text-sm font-medium text-brand-900";

function toRows(sales: AgencySaleInput[] | undefined): SaleRow[] {
  const rows: SaleRow[] = (sales ?? []).map((s) => ({
    name: s.name ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
  }));
  while (rows.length < MIN_SALES) rows.push({ name: "", phone: "", email: "" });
  return rows;
}

export default function AgencyOnboardingPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [tenDn, setTenDn] = useState("");
  const [maSoThue, setMaSoThue] = useState("");
  const [diaChi, setDiaChi] = useState("");
  const [ddplapLuat, setDdplapLuat] = useState("");
  const [brokerage, setBrokerage] = useState(false);
  const [gpkd, setGpkd] = useState("");
  const [sales, setSales] = useState<SaleRow[]>(toRows([]));

  function hydrate(a: Agency) {
    setAgency(a);
    setTenDn(a.business_info?.ten_dn ?? "");
    setMaSoThue(a.business_info?.ma_so_thue ?? "");
    setDiaChi(a.business_info?.dia_chi ?? "");
    setDdplapLuat(a.business_info?.nguoi_dai_dien_phap_luat ?? "");
    setBrokerage(Boolean(a.brokerage_declared));
    setGpkd(a.gpkd_so ?? "");
    setSales(toRows(a.sales));
  }

  useEffect(() => {
    const t = readToken();
    if (!t) {
      router.replace("/login?next=/agency-onboarding");
      return;
    }
    setToken(t);
    fetchAgencyMe(t)
      .then((a) => hydrate(a))
      .catch((err) =>
        setError((err as Error).message || "Không tải được hồ sơ đại lý."),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSale(idx: number, field: keyof SaleRow, value: string) {
    setSales((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );
  }
  function addSale() {
    setSales((prev) => [...prev, { name: "", phone: "", email: "" }]);
  }
  function removeSale(idx: number) {
    setSales((prev) =>
      prev.length <= MIN_SALES ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  function validSales(): AgencySaleInput[] {
    return sales
      .filter((s) => s.name.trim() && (s.phone.trim() || s.email.trim()))
      .map((s) => ({
        name: s.name.trim(),
        phone: s.phone.trim() || undefined,
        email: s.email.trim() || undefined,
      }));
  }

  async function save(): Promise<Agency | null> {
    if (!token) return null;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const updated = await updateAgencyProfile(token, {
        business_info: {
          ten_dn: tenDn.trim() || null,
          ma_so_thue: maSoThue.trim() || null,
          dia_chi: diaChi.trim() || null,
          nguoi_dai_dien_phap_luat: ddplapLuat.trim() || null,
        },
        brokerage_declared: brokerage,
        gpkd_so: gpkd.trim() || undefined,
        sales: validSales(),
      });
      hydrate(updated);
      setNotice("Đã lưu hồ sơ.");
      return updated;
    } catch (err) {
      setError((err as Error).message || "Lưu hồ sơ thất bại.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function submitReview() {
    if (!token) return;
    const updated = await save();
    if (!updated) return;
    if (!updated.eligible) {
      setError(
        "Chưa đủ điều kiện gửi duyệt. Vui lòng hoàn tất các mục còn thiếu bên dưới.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitAgencyForReview(token);
      hydrate(res);
      setNotice("Đã gửi hồ sơ. Đội ngũ Happy Home sẽ xem xét và phản hồi sớm.");
    } catch (err) {
      setError((err as Error).message || "Gửi duyệt thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    clearAuthCookies();
    router.replace("/login");
  }

  const validCount = validSales().length;
  const businessOk = Boolean(
    tenDn.trim() && maSoThue.trim() && diaChi.trim() && ddplapLuat.trim(),
  );
  const eligibleNow = businessOk && brokerage && validCount >= MIN_SALES;
  const isActive = agency?.status === "active";

  return (
    <div className="min-h-screen bg-[#fbf9f5]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              Happy Home
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide text-white">
                Khu quản trị sàn
              </div>
              <div className="text-[11px] uppercase tracking-widest text-brand-100">
                {agency?.ten_san ?? "Đại lý"}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <div className="rounded-2xl border border-brand-100 bg-white p-8 text-center text-sm text-brand-600">
            Đang tải hồ sơ…
          </div>
        ) : !agency ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {error ?? "Không tải được hồ sơ đại lý."}
            <div className="mt-4">
              <Link
                href="/login"
                className="font-medium text-brand-600 hover:underline"
              >
                Đăng nhập lại
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Trạng thái */}
            <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-brand-900 sm:text-2xl">
                    Chào mừng, {agency.ten_san}!
                  </h1>
                  <p className="mt-1 text-sm text-brand-700">
                    Hoàn tất hồ sơ điều kiện để trở thành đại lý F2 và mở khoá mức
                    hoa hồng 80%.
                  </p>
                </div>
                <StatusBadge status={agency.status} tier={agency.commission_tier} />
              </div>

              {isActive ? (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  Sàn của bạn đã được duyệt làm đại lý F2 — đang hưởng{" "}
                  <b>{agency.commission_pct ?? 80}% hoa hồng</b>
                  {agency.can_config_sale_commission
                    ? " và có quyền cấu hình hoa hồng cho đội sale."
                    : "."}
                </div>
              ) : agency.status === "rejected" ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Hồ sơ chưa được duyệt.
                  {agency.review_note ? ` Ghi chú: ${agency.review_note}` : ""} Vui
                  lòng cập nhật và gửi lại.
                </div>
              ) : agency.submitted_for_review ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Hồ sơ đã gửi duyệt — đang chờ Happy Home xem xét. Bạn vẫn có thể cập
                  nhật thông tin.
                </div>
              ) : null}

              {/* Tiến độ điều kiện */}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ProgressItem ok={businessOk} label="Thông tin doanh nghiệp" />
                <ProgressItem ok={brokerage} label="Cam kết môi giới BĐS" />
                <ProgressItem
                  ok={validCount >= MIN_SALES}
                  label={`Đội sale (${validCount}/${MIN_SALES})`}
                />
              </div>
            </section>

            {notice ? (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {/* 1. Thông tin doanh nghiệp */}
            <section className="mt-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-brand-900">
                1. Thông tin doanh nghiệp
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Tên doanh nghiệp / sàn</label>
                  <input
                    type="text"
                    value={tenDn}
                    onChange={(e) => setTenDn(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Mã số thuế</label>
                  <input
                    type="text"
                    value={maSoThue}
                    onChange={(e) => setMaSoThue(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Người đại diện pháp luật</label>
                  <input
                    type="text"
                    value={ddplapLuat}
                    onChange={(e) => setDdplapLuat(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Địa chỉ</label>
                  <input
                    type="text"
                    value={diaChi}
                    onChange={(e) => setDiaChi(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </section>

            {/* 2. Cam kết môi giới */}
            <section className="mt-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-brand-900">
                2. Thông báo hoạt động môi giới
              </h2>
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-brand-100 bg-[#fbf9f5] px-4 py-3">
                <input
                  type="checkbox"
                  checked={brokerage}
                  onChange={(e) => setBrokerage(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-brand-200 text-brand-500 focus:ring-brand-500"
                />
                <span className="text-sm text-brand-900">
                  Tôi xác nhận doanh nghiệp đã đăng ký / cam kết hoạt động môi giới
                  bất động sản theo quy định pháp luật.
                </span>
              </label>
              <div className="mt-4">
                <label className={labelCls}>
                  Số GPKD / số thông báo môi giới (tuỳ chọn)
                </label>
                <input
                  type="text"
                  value={gpkd}
                  onChange={(e) => setGpkd(e.target.value)}
                  className={inputCls}
                />
              </div>
            </section>

            {/* 3. Đội sale */}
            <section className="mt-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-brand-900">
                  3. Danh sách tài khoản sale
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    validCount >= MIN_SALES
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {validCount}/{MIN_SALES} hợp lệ
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-600">
                Cần tối thiểu {MIN_SALES} sale. Mỗi sale cần tên và SĐT hoặc email.
              </p>

              <div className="mt-4 space-y-3">
                {sales.map((s, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-2 rounded-xl border border-brand-100 bg-[#fbf9f5] p-3 sm:grid-cols-12 sm:items-center"
                  >
                    <div className="sm:col-span-1 sm:text-center">
                      <span className="text-xs font-semibold text-brand-500">
                        #{idx + 1}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => updateSale(idx, "name", e.target.value)}
                      placeholder="Họ tên sale"
                      className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:col-span-4"
                    />
                    <input
                      type="tel"
                      value={s.phone}
                      onChange={(e) => updateSale(idx, "phone", e.target.value)}
                      placeholder="SĐT"
                      className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:col-span-3"
                    />
                    <input
                      type="email"
                      value={s.email}
                      onChange={(e) => updateSale(idx, "email", e.target.value)}
                      placeholder="Email"
                      className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:col-span-3"
                    />
                    <div className="sm:col-span-1 sm:text-right">
                      <button
                        type="button"
                        onClick={() => removeSale(idx)}
                        disabled={sales.length <= MIN_SALES}
                        title="Xoá dòng"
                        className="rounded-lg px-2 py-1 text-sm font-medium text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addSale}
                className="mt-3 rounded-lg border border-dashed border-brand-300 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
              >
                + Thêm sale
              </button>
            </section>

            {/* Hành động */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={save}
                disabled={saving || submitting}
                className="flex-1 rounded-xl border border-brand-300 px-6 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Đang lưu…" : "Lưu hồ sơ"}
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={!eligibleNow || saving || submitting || isActive}
                className="flex-1 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Đang gửi…"
                  : isActive
                  ? "Đã là đại lý F2"
                  : "Gửi duyệt làm F2"}
              </button>
            </div>
            {!eligibleNow && !isActive ? (
              <p className="mt-2 text-center text-xs text-brand-600">
                Hoàn tất 3 mục điều kiện ở trên để bật nút gửi duyệt.
              </p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status, tier }: { status: string; tier: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Đang chờ duyệt", cls: "bg-amber-100 text-amber-700" },
    active: { label: "Đại lý F2 (80%)", cls: "bg-green-100 text-green-700" },
    rejected: { label: "Bị từ chối", cls: "bg-red-100 text-red-700" },
  };
  const info = map[status] ?? map.pending;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${info.cls}`}>
        {info.label}
      </span>
      <span className="text-[11px] text-brand-500">
        Mức hoa hồng: {tier === "f2_80" ? "F2 — 80%" : "Cơ bản"}
      </span>
    </div>
  );
}

function ProgressItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
        ok
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-brand-100 bg-[#fbf9f5] text-brand-700"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          ok ? "bg-green-500" : "bg-brand-200"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      {label}
    </div>
  );
}
