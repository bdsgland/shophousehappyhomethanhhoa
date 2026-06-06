import { EmptyState } from "@/components/agent/EmptyState";
import { Heart } from "@/components/dashboard/icons";

export default function FavoritesPage() {
  return (
    <EmptyState
      Icon={Heart}
      title="Căn hộ quan tâm"
      description="Lưu lại các căn trong quỹ hàng mà bạn hoặc khách của bạn quan tâm để tư vấn nhanh hơn. Nhấn ♥ trên mặt bằng quỹ căn để thêm vào đây."
    />
  );
}
