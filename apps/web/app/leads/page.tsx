import { LeadList } from "@/components/LeadList";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-brand-900">Danh sách lead</h1>
        <p className="text-sm text-brand-700">
          Dữ liệu lấy trực tiếp từ agent-engine (
          <code className="rounded bg-brand-50 px-1 py-0.5">GET /leads</code>).
          Ở MVP danh sách lưu in-memory — restart server sẽ mất.
        </p>
      </header>
      <LeadList />
    </div>
  );
}
