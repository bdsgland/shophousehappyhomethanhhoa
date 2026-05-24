import { fetchLeads } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  nurturing: "Đang chăm",
  hot: "Nóng",
  handed_off: "Đã bàn giao",
  lost: "Đã mất",
};

const STATUS_CLASS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  nurturing: "bg-amber-100 text-amber-800",
  hot: "bg-rose-100 text-rose-800",
  handed_off: "bg-emerald-100 text-emerald-800",
  lost: "bg-gray-200 text-gray-700",
};

export async function LeadList() {
  const leads = await fetchLeads();

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-brand-100 bg-white p-6 text-sm text-brand-700">
        Chưa có lead nào. Hãy tạo thử bằng API:
        <pre className="mt-3 overflow-x-auto rounded bg-brand-50 p-3 text-xs text-brand-900">
{`curl -X POST http://localhost:8000/leads \\
  -H "Content-Type: application/json" \\
  -d '{"full_name":"Nguyễn Văn A","phone":"0900000000","interested_project_slug":"the-grand-tower"}'`}
        </pre>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand-100 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-50 text-left text-xs uppercase text-brand-700">
          <tr>
            <th className="px-4 py-3">Khách hàng</th>
            <th className="px-4 py-3">Liên hệ</th>
            <th className="px-4 py-3">Dự án</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3 text-right">Điểm intent</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-t border-brand-100">
              <td className="px-4 py-3 font-medium text-brand-900">
                {lead.full_name || "(chưa có tên)"}
              </td>
              <td className="px-4 py-3 text-brand-700">
                {lead.phone || lead.email || "—"}
              </td>
              <td className="px-4 py-3 text-brand-700">
                {lead.interested_project_slug || "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[lead.status] || ""}`}
                >
                  {STATUS_LABEL[lead.status] || lead.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-brand-900">
                {lead.intent_score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
