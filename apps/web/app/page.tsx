import { ChatWidget } from "@/components/ChatWidget";
import { HealthStatus } from "@/components/HealthStatus";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold text-brand-900">
          Xin chào — Agent Proptech đã sẵn sàng
        </h1>
        <p className="mt-3 max-w-2xl text-brand-700">
          Đây là dashboard quản trị cho hệ thống AI-agent bán bất động sản cao cấp.
          Agent tự học dự án, chăm khách 24/7 và bàn giao những lead đã thật sự
          quan tâm cho saleman thật để gặp & chốt.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-brand-700/80">
          Bạn có thể trải nghiệm trợ lý AI ngay tại bong bóng chat góc phải dưới
          — đây cũng là kênh khách truy cập thật sự sẽ tương tác với hệ thống.
        </p>
      </section>

      <ChatWidget />

      <HealthStatus />

      <section className="grid gap-4 md:grid-cols-3">
        <Card
          title="Project Knowledge"
          body="Nạp tài liệu dự án (giá, mặt bằng, pháp lý, tiện ích) — agent trả lời chính xác bằng RAG."
        />
        <Card
          title="Conversational Nurturing"
          body="Hội thoại sang trọng, cá nhân hoá qua web chat, Zalo, Messenger, email."
        />
        <Card
          title="Lead Handoff"
          body="Khi lead đạt ngưỡng quan tâm → cảnh báo saleman kèm tóm tắt hội thoại."
        />
      </section>

      <section className="rounded-xl border border-brand-100 bg-white p-6">
        <h2 className="text-lg font-semibold text-brand-900">Bắt đầu nhanh</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-brand-900">
          <li>
            Khởi động agent-engine: <code className="rounded bg-brand-50 px-1 py-0.5">cd apps/agent-engine && uvicorn app.main:app --reload</code>
          </li>
          <li>Xem danh sách lead (giả lập) tại tab "Lead"</li>
          <li>
            Sửa file <code className="rounded bg-brand-50 px-1 py-0.5">apps/agent-engine/app/agents/sales_agent.py</code>
            để tùy chỉnh giọng điệu agent
          </li>
        </ol>
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-5">
      <div className="text-sm font-semibold text-brand-900">{title}</div>
      <div className="mt-2 text-sm text-brand-700">{body}</div>
    </div>
  );
}
