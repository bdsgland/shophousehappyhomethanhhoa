import { ChatFull } from "@/components/client/ChatFull";

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Chat AI tư vấn</h1>
        <p className="text-sm text-brand-700">
          Trợ lý AI 24/7 giải đáp về quỹ căn, giá, chính sách và tiện ích dự án ELC.
        </p>
      </header>
      <ChatFull />
    </div>
  );
}
