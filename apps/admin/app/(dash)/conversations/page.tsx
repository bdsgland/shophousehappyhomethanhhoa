import { ComingSoon } from "@/components/ComingSoon";

export default function ConversationsPage() {
  return (
    <ComingSoon
      title="Hội thoại"
      description="Lịch sử hội thoại chatbot web và đồng bộ Chatwoot."
      bullets={[
        "Tab Chatbot web (từ FastAPI) + tab Chatwoot",
        "Tìm kiếm + lọc theo ngày, sale phụ trách",
        "Đồng bộ hội thoại Chatwoot về DB local",
        "Xem chi tiết & gán sale",
      ]}
    />
  );
}
