import { ComingSoon } from "@/components/ComingSoon";

export default function InventoryPage() {
  return (
    <ComingSoon
      title="Quỹ căn"
      description="Quản lý 200+ căn ELC: mặt bằng, bộ lọc, chỉnh giá & trạng thái."
      bullets={[
        "Mặt bằng tương tác (tái sử dụng MasterPlanMap từ apps/web)",
        "Bảng danh sách + lọc theo phân khu / diện tích / giá / trạng thái",
        "Modal sửa căn (admin): đổi giá, đổi trạng thái, upload ảnh",
        "Đồng bộ trạng thái bán/cọc realtime",
      ]}
    />
  );
}
