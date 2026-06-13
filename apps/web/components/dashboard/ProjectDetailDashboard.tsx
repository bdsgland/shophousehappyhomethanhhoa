"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BookingButton } from "@/components/BookingButton";
import { ChatWidget } from "@/components/ChatWidget";
import {
  getDashboardUrl,
  isExternalUrl,
  readToken,
  readUserFromCookie,
} from "@/lib/auth";

// Leaflet chỉ chạy ở client → tắt SSR.
const MasterPlanMap = dynamic(
  () => import("@/components/dashboard/MasterPlanMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-sm text-brand-700 lg:h-[560px]">
        Đang tải mặt bằng…
      </div>
    ),
  },
);
import {
  BookOpen,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronRightSmall,
  ClipboardList,
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
  MAP_LAT,
  MAP_LNG,
  NEWS,
  OVERVIEW_ROWS,
  POLICIES,
  PRICE_TABLE,
  FUND_FILTERS,
  STATUS_FILTERS,
  SUBZONES,
  TIMELINE,
  TOURS_360,
  TRAININGS,
  UNITS,
  ZONE_FILTERS,
} from "@/components/dashboard/elc-data";
import {
  fetchInventory,
  fetchInventoryStats,
  fetchProject,
  fetchProjectDocuments,
  downloadProjectDocument,
  viewProjectDocument,
  type InventoryStats,
  type ProjectContent,
  type ProjectDocument,
  type ProjectConnection,
  type ProjectHeroImage,
  type ProjectKeyValue,
  type ProjectNewsItem,
  type ProjectPolicyCard,
  type ProjectPriceRow,
  type ProjectSubzone,
  type ProjectTimelineItem,
  type ProjectTour360,
  type ProjectTrainingItem,
} from "@/lib/api";

// Mô tả Vị trí + ghi chú hoa hồng mặc định (fallback khi store/elc trống).
const DEFAULT_LOCATION_DESC =
  "Eurowindow Light City toạ lạc tại phường Nguyệt Viên, TP Thanh Hoá — ngay cửa ngõ phía Bắc thành phố, liền kề Quốc lộ 1A và cầu Hoằng Long. Vị trí kết nối thuận tiện tới trung tâm hành chính, trường học, bệnh viện và hệ thống thương mại dịch vụ, mang đến giá trị an cư và đầu tư bền vững bên dòng sông Mã.";
const DEFAULT_COMMISSION_NOTE =
  "Mức hoa hồng cạnh tranh kèm thưởng nóng theo căn cho đại lý F1. Chi tiết theo phụ lục hợp đồng phân phối từng đợt — đang cập nhật.";
const DEFAULT_TAGLINE =
  "Theo dõi thông tin chi tiết và bảng giá, quỹ căn, mặt bằng, tiến độ và chính sách bán hàng dự án EUROWINDOW LIGHT CITY.";

const DEFAULT_PROJECT_SLUG = "eurowindow-light-city";

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

export function ProjectDetailDashboard({
  slug = DEFAULT_PROJECT_SLUG,
}: {
  slug?: string;
} = {}) {
  const [activeTab, setActiveTab] = useState("tong-quan");
  const [shareMsg, setShareMsg] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  // Nội dung dự án từ CMS (project_store). null = chưa có/lỗi → fallback elc-data.
  const [content, setContent] = useState<ProjectContent | null>(null);
  const [meta, setMeta] = useState<{
    name: string;
    tagline: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    setRole(readUserFromCookie()?.role ?? null);
  }, []);

  // Đọc nội dung biên tập (admin sửa → đồng bộ). Lỗi → giữ null để fallback.
  useEffect(() => {
    let alive = true;
    fetchProject(slug).then((p) => {
      if (!alive || !p) return;
      setContent(p.content);
      setMeta({ name: p.name, tagline: p.tagline, status: p.status });
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Resolve từng section: ưu tiên CMS, rỗng → fallback elc-data tĩnh.
  const heroImages: ProjectHeroImage[] = content?.overview.hero_images?.length
    ? content.overview.hero_images
    : HERO_IMAGES;
  const overviewRows: ProjectKeyValue[] = content?.overview.rows?.length
    ? content.overview.rows
    : OVERVIEW_ROWS;
  const locationDesc = content?.location.description || DEFAULT_LOCATION_DESC;
  const connections: ProjectConnection[] = content?.location.connections?.length
    ? content.location.connections
    : CONNECTIONS;
  const mapLat = content?.location.map_lat ?? MAP_LAT;
  const mapLng = content?.location.map_lng ?? MAP_LNG;
  const trainings: ProjectTrainingItem[] = content?.training.items?.length
    ? content.training.items
    : TRAININGS;
  const subzones: ProjectSubzone[] = content?.subzones.items?.length
    ? content.subzones.items
    : SUBZONES;
  const tours360: ProjectTour360[] = content?.gallery360.items?.length
    ? content.gallery360.items
    : TOURS_360;
  const policies: ProjectPolicyCard[] = content?.policy.policies?.length
    ? content.policy.policies
    : POLICIES;
  const priceTable: ProjectPriceRow[] = content?.policy.price_table?.length
    ? content.policy.price_table
    : PRICE_TABLE;
  const commissionNote =
    content?.policy.commission_note || DEFAULT_COMMISSION_NOTE;
  const timeline: ProjectTimelineItem[] = content?.timeline.items?.length
    ? content.timeline.items
    : TIMELINE;
  const news: ProjectNewsItem[] = content?.news.items?.length
    ? content.news.items
    : NEWS;
  const projectName = meta?.name || "EUROWINDOW LIGHT CITY";
  const projectTagline = meta?.tagline || DEFAULT_TAGLINE;
  const projectStatus = meta?.status || "Đang mở bán";

  // "Về dashboard" theo vai trò (admin → app Admin external).
  const dashboardUrl = getDashboardUrl(role);
  const dashboardExternal = isExternalUrl(dashboardUrl);

  // Nút hành động nổi theo vai trò.
  const fab =
    role === "sale"
      ? { href: "/agent/crm", label: "Mở CRM", Icon: ClipboardList }
      : role === "client"
      ? { href: "/client/booking/new", label: "Đặt lịch xem nhà", Icon: Calendar }
      : null;

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
    <>
    <div className="space-y-6">
      {/* Về dashboard theo vai trò */}
      {dashboardExternal ? (
        <a
          href={dashboardUrl}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          <ChevronLeft size={16} />
          Về dashboard
        </a>
      ) : (
        <Link
          href={dashboardUrl}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          <ChevronLeft size={16} />
          Về dashboard
        </Link>
      )}

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
              {projectStatus}
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">
              {projectName}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-brand-700">
              {projectTagline}
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
        {activeTab === "tong-quan" && (
          <OverviewTab images={heroImages} rows={overviewRows} />
        )}
        {activeTab === "vi-tri" && (
          <LocationTab
            description={locationDesc}
            connections={connections}
            mapLat={mapLat}
            mapLng={mapLng}
          />
        )}
        {activeTab === "dao-tao" && <TrainingTab items={trainings} />}
        {activeTab === "phan-khu" && <SubzonesTab items={subzones} />}
        {activeTab === "mat-bang" && (
          <UnitsTab focusAvailable={false} withMap />
        )}
        {activeTab === "quy-can" && <UnitsTab focusAvailable />}
        {activeTab === "anh-360" && <Tours360Tab items={tours360} />}
        {activeTab === "chinh-sach" && (
          <PolicyTab
            policies={policies}
            priceTable={priceTable}
            commissionNote={commissionNote}
          />
        )}
        {activeTab === "tien-do" && <TimelineTab items={timeline} />}
        {activeTab === "tai-lieu" && <DocumentsTab slug={slug} />}
        {activeTab === "tin-tuc" && <NewsTab items={news} />}
      </div>
    </div>
    {/* Nút hành động nổi theo vai trò (góc dưới-trái, tránh ChatWidget bên phải) */}
    {fab && (
      <Link
        href={fab.href}
        className="fixed bottom-5 left-5 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl"
      >
        <fab.Icon size={18} />
        <span className="hidden sm:inline">{fab.label}</span>
      </Link>
    )}
    {/* Chatbot tư vấn nổi — giúp sale hỏi nhanh ngay trong dashboard */}
    <ChatWidget />
    </>
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

function statusBadge(status: string) {
  const map: Record<string, string> = {
    "Còn hàng": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Đặt cọc": "bg-amber-50 text-amber-700 border-amber-200",
    "Đã bán": "bg-rose-50 text-rose-700 border-rose-200",
  };
  const cls = map[status] ?? "bg-brand-50 text-brand-700 border-brand-100";
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

// ---------- 1. Tổng quan ----------

function OverviewTab({
  images,
  rows,
}: {
  images: ProjectHeroImage[];
  rows: ProjectKeyValue[];
}) {
  const [idx, setIdx] = useState(0);
  const total = images.length;
  const go = (d: number) => setIdx((i) => (i + d + total) % total);
  // Bảo vệ: nếu đổi nguồn dữ liệu khiến idx vượt mảng → kẹp về 0.
  const safeIdx = idx < total ? idx : 0;

  return (
    <div className="space-y-6">
      {/* Carousel 16:9 */}
      <div className="relative aspect-video overflow-hidden rounded-xl border border-brand-100 bg-brand-900 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[safeIdx]?.src}
          alt={images[safeIdx]?.caption}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
          <p className="text-sm font-medium text-white">
            {images[safeIdx]?.caption}
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
          {safeIdx + 1}/{total}
        </div>
      </div>
      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((img, i) => (
          <button
            key={`${img.src}-${i}`}
            type="button"
            onClick={() => setIdx(i)}
            className={`h-14 w-24 shrink-0 overflow-hidden rounded-md border-2 transition ${
              i === safeIdx ? "" : "border-transparent opacity-70 hover:opacity-100"
            }`}
            style={i === safeIdx ? { borderColor: ACCENT } : undefined}
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
            {rows.map((row, i) => (
              <tr
                key={`${row.label}-${i}`}
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

function LocationTab({
  description,
  connections,
  mapLat,
  mapLng,
}: {
  description: string;
  connections: ProjectConnection[];
  mapLat: number;
  mapLng: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Vị trí đắc địa</SectionTitle>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-brand-700">
          {description}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Kết nối nhanh */}
        <div className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 text-sm font-bold uppercase tracking-wide text-brand-900">
            Kết nối nhanh
          </div>
          <ul>
            {connections.map((c) => (
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

        {/* Google Maps embed — toạ độ thật Nguyệt Viên, TP Thanh Hoá */}
        <div className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
          <iframe
            title="Bản đồ Eurowindow Light City"
            src={`https://www.google.com/maps?q=${mapLat},${mapLng}&z=15&output=embed`}
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

function TrainingTab({ items }: { items: ProjectTrainingItem[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Tài liệu đào tạo</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
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
              {t.ready ? (
                <>
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
                </>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
                >
                  Đang cập nhật
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs italic text-brand-700">
        * Tài liệu đào tạo sẽ được kích hoạt khi chủ đầu tư cung cấp file chính
        thức.
      </p>
    </div>
  );
}

// ---------- 4. Phân khu ----------

function SubzonesTab({ items }: { items: ProjectSubzone[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle>{items.length} phân khu</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((z) => (
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-brand-900">
                  Phân khu {z.name}
                </h3>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {z.units}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-brand-600">
                {z.style}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-brand-700">
                {z.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 5 & 6. Mặt bằng quỹ căn / Quỹ căn ----------

type Row = {
  code: string;
  zone: string;
  area: number;
  facade: number;
  status: string;
  price: string;
  type?: string;
  has_price?: boolean; // false = chưa có giá chi tiết → hiện "Báo giá"
  position?: { x: number; y: number };
};

function localFallback(zone: string, status: string): Row[] {
  return UNITS.filter((u) => {
    if (zone !== "Tất cả" && u.zone !== zone) return false;
    if (status !== "Tất cả" && u.status !== status) return false;
    return true;
  });
}

function UnitsTab({
  focusAvailable,
  withMap = false,
}: {
  focusAvailable: boolean;
  withMap?: boolean;
}) {
  const [zone, setZone] = useState<string>("Tất cả");
  const [status, setStatus] = useState<string>(
    focusAvailable ? "Còn hàng" : "Tất cả",
  );
  const [fund, setFund] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState(true);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    setIsAdmin(readUserFromCookie()?.role === "admin");
  }, []);

  // Thống kê — lấy 1 lần khi mount.
  useEffect(() => {
    let alive = true;
    fetchInventoryStats().then((s) => {
      if (alive && s) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Danh sách căn — fetch lại mỗi khi đổi bộ lọc, fallback demo nếu API lỗi.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    fetchInventory({ phankhu: zone, status, quy: fund, signal: controller.signal })
      .then((data) => {
        if (!alive) return;
        if (data) {
          setRows(data);
          setApiOk(true);
        } else {
          setRows(localFallback(zone, status));
          setApiOk(false);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [zone, status, fund]);

  // Số liệu thẻ thống kê: ưu tiên API, nếu không có thì tính từ fallback.
  const fallbackStats = useMemo(() => {
    const all = UNITS;
    return {
      total: all.length,
      available: all.filter((u) => u.status === "Còn hàng").length,
      sold: all.filter((u) => u.status === "Đã bán").length,
      reserved: all.filter((u) => u.status === "Đặt cọc").length,
    } as InventoryStats;
  }, []);
  const shownStats = stats ?? fallbackStats;

  const filtersBar = (
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
      <label className="flex flex-col gap-1 text-xs font-medium text-brand-700">
        Quỹ
        <select
          value={fund}
          onChange={(e) => setFund(e.target.value)}
          className="rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 focus:border-brand-500 focus:outline-none"
        >
          {FUND_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <span className="ml-auto text-sm text-brand-700">
        {loading ? "Đang tải…" : `${rows.length} căn`}
      </span>
    </div>
  );

  const table = (
    <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="bg-brand-50 text-left text-xs font-bold uppercase tracking-wide text-brand-900">
            <th className="px-4 py-3">Mã lô</th>
            <th className="px-4 py-3">Phân khu</th>
            <th className="px-4 py-3">Diện tích</th>
            <th className="px-4 py-3">Mặt tiền</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3">Giá dự kiến</th>
            <th className="px-4 py-3 text-right">Đặt lịch</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-sm text-brand-700"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
                  Đang tải dữ liệu quỹ căn…
                </span>
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((u, i) => (
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
                  {u.has_price === false ? (
                    <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                      Báo giá
                    </span>
                  ) : (
                    u.price
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.status !== "Đã bán" && (
                    <BookingButton
                      unitId={u.code}
                      unitName={u.code}
                      variant="compact"
                    />
                  )}
                </td>
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-sm text-brand-700"
              >
                Không có căn phù hợp bộ lọc.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>
          {focusAvailable ? "Danh sách quỹ căn" : "Mặt bằng quỹ căn"}
        </SectionTitle>
        {withMap && isAdmin && (
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              editMode
                ? "border-transparent bg-emerald-500 text-white hover:bg-emerald-600"
                : "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400"
            }`}
          >
            {editMode ? "✓ Xong chỉnh sửa" : "✎ Chỉnh sửa mặt bằng"}
          </button>
        )}
      </div>

      {!apiOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Không kết nối được hệ thống quỹ căn — đang hiển thị dữ liệu demo.
        </div>
      )}

      {focusAvailable && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Tổng căn"
            value={String(shownStats.total)}
            tone="brand"
          />
          <StatCard
            label="Còn quỹ"
            value={String(shownStats.available)}
            tone="emerald"
          />
          <StatCard label="Đã bán" value={String(shownStats.sold)} tone="rose" />
          <StatCard
            label="Đặt cọc"
            value={String(shownStats.reserved)}
            tone="amber"
          />
        </div>
      )}

      {withMap ? (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* Cột trái: mặt bằng interactive (60%) */}
          <div className="space-y-3 lg:col-span-3">
            <MasterPlanMap units={rows} editable={editMode} />
            <div className="flex flex-wrap items-center gap-4 text-xs text-brand-700">
              <LegendDot color="#10b981" label="Còn hàng" />
              <LegendDot color="#f59e0b" label="Đặt cọc" />
              <LegendDot color="#ef4444" label="Đã bán" />
              <span className="ml-auto italic">
                Click marker để xem thông tin căn
              </span>
            </div>
            {editMode && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Chế độ chỉnh sửa: kéo marker để gắn lại vị trí căn trên mặt bằng.
                (Vị trí mới lưu tạm — chưa đồng bộ backend.)
              </div>
            )}
          </div>
          {/* Cột phải: filter + bảng (40%) */}
          <div className="space-y-3 lg:col-span-2">
            {filtersBar}
            {table}
          </div>
        </div>
      ) : (
        <>
          {filtersBar}
          {table}
        </>
      )}

      <p className="text-xs italic text-brand-700">
        * Dữ liệu quỹ căn cung cấp qua hệ thống Agent Engine — số liệu minh hoạ,
        chốt căn vui lòng xác nhận với chủ đầu tư.
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full border border-white shadow"
        style={{ background: color }}
      />
      {label}
    </span>
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

function Tours360Tab({ items }: { items: ProjectTour360[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Trải nghiệm ảnh 360°</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
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
                <span className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-brand-900">
                  <Camera size={16} /> Đang cập nhật
                </span>
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                360°
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 p-4">
              <p className="text-sm font-medium text-brand-900">{t.title}</p>
              {!t.ready && (
                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                  Đang cập nhật
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 8. Chính sách bán hàng ----------

function PolicyTab({
  policies,
  priceTable,
  commissionNote,
}: {
  policies: ProjectPolicyCard[];
  priceTable: ProjectPriceRow[];
  commissionNote: string;
}) {
  return (
    <div className="space-y-6">
      <SectionTitle>Chính sách bán hàng</SectionTitle>
      <div className="space-y-4">
        {policies.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-brand-900">
                  {p.title}
                </h3>
                {p.open && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: ACCENT }}
                  >
                    Đang mở
                  </span>
                )}
              </div>
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
          </div>
        ))}
      </div>

      {/* Bảng giá tham khảo */}
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 text-sm font-bold uppercase tracking-wide text-brand-900">
          Bảng giá tham khảo
        </div>
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-brand-700">
              <th className="px-5 py-2.5">Loại sản phẩm</th>
              <th className="px-5 py-2.5">Diện tích</th>
              <th className="px-5 py-2.5">Giá từ</th>
            </tr>
          </thead>
          <tbody>
            {priceTable.map((r, i) => (
              <tr
                key={`${r.product}-${i}`}
                className={`border-t border-brand-100 ${
                  i % 2 ? "bg-white" : "bg-brand-50/30"
                }`}
              >
                <td className="px-5 py-3 font-semibold text-brand-900">
                  {r.product}
                </td>
                <td className="px-5 py-3 text-brand-700">{r.area}</td>
                <td className="px-5 py-3 font-semibold" style={{ color: ACCENT }}>
                  {r.from}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-brand-100 px-5 py-2.5 text-xs italic text-brand-700">
          * Giá tham khảo từ tin tức thị trường, chưa bao gồm VAT và phí. Bảng
          giá chính thức theo từng đợt mở bán.
        </p>
      </div>

      {/* Hoa hồng cho sale */}
      <div className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-brand-900">
          Chính sách hoa hồng cho sale / đại lý
        </h3>
        <p className="mt-2 text-sm text-brand-700">{commissionNote}</p>
      </div>
    </div>
  );
}

// ---------- 9. Tiến độ ----------

function TimelineTab({ items }: { items: ProjectTimelineItem[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Tiến độ dự án</SectionTitle>
      <ol className="relative ml-3 border-l-2 border-brand-100">
        {items.map((m, i) => (
          <li key={`${m.period}-${i}`} className="mb-8 ml-6 last:mb-0">
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

function fmtDocSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtDocDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function DocumentsTab({ slug }: { slug: string }) {
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const token = readToken() ?? undefined;
    fetchProjectDocuments(slug, token)
      .then((res) => {
        if (alive) setDocs(res);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const handleDownload = async (doc: ProjectDocument) => {
    setErr(null);
    setDownloading(doc.id);
    try {
      await downloadProjectDocument(doc, readToken() ?? undefined);
    } catch (e) {
      setErr((e as Error).message || "Tải tài liệu thất bại — thử lại sau.");
    } finally {
      setDownloading(null);
    }
  };

  const handleView = async (doc: ProjectDocument) => {
    setErr(null);
    setViewing(doc.id);
    try {
      await viewProjectDocument(doc, readToken() ?? undefined);
    } catch (e) {
      setErr((e as Error).message || "Mở tài liệu thất bại — thử lại sau.");
    } finally {
      setViewing(null);
    }
  };

  // Tài liệu đồng bộ từ Drive (nếu có) → hiển thị; nếu chưa có/đang lỗi → fallback
  // danh sách tĩnh DOCUMENTS để trang không bị trống.
  const synced = docs ?? [];
  const useSynced = synced.length > 0;

  return (
    <div className="space-y-4">
      <SectionTitle>Tài liệu dự án</SectionTitle>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-brand-100 bg-white px-4 py-10 text-center text-sm text-brand-700 shadow-sm">
          Đang tải tài liệu…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-brand-50 text-left text-xs font-bold uppercase tracking-wide text-brand-900">
                <th className="px-4 py-3">Tên tài liệu</th>
                {useSynced && <th className="px-4 py-3">Nhóm</th>}
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Kích thước</th>
                <th className="px-4 py-3">Ngày cập nhật</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {useSynced
                ? synced.map((d, i) => (
                    <tr
                      key={d.id}
                      className={`border-t border-brand-100 ${
                        i % 2 ? "bg-white" : "bg-brand-50/30"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-brand-900">
                        <span className="flex items-center gap-2">
                          <FileText size={16} /> {d.title}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brand-700">
                        {d.group ?? "—"}
                      </td>
                      <td className="px-4 py-3 uppercase text-brand-700">
                        {d.type}
                      </td>
                      <td className="px-4 py-3 text-brand-700">
                        {fmtDocSize(d.size)}
                      </td>
                      <td className="px-4 py-3 text-brand-700">
                        {fmtDocDate(d.updated)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleView(d)}
                            disabled={viewing === d.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 px-3 py-1.5 text-sm font-medium text-brand-900 hover:border-brand-500 hover:text-brand-600 disabled:opacity-60"
                          >
                            <Eye size={15} />{" "}
                            {viewing === d.id ? "Đang mở…" : "Xem"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(d)}
                            disabled={downloading === d.id}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                            style={{ backgroundColor: ACCENT }}
                          >
                            <Download size={15} />{" "}
                            {downloading === d.id ? "Đang tải…" : "Tải xuống"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : DOCUMENTS.map((d, i) => (
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
                        {d.ready ? (
                          <a
                            href={d.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                            style={{ backgroundColor: ACCENT }}
                          >
                            <Download size={15} /> Tải xuống
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700"
                          >
                            Đang cập nhật
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- 11. Tin tức ----------

function NewsTab({ items }: { items: ProjectNewsItem[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Tin tức dự án</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((n, i) => (
          <article
            key={`${n.title}-${i}`}
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
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold"
                style={{ color: ACCENT }}
              >
                Đọc tiếp <ChevronRightSmall size={15} />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
