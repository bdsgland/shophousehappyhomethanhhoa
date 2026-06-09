"use client";

import { Flame, Phone } from "@/components/dashboard/icons";
import { scoreColor, type CrmLead } from "@/lib/crm";

export function HotLeadQueue({
  leads,
  onSelect,
}: {
  leads: CrmLead[];
  onSelect: (lead: CrmLead) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-200 bg-white px-6 py-8 text-center shadow-sm">
        <Flame size={28} className="mx-auto text-brand-300" />
        <p className="mt-2 text-sm text-brand-600">
          Chưa có khách nét nào trong hàng đợi. Hoàn thành nhiệm vụ để được chia khách.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-3">
        <Flame size={18} className="text-rose-500" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-rose-700">
          Khách nét cần liên hệ ngay ({leads.length})
        </h2>
      </div>
      <ul className="divide-y divide-brand-50">
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-rose-50/40"
            onClick={() => onSelect(lead)}
          >
            <div className="min-w-0">
              <div className="truncate font-semibold text-brand-900">{lead.name}</div>
              <div className="flex items-center gap-2 text-xs text-brand-600">
                <Phone size={13} /> {lead.phone}
                {lead.booking_count > 0 && (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                    {lead.booking_count} lịch hẹn
                  </span>
                )}
              </div>
            </div>
            <div className={`text-right text-sm font-bold ${scoreColor(lead.ai_score)}`}>
              {lead.ai_score}
              <div className="text-[10px] font-medium text-brand-400">AI score</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
