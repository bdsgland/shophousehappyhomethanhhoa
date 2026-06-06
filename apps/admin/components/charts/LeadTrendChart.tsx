"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { shortDate } from "@/lib/utils";

export function LeadTrendChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const hasData = data.some((d) => d.count > 0);

  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(33,49%,48%)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(33,49%,48%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11 }}
            interval={Math.floor(data.length / 6)}
            stroke="hsl(215,16%,60%)"
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(215,16%,60%)" />
          <Tooltip
            labelFormatter={(v) => `Ngày ${shortDate(String(v))}`}
            formatter={(v) => [`${v} lead`, "Số lead"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(214,20%,88%)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(33,49%,48%)"
            strokeWidth={2}
            fill="url(#leadFill)"
          />
        </AreaChart>
      </ResponsiveContainer>

      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-card/80 px-3 py-1.5 text-sm text-muted-foreground">
            Chưa có lead trong 30 ngày qua
          </span>
        </div>
      )}
    </div>
  );
}
