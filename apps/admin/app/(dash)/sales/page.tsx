import { ComingSoon } from "@/components/ComingSoon";

export default function SalesPage() {
  return (
    <ComingSoon
      title="Sale & Hoa hồng"
      description="Danh sách sale, cây giới thiệu và bậc hoa hồng lũy tiến."
      bullets={[
        "Danh sách sale + downline (cây giới thiệu)",
        "Bảng hoa hồng theo 5 bậc lũy tiến",
        "Top sale theo doanh số / hoa hồng tháng",
        "Xuất báo cáo hoa hồng",
      ]}
    />
  );
}
