"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { FinanceMonthlyPoint } from "@/lib/types";
import { formatVndShort, shortMonth } from "@/lib/utils";

// Đường doanh thu / chi phí / lợi nhuận theo tháng.
export function FinanceTrendChart({ data }: { data: FinanceMonthlyPoint[] }) {
  const hasData = data.some((d) => d.revenue > 0 || d.cost > 0);

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tick={{ fontSize: 11 }}
            stroke="hsl(215,16%,60%)"
          />
          <YAxis
            tickFormatter={(v) => formatVndShort(Number(v))}
            tick={{ fontSize: 11 }}
            width={70}
            stroke="hsl(215,16%,60%)"
          />
          <Tooltip
            labelFormatter={(v) => `Tháng ${shortMonth(String(v))}`}
            formatter={(v, n) => [formatVndShort(Number(v)), n]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(214,20%,88%)",
              fontSize: 12,
            }}
          />
          <Legend
            iconType="plainline"
            formatter={(v) => <span className="text-sm">{v}</span>}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            name="Doanh thu"
            stroke="hsl(152,60%,40%)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="cost"
            name="Chi phí"
            stroke="hsl(0,72%,51%)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="profit"
            name="Lợi nhuận"
            stroke="hsl(33,49%,48%)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-card/80 px-3 py-1.5 text-sm text-muted-foreground">
            Chưa có dữ liệu tài chính
          </span>
        </div>
      )}
    </div>
  );
}
