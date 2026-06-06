import { EmptyState } from "@/components/agent/EmptyState";
import { Calendar } from "@/components/dashboard/icons";

export default function BookingsPage() {
  return (
    <EmptyState
      Icon={Calendar}
      title="Lịch booking"
      description="Quản lý lịch hẹn dẫn khách thăm dự án, sự kiện mở bán và các buổi tư vấn. Bạn sẽ đặt và theo dõi lịch booking ngay tại đây."
    />
  );
}
