// Dữ liệu tĩnh cho trang Chi tiết dự án Eurowindow Light City.
// Quỹ căn (UNITS) là dữ liệu demo dùng làm FALLBACK khi không gọi được
// inventory API; các phần còn lại là nội dung biên tập từ knowledge base ELC.
// Sau này admin CMS có thể chỉnh tại đây hoặc qua backend.

const CDN = "/elc-assets/w.ladicdn.com";
const D = "66bf0ce47123d90013a10b9f";

// Ảnh THẬT — đã verify tồn tại trong public/elc-assets (đường dẫn có size-segment).
// KHÔNG dùng `${CDN}/${D}/...` trực tiếp: thư mục đó chỉ chứa 2 file webp → 404.
const IMG = {
  tongThe: `${CDN}/s1440x694/${D}/4221-20251026174908-3ncoy.jpg`,
  hoangHon: `${CDN}/s1440x836/${D}/pc03_tt-hoang-hon_edit_logo_resize_2-20251022183716-bumkm.jpg`,
  hoangHon2: `${CDN}/s750x600/${D}/pc03_tt-hoang-hon_edit_logo_resize_2-20251026163257-whflk.jpg`,
  daiLoAnhSang: `${CDN}/s1440x817/${D}/pc13_dailoanhsang_edit_logo-copy-20251022182719-77syf.jpg`,
  daiLo2: `${CDN}/s1200x850/${D}/pc13_dailoanhsang_edit_logo-copy-20251028025052-nyrmf.jpg`,
  lkNhat: `${CDN}/s768x726/${D}/pc09_lk-nhat-3-tang_edit_logo-20251022185128-bfolb.jpg`,
  venHo: `${CDN}/s1440x832/${D}/m16-v1-copy-20251025154712-_gqyg.jpg`,
  m16b: `${CDN}/s750x600/${D}/m16-v1-copy-20251026123017-exg88.jpg`,
  ue: `${CDN}/s750x600/${D}/ue-20251026074643-n2fso.jpg`,
  e5: `${CDN}/s750x550/${D}/e5-20251025183559-tefsq.jpg`,
  z323: `${CDN}/s1800x1150/${D}/323-20251025180245-hp9dc.jpg`,
  tienIch: `${CDN}/s1440x700/${D}/78-20251022184429-lkrs1.jpg`,
  quangTruong: `${CDN}/s1440x901/${D}/32-20251023124829-vq-ov.jpg`,
  aerial: `${CDN}/s1440x981/${D}/66-20251025162125-jom7b.jpg`,
  cvAnhSang: `${CDN}/s550x550/${D}/pc12_tien-ich-cv-anh-sang_edit_logo_resize-20251026163257-geeew.jpg`,
  e687: `${CDN}/s768x687/${D}/e-20251025153816-jv4zb.jpg`,
  v4: `${CDN}/s750x550/${D}/4-20251026131552-qld4z.jpg`,
} as const;

// ----- Carousel ảnh trang Tổng quan (16:9) -----
export const HERO_IMAGES: { src: string; caption: string }[] = [
  { src: IMG.tongThe, caption: "Phối cảnh tổng thể khu đô thị Eurowindow Light City" },
  { src: IMG.hoangHon, caption: "Trục cảnh quan trung tâm lúc hoàng hôn" },
  { src: IMG.daiLoAnhSang, caption: "Đại lộ Ánh Sáng" },
  { src: IMG.lkNhat, caption: "Phân khu liền kề phong cách Nhật Bản" },
  { src: IMG.venHo, caption: "Không gian sống xanh ven hồ" },
  { src: IMG.tienIch, caption: "Tiện ích nội khu đẳng cấp" },
  { src: IMG.quangTruong, caption: "Quảng trường trung tâm" },
  { src: IMG.aerial, caption: "Tổng quan dự án nhìn từ trên cao" },
];

// ----- Bảng Tổng quan dự án (số liệu từ knowledge base ELC) -----
export const OVERVIEW_ROWS: { label: string; value: string }[] = [
  {
    label: "Chủ đầu tư",
    value: "Công ty TNHH Đầu tư Bất động sản Eurowindow Light City",
  },
  { label: "Đơn vị phát triển", value: "Eurowindow Holding" },
  { label: "Vị trí", value: "Phường Nguyệt Viên, TP Thanh Hoá" },
  { label: "Quy mô", value: "176 ha" },
  {
    label: "Tổng vốn đầu tư",
    value: "Khoảng 12.000 tỷ đồng (BIDV và Techcombank cấp tín dụng)",
  },
  { label: "Khởi công", value: "Quý 3/2025" },
  { label: "Bàn giao đợt 1", value: "Quý 2/2026" },
  {
    label: "Loại hình sản phẩm",
    value:
      "Nhà liền kề 2.461 căn · Biệt thự 523 căn · Biệt thự đảo view hồ 78 căn · Chung cư 1.662 căn · Shophouse khối đế 312 căn · Shophouse 2 mặt tiền 187 căn",
  },
];

// ----- Vị trí -----
// Toạ độ thật Nguyệt Viên, TP Thanh Hoá.
export const MAP_LAT = 19.8847;
export const MAP_LNG = 105.7894;

export const CONNECTIONS: { place: string; time: string }[] = [
  { place: "Quốc lộ 1A", time: "1 phút" },
  { place: "Cầu Hoằng Long", time: "3 phút" },
  { place: "Trường TH & THCS Tào Xuyên", time: "6 phút" },
  { place: "Siêu thị Go!", time: "10 phút" },
  { place: "Bệnh viện đa khoa Hàm Rồng", time: "10 phút" },
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
    title: "Slide kickoff dự án ELC",
    size: "PDF",
    date: "20/10/2025",
    href: "#",
    ready: false,
  },
  {
    title: "Quy trình booking & lock căn",
    size: "PDF",
    date: "22/10/2025",
    href: "#",
    ready: false,
  },
  {
    title: "Slide đào tạo đại lý F1",
    size: "PDF",
    date: "25/10/2025",
    href: "#",
    ready: false,
  },
];

// ----- 7 phân khu (ảnh thật, mô tả ngắn) -----
export const SUBZONES: {
  name: string;
  style: string;
  units: string;
  desc: string;
  img: string;
}[] = [
  {
    name: "Bình Minh",
    style: "Phong cách Nhật Bản",
    units: "≈ 420 căn liền kề",
    desc: "Phân khu mở bán đầu tiên, kiến trúc tối giản kiểu Nhật. Tiến độ hạ tầng dẫn đầu toàn dự án, dự kiến bàn giao Quý 2/2026.",
    img: IMG.lkNhat,
  },
  {
    name: "Mặt Trời",
    style: "Phong cách Đông Dương",
    units: "≈ 380 căn liền kề",
    desc: "Lấy cảm hứng kiến trúc Đông Dương sang trọng, đón trọn ánh nắng bình minh. Vị trí gần trục cảnh quan trung tâm.",
    img: IMG.hoangHon2,
  },
  {
    name: "Cầu Vồng",
    style: "Pháp tân cổ điển",
    units: "≈ 350 căn liền kề",
    desc: "Dải nhà phố sắc màu rực rỡ men theo Đại lộ Ánh Sáng, lý tưởng cho kinh doanh và an cư kết hợp.",
    img: IMG.daiLo2,
  },
  {
    name: "Ánh Sao",
    style: "Phong cách Hy Lạp",
    units: "≈ 310 căn liền kề",
    desc: "Kiến trúc Địa Trung Hải tinh khôi, không gian thoáng đãng. Liền kề công viên và tiện ích nội khu.",
    img: IMG.m16b,
  },
  {
    name: "Ánh Trăng",
    style: "Phong cách Italia",
    units: "≈ 290 biệt thự",
    desc: "Dòng biệt thự cao cấp phong cách Ý, nhiều căn view hồ và đảo trung tâm. Mật độ xây dựng thấp, riêng tư.",
    img: IMG.ue,
  },
  {
    name: "Ánh Sáng",
    style: "Pháp cổ điển",
    units: "≈ 260 căn shophouse",
    desc: "Tuyến shophouse thương mại sầm uất quanh công viên Ánh Sáng — biểu tượng giải trí và mua sắm của khu đô thị.",
    img: IMG.cvAnhSang,
  },
  {
    name: "Hừng Đông",
    style: "Phong cách Art Deco",
    units: "≈ 240 căn liền kề",
    desc: "Phong cách Art Deco hiện đại, đường nét mạnh mẽ. Cửa ngõ đón cư dân từ phía Quốc lộ 1A.",
    img: IMG.z323,
  },
];

// ----- Mặt bằng tổng (Leaflet ImageOverlay) -----
// Ảnh thật + kích thước px (khớp với toạ độ marker do inventory API trả về).
export const MASTERPLAN_IMG =
  "/elc-assets/eurowindowlightcity.vn/public/upload/ELC_ban%20do%20phan%20khu_tong-01.jpg";
export const MASTERPLAN_W = 2001;
export const MASTERPLAN_H = 1126;

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
  const prefix = zone.slice(0, 2).toUpperCase();
  const lot = String(i + 1).padStart(2, "0");
  const area = 75 + (i % 8) * 12; // 75 - 159
  const facade = 5 + (i % 4); // 5 - 8
  const status = STATUSES[i % 3];
  const price = (4.2 + (area - 75) * 0.035).toFixed(1);
  const zoneCx = MP_MARGIN + (zi + 0.5) * MP_BAND;
  const x = Math.min(
    MASTERPLAN_W - MP_MARGIN,
    Math.max(MP_MARGIN, zoneCx + ((i * 53) % Math.round(MP_BAND)) - MP_BAND / 2),
  );
  const y =
    MP_MARGIN + (((i * 67) % 16) / 16) * (MASTERPLAN_H - 2 * MP_MARGIN);
  return {
    code: `${prefix}-${lot}`,
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

// ----- Ảnh 360° -----
// `ready=false` → chưa có URL viewer thật → nút "Đang cập nhật" (disabled).
export const TOURS_360: { title: string; img: string; ready: boolean }[] =
  SUBZONES.map((z) => ({
    title: `Trải nghiệm 360° phân khu ${z.name}`,
    img: z.img,
    ready: false,
  }));

// ----- Chính sách bán hàng -----
export const POLICIES: {
  title: string;
  date: string;
  open: boolean;
  summary: string;
  highlights: string[];
}[] = [
  {
    title: "Đợt 1 — Phân khu Bình Minh (đang mở bán)",
    date: "Đang áp dụng",
    open: true,
    summary:
      "Ưu đãi mở bán giai đoạn đầu áp dụng cho khách hàng đặt cọc thiện chí và đại lý F1, đồng tài trợ bởi BIDV và Techcombank.",
    highlights: [
      "Chiết khấu 5% giá trị căn",
      "Hỗ trợ lãi suất 0% trong 42 tháng (BIDV + Techcombank)",
      "Tặng gói nội thất trị giá 50 - 200 triệu đồng theo dòng sản phẩm",
      "Ưu tiên chọn căn đẹp, vị trí trục cảnh quan",
    ],
  },
  {
    title: "Đợt 2 — Phân khu Mặt Trời & Cầu Vồng",
    date: "Dự kiến Quý 3/2026",
    open: false,
    summary:
      "Mở rộng quỹ căn liền kề và shophouse. Bảng giá và điều kiện thanh toán chi tiết chưa được công bố.",
    highlights: [
      "Thông tin chính sách chưa công bố",
      "Dự kiến ưu tiên khách hàng thân thiết đợt 1",
      "Liên hệ chuyên viên kinh doanh để được cập nhật sớm nhất",
    ],
  },
];

// Bảng giá tham khảo (nguồn: tin tức thị trường — chỉ mang tính tham khảo).
export const PRICE_TABLE: {
  product: string;
  area: string;
  from: string;
}[] = [
  { product: "Nhà liền kề", area: "75 - 120 m²", from: "Từ 1,9 tỷ" },
  { product: "Shophouse", area: "90 - 150 m²", from: "Từ 4,2 tỷ" },
  { product: "Biệt thự", area: "180 - 300 m²", from: "Từ 5,5 tỷ" },
];

// ----- Tiến độ (mốc thật) -----
export const TIMELINE: {
  period: string;
  title: string;
  desc: string;
  img: string;
}[] = [
  {
    period: "Quý 3/2025",
    title: "Khởi công dự án",
    desc: "Khởi công xây dựng hạ tầng kỹ thuật khu đô thị 176 ha bên sông Mã.",
    img: IMG.tongThe,
  },
  {
    period: "Quý 4/2025",
    title: "Hoàn thiện hạ tầng phân khu Bình Minh",
    desc: "San nền, hệ thống đường nội khu và cảnh quan phân khu Bình Minh.",
    img: IMG.lkNhat,
  },
  {
    period: "Quý 1/2026",
    title: "Khởi công phân khu Mặt Trời & Cầu Vồng",
    desc: "Triển khai hai phân khu liền kề tiếp theo và các tiện ích trục trung tâm.",
    img: IMG.hoangHon2,
  },
  {
    period: "22/05/2026",
    title: "Khai trương VPBH và sa bàn dự án",
    desc: "Khai trương văn phòng bán hàng và sa bàn, sẵn sàng đón khách tham quan trải nghiệm.",
    img: IMG.v4,
  },
  {
    period: "Quý 2/2026",
    title: "Bàn giao đợt 1 — phân khu Bình Minh",
    desc: "Bàn giao những căn liền kề đầu tiên cho khách hàng phân khu Bình Minh.",
    img: IMG.venHo,
  },
  {
    period: "Quý 4/2026",
    title: "Bàn giao đợt 2",
    desc: "Tiếp tục bàn giao quỹ căn đợt 2 và hoàn thiện tiện ích trung tâm.",
    img: IMG.quangTruong,
  },
];

// ----- Tài liệu -----
// `ready=false` → chưa có file thật → nút "Đang cập nhật" (disabled).
export const DOCUMENTS: {
  name: string;
  type: string;
  size: string;
  date: string;
  href: string;
  ready: boolean;
}[] = [
  { name: "Brochure tổng quan ELC", type: "PDF", size: "—", date: "20/10/2025", href: "#", ready: false },
  { name: "Bảng giá đợt 1", type: "PDF", size: "—", date: "05/11/2025", href: "#", ready: false },
  { name: "Hồ sơ pháp lý dự án", type: "PDF", size: "—", date: "18/10/2025", href: "#", ready: false },
  { name: "Tờ rơi giới thiệu", type: "PDF", size: "—", date: "22/10/2025", href: "#", ready: false },
  {
    name: "Mặt bằng phân khu tổng",
    type: "JPG",
    size: "4.7 MB",
    date: "15/10/2025",
    href: "/elc-assets/eurowindowlightcity.vn/public/upload/ELC_ban%20do%20phan%20khu_tong-01.jpg",
    ready: true,
  },
  { name: "Hợp đồng mua bán mẫu", type: "PDF", size: "—", date: "24/10/2025", href: "#", ready: false },
  { name: "Chính sách bán hàng đợt 1", type: "PDF", size: "—", date: "05/11/2025", href: "#", ready: false },
];

// ----- Tin tức (tin thật, link về website chính thức) -----
const NEWS_URL = "https://eurowindowlightcity.vn";

export const NEWS: {
  title: string;
  date: string;
  excerpt: string;
  img: string;
  url: string;
}[] = [
  {
    title: "BIDV và Techcombank cấp 12.000 tỷ tín dụng cho Eurowindow Light City",
    date: "17/10/2025",
    excerpt:
      "Hai ngân hàng lớn đồng tài trợ nguồn vốn 12.000 tỷ đồng, khẳng định tiềm lực và tính khả thi của dự án 176 ha.",
    img: IMG.e687,
    url: NEWS_URL,
  },
  {
    title: "Eurowindow Holding lọt TOP 40 doanh nghiệp tư nhân lớn nhất Việt Nam",
    date: "08/10/2025",
    excerpt:
      "Eurowindow Holding tiếp tục khẳng định vị thế trên bảng xếp hạng doanh nghiệp tư nhân hàng đầu cả nước.",
    img: IMG.aerial,
    url: NEWS_URL,
  },
  {
    title: "Đặc quyền sống của cư dân Eurowindow Light City",
    date: "19/09/2025",
    excerpt:
      "Hệ sinh thái tiện ích all-in-one: công viên, quảng trường, trường học và trung tâm thương mại nội khu.",
    img: IMG.tienIch,
    url: NEWS_URL,
  },
  {
    title: "Đại lộ Ánh Sáng — biểu tượng mới của đô thị Thanh Hoá",
    date: "28/08/2025",
    excerpt:
      "Trục đại lộ trung tâm với hệ thống chiếu sáng nghệ thuật hứa hẹn trở thành điểm đến biểu tượng.",
    img: IMG.daiLo2,
    url: NEWS_URL,
  },
  {
    title: "Điểm nhấn kiến trúc và ánh sáng trên khu đô thị 176 ha",
    date: "13/11/2025",
    excerpt:
      "Quy hoạch ánh sáng đồng bộ cùng kiến trúc đa phong cách tạo nên bản sắc riêng cho Eurowindow Light City.",
    img: IMG.cvAnhSang,
    url: NEWS_URL,
  },
  {
    title: "Đại lộ ánh sáng độc bản tại Việt Nam",
    date: "12/11/2025",
    excerpt:
      "Lần đầu tiên một đại lộ ánh sáng quy mô lớn được kiến tạo, mang trải nghiệm sống khác biệt cho cư dân.",
    img: IMG.hoangHon,
    url: NEWS_URL,
  },
];
