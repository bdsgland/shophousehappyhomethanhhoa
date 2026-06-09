"use client";

import {
  formatDate,
  scoreColor,
  SOURCE_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type CrmLead,
} from "@/lib/crm";

export function LeadTable({
  leads,
  selectedId,
  onSelect,
}: {
  leads: CrmLead[];
  selectedId: string | null;
  onSelect: (lead: CrmLead) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-brand-600">
          Chưa có khách hàng nào khớp bộ lọc. Sang tab “Nhập danh bạ” để thêm khách.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-600">
              <th className="px-4 py-2.5">Tên</th>
              <th className="px-4 py-2.5">SĐT</th>
              <th className="px-4 py-2.5">Nguồn</th>
              <th className="px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5 text-center">AI score</th>
              <th className="px-4 py-2.5">Liên hệ gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onSelect(lead)}
                className={`cursor-pointer border-b border-brand-50 transition hover:bg-amber-50/40 ${
                  selectedId === lead.id ? "bg-amber-50" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-brand-900">{lead.name}</td>
                <td className="px-4 py-2.5 text-brand-700">{lead.phone}</td>
                <td className="px-4 py-2.5 text-brand-600">{SOURCE_LABEL[lead.source]}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGE[lead.status]}`}
                  >
                    {STATUS_LABEL[lead.status]}
                  </span>
                </td>
                <td className={`px-4 py-2.5 text-center font-bold ${scoreColor(lead.ai_score)}`}>
                  {lead.ai_score}
                </td>
                <td className="px-4 py-2.5 text-brand-600">
                  {lead.last_contact_at ? (
                    <>
                      {formatDate(lead.last_contact_at)}
                      {lead.days_since_contact !== null && (
                        <span className="ml-1 text-xs text-brand-400">
                          ({lead.days_since_contact} ngày)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-brand-400">Chưa liên hệ</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
