// Dữ liệu tĩnh cho trang Chi tiết dự án Shophouse Happy Home Thanh Hóa.
// Quỹ căn (UNITS) là dữ liệu demo dùng làm FALLBACK khi không gọi được
// inventory API; các phần còn lại là nội dung biên tập từ tài liệu bán hàng
// chính thức (brochure + tờ gấp) của dự án. Đại lý phát triển kinh doanh:
// BDSG LAND. Sau này admin CMS có thể chỉnh tại đây hoặc qua backend.

// Ảnh THẬT từ tờ gấp bán hàng — đã tải về public/hh-assets.
const IMG = {
  toGap1: "/hh-assets/to-gap-01-web.jpg",
  toGap2: "/hh-assets/to-gap-02-web.jpg",
} as const;

// ----- Carousel ảnh trang Tổng quan (16:9) -----
export const HERO_IMAGES: { src: string; caption: string }[] = [
  {
    src: IMG.toGap2,
    caption: "Shophouse Happy Home — giữa trung tâm hành chính mới Thanh Hóa",
  },
  {
    src: IMG.toGap1,
    caption: "Vị trí đắc địa: Cận thị – Cận giang – Cận lộ, bên Đại lộ Nam Sông Mã",
  },
];

// ----- Bảng Tổng quan dự án (số liệu từ brochure chính thức) -----
export const OVERVIEW_ROWS: { label: string; value: string }[] = [
  {
    label: "Tên dự án tổng thể",
    value: "Dự án số 01 Khu đô thị trung tâm TP. Thanh Hóa",
  },
  { label: "Chủ đầu tư", value: "Tập đoàn Vingroup — Công ty CP" },
  {
    label: "Đơn vị hợp tác đầu tư",
    value: "Công ty Cổ phần Quản lý Đầu tư ACD",
  },
  {
    label: "Đại lý phát triển kinh doanh",
    value: "BDSG LAND — Công ty Cổ phần Tập đoàn BDSG",
  },
  { label: "Vị trí", value: "Phường Hạc Thành, tỉnh Thanh Hóa" },
  { label: "Diện tích đất", value: "91.891,6 m²" },
  { label: "Mật độ xây dựng", value: "27% – 36%" },
  {
    label: "Quy mô",
    value: "Dự kiến 2.824 căn hộ · 18 tòa · xây dựng trên 06 lô đất",
  },
  {
    label: "Sản phẩm trọng tâm",
    value: "Shophouse khối đế (SH01 – SH16) tại các Block 1 · 2 · 3",
  },
  {
    label: "Pháp lý",
    value:
      "QĐ 3916/QĐ-UBND (16/10/2017) chấp thuận chủ trương; QĐ 2827/QĐ-UBND (04/08/2017) & QĐ 1775/QĐ-UBND (25/05/2023) phê duyệt/điều chỉnh QH 1/500",
  },
];

// ----- Vị trí -----
// Toạ độ GẦN ĐÚNG khu trung tâm hành chính mới, bên Đại lộ Nam Sông Mã,
// phường Hạc Thành, TP Thanh Hoá (marker minh hoạ — cập nhật khi có toạ độ chuẩn).
export const MAP_LAT = 19.8075;
export const MAP_LNG = 105.8095;

export const CONNECTIONS: { place: string; time: string }[] = [
  { place: "Đại lộ Nam Sông Mã", time: "1 phút" },
  { place: "Trung tâm hành chính mới TP. Thanh Hóa", time: "5 phút" },
  { place: "BigC GO! Thanh Hóa", time: "10 phút" },
  { place: "Vincom Plaza Thanh Hóa", time: "10 phút" },
  { place: "Trường liên cấp Newton Thanh Hóa", time: "10 phút" },
  { place: "UBND tỉnh & các cơ quan hành chính", time: "15 phút" },
];

// ----- Đào tạo -----
// `ready=false` → chưa có file thật → nút "Đang cập nhật" (disabled).
export const TRAININGS: {
  title: string;
  size: string;
  date: string;
  href: string;
  ready: boolean;
}[] = [
  {
    title: "Slide kickoff dự án Happy Home Thanh Hóa",
    size: "PDF",
    date: "Đang cập nhật",
    href: "#",
    ready: false,
  },
  {
    title: "Quy trình booking & lock căn shophouse",
    size: "PDF",
    date: "Đang cập nhật",
    href: "#",
    ready: false,
  },
  {
    title: "Slide đào tạo đại lý BDSG LAND",
    size: "PDF",
    date: "Đang cập nhật",
    href: "#",
    ready: false,
  },
];

// ----- Phân khu shophouse (theo bảng hàng NOXH01 Block 1/2/3) -----
export const SUBZONES: {
  name: string;
  style: string;
  units: string;
  desc: string;
  img: string;
}[] = [
  {
    name: "Block 1",
    style: "Shophouse khối đế — trục thương mại chính",
    units: "Căn SH01 – SH16",
    desc: "Dãy shophouse khối đế mặt trục nội khu chính, lưu lượng cư dân qua lại lớn nhất — vị trí kinh doanh đắt giá nhất dự án.",
    img: IMG.toGap2,
  },
  {
    name: "Block 2",
    style: "Shophouse khối đế — cạnh tiện ích trung tâm",
    units: "Căn SH02 – SH13",
    desc: "Kề khu tiện ích và sân sinh hoạt cộng đồng, phù hợp mô hình F&B, minimart, dịch vụ gia đình phục vụ ~2.800 căn hộ.",
    img: IMG.toGap1,
  },
  {
    name: "Block 3",
    style: "Shophouse khối đế — cửa ngõ đón khách",
    units: "Căn SH01 – SH12",
    desc: "Vị trí cửa ngõ dự án hướng Đại lộ Nam Sông Mã, đón cả khách vãng lai lẫn cư dân nội khu — lợi thế kép cho kinh doanh.",
    img: IMG.toGap2,
  },
];

// ----- Mặt bằng tổng (Leaflet ImageOverlay) -----
// Dùng tạm ảnh tờ gấp (bản web 1920px) — thay bằng bản đồ phân lô chính thức
// khi CĐT phát hành. Kích thước px khớp file /hh-assets/to-gap-01-web.jpg.
export const MASTERPLAN_IMG = "/hh-assets/to-gap-01-web.jpg";
export const MASTERPLAN_W = 1920;
export const MASTERPLAN_H = 905;

// ----- Mặt bằng quỹ căn (fallback demo khi API lỗi) -----
export type UnitStatus = "Còn hàng" | "Đặt cọc" | "Đã bán";

export type Unit = {
  code: string;
  zone: string;
  area: number; // m2
  facade: number; // m
  status: UnitStatus;
  price: string; // tỷ
  position: { x: number; y: number };
};

const ZONES = SUBZONES.map((z) => z.name);
const STATUSES: UnitStatus[] = ["Còn hàng", "Đặt cọc", "Đã bán"];

const MP_MARGIN = 110;
const MP_BAND = (MASTERPLAN_W - 2 * MP_MARGIN) / ZONES.length;

// Sinh ~36 dòng demo có quy luật (không random để build/SSR ổn định).
// Kèm position để Leaflet map vẫn hoạt động khi API lỗi (fallback offline).
export const UNITS: Unit[] = Array.from({ length: 36 }, (_, i) => {
  const zi = i % ZONES.length;
  const zone = ZONES[zi];
  const lot = String((i % 16) + 1).padStart(2, "0");
  const area = 70 + (i % 8) * 8; // 70 - 126 m² (shophouse khối đế)
  const facade = 5 + (i % 4); // 5 - 8 m
  const status = STATUSES[i % 3];
  const price = (3.2 + (area - 70) * 0.04).toFixed(1);
  const zoneCx = MP_MARGIN + (zi + 0.5) * MP_BAND;
  const x = Math.min(
    MASTERPLAN_W - MP_MARGIN,
    Math.max(MP_MARGIN, zoneCx + ((i * 53) % Math.round(MP_BAND)) - MP_BAND / 2),
  );
  const y =
    MP_MARGIN + (((i * 67) % 16) / 16) * (MASTERPLAN_H - 2 * MP_MARGIN);
  return {
    code: `B${zi + 1}-SH${lot}`,
    zone,
    area,
    facade,
    status,
    price: `${price} tỷ`,
    position: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
  };
});

export const STATUS_FILTERS = ["Tất cả", ...STATUSES] as const;
export const ZONE_FILTERS = ["Tất cả", ...ZONES] as const;

// Bộ lọc quỹ (value = key gửi backend, "" = Tất cả).
export const FUND_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "exclusive", label: "Quỹ độc quyền" },
  { value: "bonus", label: "Quỹ thưởng" },
  { value: "agency_f1", label: "Quỹ liên kết đại lý F1" },
  { value: "mid", label: "Quỹ trung" },
  { value: "not_open", label: "Quỹ chưa mở bán" },
];

// ----- Ảnh 360° -----
// `ready=false` → chưa có URL viewer thật → nút "Đang cập nhật" (disabled).
export const TOURS_360: { title: string; img: string; ready: boolean }[] =
  SUBZONES.map((z) => ({
    title: `Trải nghiệm 360° shophouse ${z.name}`,
    img: z.img,
    ready: false,
  }));

// ----- Chính sách bán hàng (theo tờ gấp chính thức) -----
export const POLICIES: {
  title: string;
  date: string;
  open: boolean;
  summary: string;
  highlights: string[];
}[] = [
  {
    title: "Chính sách hiện hành — Shophouse Happy Home",
    date: "Đang áp dụng",
    open: true,
    summary:
      "Ưu đãi theo tờ gấp bán hàng chính thức, áp dụng cho khách hàng giao dịch qua đại lý phát triển kinh doanh BDSG LAND.",
    highlights: [
      "Chiết khấu 6% khi thanh toán sớm",
      "Chiết khấu 2% khi thanh toán theo tiến độ",
      "Hỗ trợ vay vốn ngân hàng",
      "Ưu tiên chọn căn vị trí đẹp cho khách đặt sớm — liên hệ 0967 806 686",
    ],
  },
  {
    title: "Đợt tiếp theo",
    date: "Sắp công bố",
    open: false,
    summary:
      "Bảng giá và điều kiện thanh toán đợt tiếp theo chưa được công bố chính thức.",
    highlights: [
      "Thông tin chính sách chưa công bố",
      "Dự kiến ưu tiên khách hàng đã quan tâm đợt hiện tại",
      "Liên hệ chuyên viên BDSG LAND để được cập nhật sớm nhất",
    ],
  },
];

// Bảng giá tham khảo — giá chi tiết từng căn theo bảng hàng, liên hệ để nhận.
export const PRICE_TABLE: {
  product: string;
  area: string;
  from: string;
}[] = [
  { product: "Shophouse khối đế — Block 1", area: "SH01 – SH16", from: "Liên hệ 0967 806 686" },
  { product: "Shophouse khối đế — Block 2", area: "SH02 – SH13", from: "Liên hệ 0967 806 686" },
  { product: "Shophouse khối đế — Block 3", area: "SH01 – SH12", from: "Liên hệ 0967 806 686" },
];

// ----- Tiến độ (mốc pháp lý thật + mốc kinh doanh) -----
export const TIMELINE: {
  period: string;
  title: string;
  desc: string;
  img: string;
}[] = [
  {
    period: "16/10/2017",
    title: "Chấp thuận chủ trương đầu tư",
    desc: "QĐ 3916/QĐ-UBND chấp thuận chủ trương đầu tư Dự án số 1 Khu đô thị trung tâm TP. Thanh Hóa.",
    img: IMG.toGap2,
  },
  {
    period: "25/05/2023",
    title: "Điều chỉnh quy hoạch chi tiết 1/500",
    desc: "QĐ 1775/QĐ-UBND phê duyệt điều chỉnh Quy hoạch chi tiết 1/500 của dự án.",
    img: IMG.toGap1,
  },
  {
    period: "2025",
    title: "Triển khai xây dựng các tòa Happy Home",
    desc: "Thi công các tòa căn hộ và khối đế shophouse trên 06 lô đất, tổng quy mô 18 tòa.",
    img: IMG.toGap2,
  },
  {
    period: "Hiện tại",
    title: "Mở bán shophouse khối đế Block 1 · 2 · 3",
    desc: "BDSG LAND phân phối quỹ căn shophouse SH01 – SH16, chiết khấu tới 6% + hỗ trợ vay ngân hàng.",
    img: IMG.toGap1,
  },
];

// ----- Tài liệu -----
// `ready=true` → mở link tài liệu bán hàng chính thức (Google Drive).
export const DOCUMENTS: {
  name: string;
  type: string;
  size: string;
  date: string;
  href: string;
  ready: boolean;
}[] = [
  {
    name: "Brochure Happy Home Thanh Hóa",
    type: "PDF",
    size: "—",
    date: "2025",
    href: "https://drive.google.com/file/d/1kHz8-LVtoJSh_WjYo1lEq-MclQAsiQnz/view",
    ready: true,
  },
  {
    name: "Tờ gấp giới thiệu shophouse",
    type: "PDF",
    size: "—",
    date: "2025",
    href: "https://drive.google.com/file/d/1K3yvRoOOm3JeK4j-VPJkt0jXScWC1kGX/view",
    ready: true,
  },
  {
    name: "Kho tài liệu bán hàng (Drive)",
    type: "Thư mục",
    size: "—",
    date: "2025",
    href: "https://drive.google.com/drive/folders/16nV17dGvUwtJsBoJAvaVc6oMGbJ2wmhG",
    ready: true,
  },
  { name: "Bảng giá chi tiết từng căn", type: "PDF", size: "—", date: "Đang cập nhật", href: "#", ready: false },
  { name: "Hợp đồng mua bán mẫu", type: "PDF", size: "—", date: "Đang cập nhật", href: "#", ready: false },
  { name: "Chính sách bán hàng chi tiết", type: "PDF", size: "—", date: "Đang cập nhật", href: "#", ready: false },
];

// ----- Tin tức (fallback tĩnh) — link về kho tin nội bộ, không trỏ web ngoài -----
const NEWS_URL = "/news";

export const NEWS: {
  title: string;
  date: string;
  excerpt: string;
  img: string;
  url: string;
}[] = [
  {
    title: "Shophouse Happy Home — cơ hội kinh doanh giữa khu đô thị 2.824 căn hộ",
    date: "2025",
    excerpt:
      "Khối đế thương mại phục vụ trực tiếp cộng đồng cư dân 18 tòa căn hộ, vị trí trung tâm hành chính mới TP. Thanh Hóa.",
    img: IMG.toGap2,
    url: NEWS_URL,
  },
  {
    title: "Vị thế 'Cận thị – Cận giang – Cận lộ' của Happy Home Thanh Hóa",
    date: "2025",
    excerpt:
      "Bên Đại lộ Nam Sông Mã, chưa tới 10 phút tới BigC GO!, Vincom Plaza và các tiện ích thiết yếu của thành phố.",
    img: IMG.toGap1,
    url: NEWS_URL,
  },
  {
    title: "Chiết khấu tới 6% cho khách thanh toán sớm shophouse Happy Home",
    date: "2025",
    excerpt:
      "Chính sách bán hàng hiện hành: CK 6% thanh toán sớm, CK 2% theo tiến độ, hỗ trợ vay vốn ngân hàng — qua đại lý BDSG LAND.",
    img: IMG.toGap2,
    url: NEWS_URL,
  },
];
