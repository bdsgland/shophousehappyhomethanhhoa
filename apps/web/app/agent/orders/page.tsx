import { EmptyState } from "@/components/agent/EmptyState";
import { ShoppingBag } from "@/components/dashboard/icons";

export default function OrdersPage() {
  return (
    <EmptyState
      Icon={ShoppingBag}
      title="Đơn hàng của tôi"
      description="Nơi theo dõi các đơn đặt cọc, hợp đồng mua bán và tiến độ thanh toán của khách hàng bạn đã chốt. Dữ liệu sẽ tự động xuất hiện khi có giao dịch."
    />
  );
}
