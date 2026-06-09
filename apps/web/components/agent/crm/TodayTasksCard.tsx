"use client";

import { useEffect, useState } from "react";

import { Check, Target } from "@/components/dashboard/icons";
import { checkInToday, fetchTodayTask, type SaleTaskDaily } from "@/lib/crm";

function KpiBar({
  label,
  value,
  target,
  tone,
}: {
  label: string;
  value: number;
  target: number;
  tone: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 100;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-brand-800">{label}</span>
        <span className="text-brand-600">
          {value}/{target}
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TodayTasksCard({ token }: { token: string }) {
  const [task, setTask] = useState<SaleTaskDaily | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTodayTask(token)
      .then(setTask)
      .catch(() => setTask(null))
      .finally(() => setLoading(false));
  }, [token]);

  async function doCheckIn() {
    setSaving(true);
    try {
      setTask(await checkInToday(token));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="h-32 animate-pulse rounded-lg bg-brand-50" />
      </div>
    );
  }
  if (!task) return null;

  const score = task.score;
  const ring =
    score >= 80 ? "from-emerald-400 to-emerald-600" : score >= 50 ? "from-amber-400 to-orange-500" : "from-sky-400 to-sky-600";

  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Score gauge */}
        <div className="flex flex-col items-center">
          <div
            className={`flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br ${ring} text-white shadow-inner`}
          >
            <div className="text-center">
              <div className="text-3xl font-extrabold leading-none">{score}</div>
              <div className="text-[11px] font-medium opacity-90">điểm / 100</div>
            </div>
          </div>
          <span className="mt-2 text-xs font-medium text-brand-600">Hiệu suất hôm nay</span>
        </div>

        {/* KPI bars */}
        <div className="flex-1 space-y-3">
          <KpiBar
            label="Khách mới thêm"
            value={task.new_leads_added}
            target={task.target_new_leads}
            tone="bg-gradient-to-r from-amber-400 to-orange-500"
          />
          <KpiBar
            label="Lượt liên hệ"
            value={task.contacts_made}
            target={task.target_contacts}
            tone="bg-gradient-to-r from-sky-400 to-sky-600"
          />
          <KpiBar
            label="Cuộc hẹn xem nhà"
            value={task.meetings_attended}
            target={task.target_meetings}
            tone="bg-gradient-to-r from-emerald-400 to-emerald-600"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Target size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <span>Hoàn thành nhiệm vụ để được hệ thống ưu tiên chia khách nét (hot lead).</span>
        </div>
        <button
          onClick={doCheckIn}
          disabled={saving || task.checked_in}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
            task.checked_in
              ? "bg-emerald-100 text-emerald-700"
              : "bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60"
          }`}
        >
          <Check size={18} />
          {task.checked_in ? "Đã check-in hôm nay" : saving ? "Đang lưu…" : "Check-in hoàn thành ngày"}
        </button>
      </div>
    </div>
  );
}
