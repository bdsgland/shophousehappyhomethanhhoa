"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronRightSmall,
  Database,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Grid,
  Home,
  Map,
  MapPin,
  Newspaper,
  Share2,
  TrendingUp,
} from "@/components/dashboard/icons";
import {
  CONNECTIONS,
  DOCUMENTS,
  HERO_IMAGES,
  NEWS,
  OVERVIEW_ROWS,
  POLICIES,
  STATUS_FILTERS,
  SUBZONES,
  TIMELINE,
  TOURS_360,
  TRAININGS,
  UNITS,
  ZONE_FILTERS,
  type UnitStatus,
} from "@/components/dashboard/elc-data";

type ComponentType<P> = (props: P) => JSX.Element;

type Tab = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
};

const TABS: Tab[] = [
  { id: "tong-quan", label: "Tổng quan", icon: Home },
  { id: "vi-tri", label: "Vị trí", icon: MapPin },
  { id: "dao-tao", label: "Đào tạo", icon: GraduationCap },
  { id: "phan-khu", label: "Phân khu", icon: Grid },
  { id: "mat-bang", label: "Mặt bằng quỹ căn", icon: Map },
  { id: "quy-can", label: "Quỹ căn", icon: Database },
  { id: "anh-360", label: "Ảnh 360°", icon: Camera },
  { id: "chinh-sach", label: "Chính sách bán hàng", icon: FileText },
  { id: "tien-do", label: "Tiến độ", icon: TrendingUp },
  { id: "tai-lieu", label: "Tài liệu", icon: BookOpen },
  { id: "tin-tuc", label: "Tin tức", icon: Newspaper },
];

const ACCENT = "#F59E0B"; // cam SalePro

export function ProjectDetailDashboard() {
  const [activeTab, setActiveTab] = useState("tong-quan");
  const [shareMsg, setShareMsg] = useState(false);

  function onShare() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(typeof window !== "undefined" ? window.location.href : "")
        .catch(() => {});
    }
    setShareMsg(true);
    setTimeout(() => setShareMsg(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-brand-700">
        <Link href="/" className="hover:text-brand-600">
          Trang chủ
        </Link>
        <ChevronRightSmall size={14} />
        <span className="font-medium text-brand-900">Chi tiết dự án</span>
      </nav>

      {/* Header card */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-amber-50 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Đang mở bán
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">
              EUROWINDOW LIGHT CITY
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-brand-700">
              Theo dõi thông tin chi tiết và bảng giá, quỹ căn, mặt bằng, tiến độ
              và chính sách bán hàng dự án EUROWINDOW LIGHT CITY.
            </p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-900 shadow-sm transition hover:border-brand-500 hover:text-brand-600"
            >
              <Share2 size={16} />
              Chia sẻ
            </button>
            {shareMsg && (
              <span className="absolute right-0 top-full mt-1 whitespace-nowrap rounded bg-brand-900 px-2 py-1 text-xs text-white">
                Đã sao chép liên kết
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs nav (sticky, scroll ngang trên mobile) */}
      <div className="sticky top-[57px] z-20 -mx-6 border-b border-brand-100 bg-[#fbf9f5]/95 px-6 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const active = t.id === activeTab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
                  active
                    ? "font-semibold"
                    : "border-transparent font-medium text-brand-700 hover:text-brand-900"
                }`}
                style={
                  active
                    ? { borderColor: ACCENT, color: ACCENT }
                    : undefined
                }
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === "tong-quan" && <OverviewTab />}
        {activeTab === "vi-tri" && <LocationTab />}
        {activeTab === "dao-tao" && <TrainingTab />}
        {activeTab === "phan-khu" && <SubzonesTab />}
        {activeTab === "mat-bang" && <UnitsTab focusAvailable={false} />}
        {activeTab === "quy-can" && <UnitsTab focusAvailable />}
        {activeTab === "anh-360" && <Tours360Tab />}
        {activeTab === "chinh-sach" && <PolicyTab />}
        {activeTab === "tien-do" && <TimelineTab />}
        {activeTab === "tai-lieu" && <DocumentsTab />}
        {activeTab === "tin-tuc" && <NewsTab />}
      </div>
    </div>
  );
}

// ---------- helpers ----------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold uppercase tracking-wide text-brand-900">
      {children}
    </h2>
  );
}

function statusBadge(status: UnitStatus) {
  const map: Record<UnitStatus, string> = {
    "Còn hàng": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Đặt cọc": "bg-amber-50 text-amber-700 border-amber-200",
    "Đã bán": "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {status}
    </span>
  );
}

// ---------- 1. Tổng quan ----------

function OverviewTab() {
  const [idx, setIdx] = useState(0);
  const total = HERO_IMAGES.length;
  const go = (d: number) => setIdx((i) => (i + d + total) % total);

  return (
    <div className="space-y-6">
      {/* Carousel 16:9 */}
      <div className="relative aspect-video overflow-hidden rounded-xl border border-brand-100 bg-brand-900 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGES[idx].src}
          alt={HERO_IMAGES[idx].caption}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
          <p className="text-sm font-medium text-white">
            {HERO_IMAGES[idx].caption}
          </p>
        </div>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Ảnh trước"
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-brand-900 shadow hover:bg-white"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Ảnh sau"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-brand-900 shadow hover:bg-white"
        >
          <ChevronRight size={20} />
        </button>
        <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
          {idx + 1}/{total}
        </div>
      </div>
      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {HERO_IMAGES.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => setIdx(i)}
            className={`h-14 w-24 shrink-0 overflow-hidden rounded-md border-2 transition ${
              i === idx ? "" : "border-transparent opacity-70 hover:opacity-100"
            }`}
            style={i === idx ? { borderColor: ACCENT } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.caption}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Bảng tổng quan */}
      <div className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
        <div className="border-b border-brand-100 bg-brand-50 px-5 py-3">
          <SectionTitle>Tổng quan dự án</SectionTitle>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {OVERVIEW_ROWS.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 ? "bg-white" : "bg-brand-50/40"}
              >
                <td className="w-1/3 border-b border-brand-100 px-5 py-3 font-semibold text-brand-900 align-top">
                  {row.label}
                </td>
                <td className="border-b border-brand-100 px-5 py-3 text-brand-700">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- 2. Vị trí ----------

function LocationTab() {
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Vị trí đắc địa</SectionTitle>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-brand-700">
          Eurowindow Light City toạ lạc tại phường Nguyệt Viên, TP Thanh Hoá —
          ngay cửa ngõ phía Bắc thành phố, liền kề Quốc lộ 1A và cầu Hoằng Long.
          Vị trí kết nối thuận tiện tới trung tâm hành chính, trường học, bệnh
          viện và hệ thống thương mại dịch vụ, mang đến giá trị an cư và đầu tư
          bền vững bên dòng sông Mã.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Kết nối nhanh */}
        <div className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 text-sm font-bold uppercase tracking-wide text-brand-900">
            Kết nối nhanh
          </div>
          <ul>
            {CONNECTIONS.map((c) => (
              <li
                key={c.place}
                className="flex items-center justify-between border-b border-brand-100 px-5 py-3 text-sm last:border-b-0"
              >
                <span className="flex items-center gap-2 text-brand-900">
                  <MapPin size={16} />
                  {c.place}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {c.time}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Google Maps embed */}
        <div className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
          <iframe
            title="Bản đồ Eurowindow Light City"
            src="https://www.google.com/maps?q=Nguy%E1%BB%87t+Vi%C3%AAn,+Thanh+H%C3%B3a&output=embed"
            className="h-full min-h-[300px] w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  );
}

// ---------- 3. Đào tạo ----------

function TrainingTab() {
  return (
    <div className="space-y-4">
      <SectionTitle>Tài liệu đào tạo</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TRAININGS.map((t) => (
          <div
            key={t.title}
            className="flex flex-col rounded-xl border border-brand-100 bg-white p-5 shadow-sm"
          >
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <GraduationCap size={22} />
            </div>
            <h3 className="font-semibold text-brand-900">{t.title}</h3>
            <p className="mt-1 text-xs text-brand-700">
              {t.size} · {t.date}
            </p>
            <div className="mt-4 flex gap-2">
              <a
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-100 px-3 py-2 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
              >
                <Eye size={15} /> Xem
              </a>
              <a
                href={t.href}
                download
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: ACCENT }}
              >
                <Download size={15} /> Tải xuống
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs italic text-brand-700">
        * Liên kết tài liệu sẽ được kích hoạt khi backend phục vụ file đào tạo.
      </p>
    </div>
  );
}

// ---------- 4. Phân khu ----------

function SubzonesTab() {
  return (
    <div className="space-y-4">
      <SectionTitle>7 phân khu</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SUBZONES.map((z) => (
          <div
            key={z.name}
            className="group overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="aspect-[4/3] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={z.img}
                alt={z.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            </div>
            <div className="p-4">
              <h3 className="text-base font-bold text-brand-900">
                Phân khu {z.name}
              </h3>
              <p className="mt-0.5 text-sm text-brand-700">{z.style}</p>
              <p className="mt-1 text-xs font-medium text-brand-600">
                {z.units}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
                style={{ color: ACCENT }}
              >
                Xem chi tiết <ChevronRightSmall size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 5 & 6. Mặt bằng quỹ căn / Quỹ căn ----------

function UnitsTab({ focusAvailable }: { focusAvailable: boolean }) {
  const [zone, setZone] = useState<string>("Tất cả");
  const [status, setStatus] = useState<string>(
    focusAvailable ? "Còn hàng" : "Tất cả",
  );

  const rows = useMemo(() => {
    return UNITS.filter((u) => {
      if (zone !== "Tất cả" && u.zone !== zone) return false;
      if (status !== "Tất cả" && u.status !== status) return false;
      return true;
    });
  }, [zone, status]);

  const stats = useMemo(() => {
    const total = UNITS.length;
    const available = UNITS.filter((u) => u.status === "Còn hàng").length;
    const sold = UNITS.filter((u) => u.status === "Đã bán").length;
    const deposit = UNITS.filter((u) => u.status === "Đặt cọc").length;
    return { total, available, sold, deposit };
  }, []);

  return (
    <div className="space-y-5">
      <SectionTitle>
        {focusAvailable ? "Danh sách quỹ căn" : "Mặt bằng quỹ căn"}
      </SectionTitle>

      {focusAvailable && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Tổng căn" value="5.262" tone="brand" />
          <StatCard
            label="Còn quỹ"
            value={String(stats.available)}
            tone="emerald"
          />
          <StatCard label="Đã bán" value={String(stats.sold)} tone="rose" />
          <StatCard
            label="Đặt cọc"
            value={String(stats.deposit)}
            tone="amber"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Phân khu"
          value={zone}
          onChange={setZone}
          options={[...ZONE_FILTERS]}
        />
        <FilterSelect
          label="Trạng thái"
          value={status}
          onChange={setStatus}
          options={[...STATUS_FILTERS]}
        />
        <span className="ml-auto text-sm text-brand-700">
          {rows.length} căn
        </span>
      </div>

      {/* Bảng */}
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-brand-50 text-left text-xs font-bold uppercase tracking-wide text-brand-900">
              <th className="px-4 py-3">Mã lô</th>
              <th className="px-4 py-3">Phân khu</th>
              <th className="px-4 py-3">Diện tích</th>
              <th className="px-4 py-3">Mặt tiền</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Giá dự kiến</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => (
              <tr
                key={u.code}
                className={`border-t border-brand-100 ${
                  i % 2 ? "bg-white" : "bg-brand-50/30"
                }`}
              >
                <td className="px-4 py-3 font-semibold text-brand-900">
                  {u.code}
                </td>
                <td className="px-4 py-3 text-brand-700">{u.zone}</td>
                <td className="px-4 py-3 text-brand-700">{u.area} m²</td>
                <td className="px-4 py-3 text-brand-700">{u.facade} m</td>
                <td className="px-4 py-3">{statusBadge(u.status)}</td>
                <td className="px-4 py-3 font-semibold text-brand-900">
                  {u.price}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-brand-700"
                >
                  Không có căn phù hợp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs italic text-brand-700">
        * Số liệu demo — cập nhật từ chủ đầu tư.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "emerald" | "rose" | "amber";
}) {
  const tones: Record<string, string> = {
    brand: "from-brand-500 to-brand-600",
    emerald: "from-emerald-500 to-emerald-600",
    rose: "from-rose-500 to-rose-600",
    amber: "from-amber-400 to-amber-500",
  };
  return (
    <div
      className={`rounded-xl bg-gradient-to-br ${tones[tone]} p-4 text-white shadow-sm`}
    >
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="mt-0.5 text-xs font-medium opacity-90">{label}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-brand-700">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------- 7. Ảnh 360° ----------

function Tours360Tab() {
  return (
    <div className="space-y-4">
      <SectionTitle>Trải nghiệm ảnh 360°</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TOURS_360.map((t) => (
          <div
            key={t.title}
            className="group overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm"
          >
            <div className="relative aspect-video overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.img}
                alt={t.title}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                <span
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Camera size={16} /> Xem 360°
                </span>
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                360°
              </span>
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-brand-900">{t.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 8. Chính sách bán hàng ----------

function PolicyTab() {
  return (
    <div className="space-y-4">
      <SectionTitle>Chính sách bán hàng</SectionTitle>
      <div className="space-y-4">
        {POLICIES.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-bold text-brand-900">{p.title}</h3>
              <span className="text-xs font-medium text-brand-600">
                {p.date}
              </span>
            </div>
            <p className="mt-2 text-sm text-brand-700">{p.summary}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {p.highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-start gap-2 text-sm text-brand-900"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <Check size={13} />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600"
            >
              <FileText size={15} /> Xem chi tiết (PDF)
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 9. Tiến độ ----------

function TimelineTab() {
  return (
    <div className="space-y-4">
      <SectionTitle>Tiến độ dự án</SectionTitle>
      <ol className="relative ml-3 border-l-2 border-brand-100">
        {TIMELINE.map((m) => (
          <li key={m.period} className="mb-8 ml-6 last:mb-0">
            <span
              className="absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-[#fbf9f5]"
              style={{ backgroundColor: ACCENT }}
            />
            <div className="flex flex-col gap-4 rounded-xl border border-brand-100 bg-white p-4 shadow-sm sm:flex-row">
              <div className="h-32 w-full shrink-0 overflow-hidden rounded-lg sm:w-48">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.img}
                  alt={m.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <span
                  className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {m.period}
                </span>
                <h3 className="mt-2 text-base font-bold text-brand-900">
                  {m.title}
                </h3>
                <p className="mt-1 text-sm text-brand-700">{m.desc}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs italic text-brand-700">
        * Mốc tiến độ mang tính minh hoạ — cập nhật từ chủ đầu tư.
      </p>
    </div>
  );
}

// ---------- 10. Tài liệu ----------

function DocumentsTab() {
  return (
    <div className="space-y-4">
      <SectionTitle>Tài liệu dự án</SectionTitle>
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-brand-50 text-left text-xs font-bold uppercase tracking-wide text-brand-900">
              <th className="px-4 py-3">Tên tài liệu</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Kích thước</th>
              <th className="px-4 py-3">Ngày cập nhật</th>
              <th className="px-4 py-3 text-right">Tải xuống</th>
            </tr>
          </thead>
          <tbody>
            {DOCUMENTS.map((d, i) => (
              <tr
                key={d.name}
                className={`border-t border-brand-100 ${
                  i % 2 ? "bg-white" : "bg-brand-50/30"
                }`}
              >
                <td className="px-4 py-3 font-medium text-brand-900">
                  <span className="flex items-center gap-2">
                    <FileText size={16} /> {d.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-brand-700">{d.type}</td>
                <td className="px-4 py-3 text-brand-700">{d.size}</td>
                <td className="px-4 py-3 text-brand-700">{d.date}</td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={d.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <Download size={15} /> Tải
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- 11. Tin tức ----------

function NewsTab() {
  return (
    <div className="space-y-4">
      <SectionTitle>Tin tức dự án</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {NEWS.map((n) => (
          <article
            key={n.title}
            className="group flex flex-col overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="aspect-video overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={n.img}
                alt={n.title}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <span className="text-xs font-medium text-brand-600">
                {n.date}
              </span>
              <h3 className="mt-1 font-bold leading-snug text-brand-900">
                {n.title}
              </h3>
              <p className="mt-2 flex-1 text-sm text-brand-700">{n.excerpt}</p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold"
                style={{ color: ACCENT }}
              >
                Đọc tiếp <ChevronRightSmall size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
