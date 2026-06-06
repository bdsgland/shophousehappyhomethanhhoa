// Dữ liệu tĩnh (demo) cho trang Chi tiết dự án Eurowindow Light City.
// Sau này sẽ thay bằng API/CMS — admin chỉ cần chỉnh tại đây.

const CDN = "/elc-assets/w.ladicdn.com";
const PHANKHU_DIR = `${CDN}/66bf0ce47123d90013a10b9f`;

// ----- Carousel ảnh trang Tổng quan (16:9) -----
export const HERO_IMAGES: { src: string; caption: string }[] = [
  {
    src: `${CDN}/s1440x694/66bf0ce47123d90013a10b9f/4221-20251026174908-3ncoy.jpg`,
    caption: "Phối cảnh tổng thể khu đô thị Eurowindow Light City",
  },
  {
    src: `${CDN}/s1440x836/66bf0ce47123d90013a10b9f/pc03_tt-hoang-hon_edit_logo_resize_2-20251022183716-bumkm.jpg`,
    caption: "Trục cảnh quan trung tâm lúc hoàng hôn",
  },
  {
    src: `${CDN}/s1440x817/66bf0ce47123d90013a10b9f/pc13_dailoanhsang_edit_logo-copy-20251022182719-77syf.jpg`,
    caption: "Đại lộ Ánh Sáng",
  },
  {
    src: `${CDN}/s1440x744/66bf0ce47123d90013a10b9f/pc09_lk-nhat-3-tang_edit_logo-20251022185128-bfolb.jpg`,
    caption: "Phân khu liền kề phong cách Nhật Bản",
  },
  {
    src: `${CDN}/s1440x832/66bf0ce47123d90013a10b9f/m16-v1-copy-20251025154712-_gqyg.jpg`,
    caption: "Không gian sống xanh ven hồ",
  },
  {
    src: `${CDN}/s1440x700/66bf0ce47123d90013a10b9f/78-20251022184429-lkrs1.jpg`,
    caption: "Tiện ích nội khu đẳng cấp",
  },
  {
    src: `${CDN}/s1440x901/66bf0ce47123d90013a10b9f/32-20251023124829-vq-ov.jpg`,
    caption: "Quảng trường trung tâm",
  },
  {
    src: `${CDN}/s1440x981/66bf0ce47123d90013a10b9f/66-20251025162125-jom7b.jpg`,
    caption: "Tổng quan dự án nhìn từ trên cao",
  },
];

// ----- Bảng Tổng quan dự án -----
export const OVERVIEW_ROWS: { label: string; value: string }[] = [
  { label: "Chủ đầu tư", value: "Eurowindow Holding" },
  { label: "Đơn vị phát triển", value: "Eurowindow Holding" },
  { label: "Vị trí", value: "Phường Nguyệt Viên, TP Thanh Hoá" },
  { label: "Quy mô", value: "176 ha" },
  {
    label: "Loại hình sản phẩm",
    value:
      "Nhà liền kề 2.461 căn · Biệt thự 523 căn · Biệt thự đảo view hồ 78 căn · Chung cư 1.662 căn · Shophouse khối đế 312 căn · Shophouse 2 mặt tiền 187 căn",
  },
];

// ----- Vị trí: kết nối nhanh -----
export const CONNECTIONS: { place: string; time: string }[] = [
  { place: "Quốc lộ 1A", time: "1 phút" },
  { place: "Cầu Hoằng Long", time: "3 phút" },
  { place: "Trường TH & THCS Tào Xuyên", time: "6 phút" },
  { place: "Siêu thị Go!", time: "10 phút" },
  { place: "Bệnh viện đa khoa Hàm Rồng", time: "10 phút" },
];

// ----- Đào tạo -----
export const TRAININGS: {
  title: string;
  size: string;
  date: string;
  href: string;
}[] = [
  {
    title: "Slide kickoff dự án ELC",
    size: "8.4 MB",
    date: "20/10/2025",
    href: "/docs/training/elc-kickoff.pdf",
  },
  {
    title: "Quy trình booking & lock căn",
    size: "2.1 MB",
    date: "22/10/2025",
    href: "/docs/training/elc-quy-trinh-booking.pdf",
  },
  {
    title: "Slide đào tạo đại lý F1",
    size: "12.6 MB",
    date: "25/10/2025",
    href: "/docs/training/elc-dao-tao-dai-ly.pdf",
  },
];

// ----- 7 phân khu -----
export const SUBZONES: {
  name: string;
  style: string;
  units: string;
  img: string;
}[] = [
  {
    name: "Bình Minh",
    style: "Phong cách Nhật Bản",
    units: "≈ 420 căn liền kề",
    img: `${PHANKHU_DIR}/pc09_lk-nhat-3-tang_edit_logo-20251022185128-bfolb.jpg`,
  },
  {
    name: "Mặt Trời",
    style: "Phong cách Đông Dương",
    units: "≈ 380 căn liền kề",
    img: `${PHANKHU_DIR}/pc03_tt-hoang-hon_edit_logo_resize_2-20251026163257-whflk.jpg`,
  },
  {
    name: "Cầu Vồng",
    style: "Pháp Tân cổ điển",
    units: "≈ 350 căn liền kề",
    img: `${PHANKHU_DIR}/pc13_dailoanhsang_edit_logo-copy-20251026094243-x9t3f.jpg`,
  },
  {
    name: "Ánh Sao",
    style: "Phong cách Hy Lạp",
    units: "≈ 310 căn liền kề",
    img: `${PHANKHU_DIR}/m16-v1-copy-20251026123017-exg88.jpg`,
  },
  {
    name: "Ánh Trăng",
    style: "Phong cách Italia",
    units: "≈ 290 biệt thự",
    img: `${PHANKHU_DIR}/ue-20251026074643-n2fso.jpg`,
  },
  {
    name: "Ánh Sáng",
    style: "Pháp cổ điển",
    units: "≈ 260 căn shophouse",
    img: `${PHANKHU_DIR}/e5-20251025183559-tefsq.jpg`,
  },
  {
    name: "Hừng Đông",
    style: "Phong cách Art Deco",
    units: "≈ 240 căn liền kề",
    img: `${PHANKHU_DIR}/323-20251025180245-hp9dc.jpg`,
  },
];

// ----- Mặt bằng quỹ căn -----
export type UnitStatus = "Còn hàng" | "Đặt cọc" | "Đã bán";

export type Unit = {
  code: string;
  zone: string;
  area: number; // m2
  facade: number; // m
  status: UnitStatus;
  price: string; // tỷ
};

const ZONES = SUBZONES.map((z) => z.name);
const STATUSES: UnitStatus[] = ["Còn hàng", "Đặt cọc", "Đã bán"];

// Sinh ~36 dòng demo có quy luật (không random để build/SSR ổn định).
export const UNITS: Unit[] = Array.from({ length: 36 }, (_, i) => {
  const zone = ZONES[i % ZONES.length];
  const prefix = zone.slice(0, 2).toUpperCase();
  const lot = String(i + 1).padStart(2, "0");
  const area = 75 + (i % 8) * 12; // 75 - 159
  const facade = 5 + (i % 4); // 5 - 8
  const status = STATUSES[i % 3];
  const price = (4.2 + (area - 75) * 0.035).toFixed(1);
  return {
    code: `${prefix}-${lot}`,
    zone,
    area,
    facade,
    status,
    price: `${price} tỷ`,
  };
});

export const STATUS_FILTERS = ["Tất cả", ...STATUSES] as const;
export const ZONE_FILTERS = ["Tất cả", ...ZONES] as const;

// ----- Ảnh 360° -----
export const TOURS_360: { title: string; img: string }[] = SUBZONES.map(
  (z) => ({
    title: `Trải nghiệm 360° phân khu ${z.name}`,
    img: z.img,
  }),
);

// ----- Chính sách bán hàng -----
export const POLICIES: {
  title: string;
  date: string;
  summary: string;
  highlights: string[];
  href: string;
}[] = [
  {
    title: "Chính sách bán hàng đợt 1 — Phân khu Bình Minh",
    date: "Tháng 11/2025",
    summary:
      "Ưu đãi mở bán giai đoạn đầu áp dụng cho khách hàng đặt cọc thiện chí và đại lý F1.",
    highlights: [
      "Hỗ trợ lãi suất 0% trong 42 tháng",
      "Chiết khấu thanh toán nhanh tới 9,5%",
      "Hoa hồng đại lý cạnh tranh + thưởng nóng theo căn",
      "Tặng gói nội thất / voucher theo dòng sản phẩm",
    ],
    href: "/docs/policy/elc-csbh-dot-1.pdf",
  },
  {
    title: "Chính sách bán hàng đợt 2 — Phân khu Mặt Trời & Cầu Vồng",
    date: "Dự kiến Q1/2026",
    summary:
      "Mở rộng quỹ căn liền kề và shophouse, cập nhật bảng giá và điều kiện thanh toán.",
    highlights: [
      "Hỗ trợ lãi suất ưu đãi (đang cập nhật)",
      "Chiết khấu theo tiến độ thanh toán",
      "Chính sách dành riêng cho khách thân thiết đợt 1",
    ],
    href: "/docs/policy/elc-csbh-dot-2.pdf",
  },
];

// ----- Tiến độ -----
export const TIMELINE: {
  period: string;
  title: string;
  desc: string;
  img: string;
}[] = [
  {
    period: "Q3/2025",
    title: "Khởi công dự án",
    desc: "Khởi công xây dựng hạ tầng kỹ thuật khu đô thị 176 ha.",
    img: `${PHANKHU_DIR}/4221-20251026174908-3ncoy.jpg`,
  },
  {
    period: "Q4/2025",
    title: "Hoàn thiện hạ tầng phân khu 1",
    desc: "San nền, hệ thống đường nội khu và cảnh quan phân khu Bình Minh.",
    img: `${PHANKHU_DIR}/pc09_lk-nhat-3-tang_edit_logo-20251022185128-bfolb.jpg`,
  },
  {
    period: "Q1/2026",
    title: "Cất nóc khu liền kề đầu tiên",
    desc: "Cất nóc các dãy liền kề mẫu, triển khai nhà điều hành & nhà mẫu.",
    img: `${PHANKHU_DIR}/m16-v1-copy-20251025154712-_gqyg.jpg`,
  },
  {
    period: "Q2/2026",
    title: "Bàn giao đợt 1",
    desc: "Bàn giao những căn liền kề đầu tiên cho khách hàng phân khu Bình Minh.",
    img: `${PHANKHU_DIR}/pc03_tt-hoang-hon_edit_logo_resize_2-20251022183716-bumkm.jpg`,
  },
  {
    period: "Q4/2026",
    title: "Hoàn thiện tiện ích trung tâm",
    desc: "Đưa vào vận hành quảng trường, công viên và trục cảnh quan Ánh Sáng.",
    img: `${PHANKHU_DIR}/66-20251025162125-jom7b.jpg`,
  },
];

// ----- Tài liệu -----
export const DOCUMENTS: {
  name: string;
  type: string;
  size: string;
  date: string;
  href: string;
}[] = [
  {
    name: "Brochure tổng quan ELC",
    type: "PDF",
    size: "15.2 MB",
    date: "20/10/2025",
    href: "/docs/elc-brochure.pdf",
  },
  {
    name: "Bảng giá đợt 1",
    type: "PDF",
    size: "1.8 MB",
    date: "05/11/2025",
    href: "/docs/elc-bang-gia-dot-1.pdf",
  },
  {
    name: "Hồ sơ pháp lý dự án",
    type: "PDF",
    size: "6.4 MB",
    date: "18/10/2025",
    href: "/docs/elc-phap-ly.pdf",
  },
  {
    name: "Tờ rơi giới thiệu",
    type: "PDF",
    size: "3.1 MB",
    date: "22/10/2025",
    href: "/docs/elc-to-roi.pdf",
  },
  {
    name: "Mặt bằng phân khu tổng",
    type: "JPG",
    size: "4.7 MB",
    date: "15/10/2025",
    href: "/elc-assets/eurowindowlightcity.vn/public/upload/ELC_ban%20do%20phan%20khu_tong-01.jpg",
  },
  {
    name: "Quy trình giao dịch & thanh toán",
    type: "PDF",
    size: "0.9 MB",
    date: "24/10/2025",
    href: "/docs/elc-quy-trinh.pdf",
  },
];

// ----- Tin tức -----
export const NEWS: {
  title: string;
  date: string;
  excerpt: string;
  img: string;
}[] = [
  {
    title: "Eurowindow Light City chính thức ra mắt thị trường Thanh Hoá",
    date: "26/10/2025",
    excerpt:
      "Khu đô thị 176 ha bên sông Mã chính thức được giới thiệu với hơn 5.000 sản phẩm đa dạng.",
    img: `${PHANKHU_DIR}/4221-20251026174908-3ncoy.jpg`,
  },
  {
    title: "Mở bán phân khu Bình Minh phong cách Nhật Bản",
    date: "10/11/2025",
    excerpt:
      "Phân khu đầu tiên mở bán với chính sách hỗ trợ lãi suất 0% trong 42 tháng.",
    img: `${PHANKHU_DIR}/pc09_lk-nhat-3-tang_edit_logo-20251022185128-bfolb.jpg`,
  },
  {
    title: "Tiện ích đẳng cấp tại Eurowindow Light City",
    date: "12/11/2025",
    excerpt:
      "Hệ thống công viên, quảng trường, trường học và trung tâm thương mại nội khu.",
    img: `${PHANKHU_DIR}/78-20251022184429-lkrs1.jpg`,
  },
  {
    title: "Vị trí kết nối vàng bên Quốc lộ 1A",
    date: "15/11/2025",
    excerpt:
      "Chỉ 1 phút ra Quốc lộ 1A, 3 phút tới cầu Hoằng Long, kết nối nhanh trung tâm TP Thanh Hoá.",
    img: `${PHANKHU_DIR}/32-20251023124829-vq-ov.jpg`,
  },
  {
    title: "Cập nhật tiến độ thi công hạ tầng phân khu 1",
    date: "28/11/2025",
    excerpt:
      "Hạ tầng kỹ thuật và cảnh quan phân khu Bình Minh đang được đẩy nhanh tiến độ.",
    img: `${PHANKHU_DIR}/m16-v1-copy-20251025154712-_gqyg.jpg`,
  },
  {
    title: "Chính sách dành cho đại lý phân phối F1",
    date: "30/11/2025",
    excerpt:
      "Hoa hồng cạnh tranh, thưởng nóng theo căn và chương trình đào tạo bài bản cho đại lý.",
    img: `${PHANKHU_DIR}/pc13_dailoanhsang_edit_logo-copy-20251022182719-77syf.jpg`,
  },
];
