"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { FinanceCostSlice } from "@/lib/types";
import { formatVndShort } from "@/lib/utils";

// Màu cố định theo hạng mục (đồng bộ select trong CostModal).
const CATEGORY_COLOR: Record<string, string> = {
  "nền tảng": "hsl(217,91%,60%)",
  marketing: "hsl(33,49%,48%)",
  "nhân sự": "hsl(152,60%,40%)",
  "vận hành": "hsl(38,92%,50%)",
  khác: "hsl(215,16%,60%)",
};

export function CostBreakdownChart({ data }: { data: FinanceCostSlice[] }) {
  if (!data.length) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <span className="rounded-md bg-card/80 px-3 py-1.5 text-sm text-muted-foreground">
          Chưa có chi phí trong kỳ
        </span>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell
                key={d.category}
                fill={CATEGORY_COLOR[d.category] ?? "hsl(215,16%,60%)"}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, n) => [formatVndShort(Number(v)), n]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(214,20%,88%)",
              fontSize: 12,
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            formatter={(v) => <span className="text-sm">{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
