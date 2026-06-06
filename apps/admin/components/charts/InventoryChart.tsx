"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

// Cơ cấu quỹ căn theo trạng thái (thay cho bar "top sale" khi chưa có giao dịch
// thật — dữ liệu inventory luôn sẵn có nên chart luôn có nội dung ý nghĩa).
export function InventoryChart({
  available,
  reserved,
  sold,
}: {
  available: number;
  reserved: number;
  sold: number;
}) {
  const data = [
    { name: "Còn hàng", value: available, color: "hsl(152,60%,40%)" },
    { name: "Đặt cọc", value: reserved, color: "hsl(38,92%,50%)" },
    { name: "Đã bán", value: sold, color: "hsl(0,72%,51%)" },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, n) => [`${v} căn`, n]}
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
