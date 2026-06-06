"use client";

import { useEffect, useMemo, useState } from "react";

import { GitCompare } from "@/components/dashboard/icons";
import { fetchInventory, type InventoryUnit } from "@/lib/api";
import { parsePriceToVnd } from "@/lib/format";

const MAX = 4;

// Tiện ích giả lập theo loại sản phẩm (giai đoạn MVP).
const AMENITIES: Record<string, string> = {
  "Liền kề": "Sân vườn riêng, gần công viên nội khu, chỗ đậu 1 ô tô",
  Shophouse: "Mặt tiền kinh doanh, vỉa hè rộng, 2 mặt thoáng",
  "Biệt thự": "Hồ bơi riêng, sân vườn lớn, đậu 2-3 ô tô, view sông",
};

type FieldDef = {
  key: string;
  label: string;
  get: (u: InventoryUnit) => string;
  // hướng so sánh: 'low' = thấp nhất tốt, 'high' = cao nhất tốt, undefined = không highlight
  best?: "low" | "high";
  num?: (u: InventoryUnit) => number;
};

const FIELDS: FieldDef[] = [
  { key: "zone", label: "Phân khu", get: (u) => u.zone },
  { key: "type", label: "Loại", get: (u) => u.type },
  {
    key: "area",
    label: "Diện tích",
    get: (u) => `${u.area} m²`,
    best: "high",
    num: (u) => u.area,
  },
  {
    key: "facade",
    label: "Mặt tiền",
    get: (u) => `${u.facade} m`,
    best: "high",
    num: (u) => u.facade,
  },
  {
    key: "price",
    label: "Giá",
    get: (u) => u.price,
    best: "low",
    num: (u) => parsePriceToVnd(u.price),
  },
  { key: "status", label: "Trạng thái", get: (u) => u.status },
  {
    key: "amenities",
    label: "Tiện ích kèm theo",
    get: (u) => AMENITIES[u.type] ?? "Đang cập nhật",
  },
];

export function UnitCompareTable() {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchInventory().then((rows) => {
      if (!rows) return;
      setUnits(rows);
      setSelected(rows.slice(0, 2).map((u) => u.code));
    });
  }, []);

  const selectedUnits = useMemo(
    () =>
      selected
        .map((code) => units.find((u) => u.code === code))
        .filter((u): u is InventoryUnit => Boolean(u)),
    [selected, units],
  );

  function addUnit(code: string) {
    if (!code || selected.includes(code) || selected.length >= MAX) return;
    setSelected((s) => [...s, code]);
    setPicker("");
  }

  function removeUnit(code: string) {
    setSelected((s) => s.filter((c) => c !== code));
  }

  // Tính ô "tốt nhất" cho mỗi field có best.
  const bestByField = useMemo(() => {
    const map: Record<string, string | null> = {};
    FIELDS.forEach((f) => {
      if (!f.best || !f.num || selectedUnits.length < 2) {
        map[f.key] = null;
        return;
      }
      let bestCode: string | null = null;
      let bestVal: number | null = null;
      selectedUnits.forEach((u) => {
        const v = f.num!(u);
        if (
          bestVal === null ||
          (f.best === "low" ? v < bestVal : v > bestVal)
        ) {
          bestVal = v;
          bestCode = u.code;
        }
      });
      map[f.key] = bestCode;
    });
    return map;
  }, [selectedUnits]);

  const available = units.filter((u) => !selected.includes(u.code));

  return (
    <div className="space-y-4">
      {/* Picker */}
      <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {selectedUnits.map((u) => (
            <span
              key={u.code}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-100"
            >
              {u.code}
              <button
                type="button"
                onClick={() => removeUnit(u.code)}
                className="text-indigo-400 hover:text-rose-500"
                aria-label={`Bỏ ${u.code}`}
              >
                ✕
              </button>
            </span>
          ))}
          {selected.length < MAX && (
            <select
              value={picker}
              onChange={(e) => addUnit(e.target.value)}
              className="rounded-full border border-dashed border-brand-200 bg-white px-3 py-1.5 text-sm text-brand-700 outline-none focus:border-indigo-400"
            >
              <option value="">+ Thêm căn so sánh…</option>
              {available.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} · {u.zone} · {u.price}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="mt-2 text-xs text-brand-400">
          Chọn từ 2 đến {MAX} căn. Ô <span className="text-emerald-600">xanh</span> là
          lợi thế nổi bật (giá thấp nhất, diện tích / mặt tiền lớn nhất).
        </p>
      </div>

      {/* Bảng so sánh */}
      {selectedUnits.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center text-sm text-brand-500">
          <GitCompare size={28} className="mx-auto mb-2 text-brand-300" />
          Hãy chọn ít nhất 2 căn để bắt đầu so sánh.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50/60">
                <th className="sticky left-0 z-10 bg-brand-50/60 px-4 py-3 text-left font-medium text-brand-600">
                  Tiêu chí
                </th>
                {selectedUnits.map((u) => (
                  <th
                    key={u.code}
                    className="px-4 py-3 text-left font-bold text-brand-900"
                  >
                    {u.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f) => (
                <tr key={f.key} className="border-t border-brand-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-brand-700">
                    {f.label}
                  </td>
                  {selectedUnits.map((u) => {
                    const isBest = bestByField[f.key] === u.code;
                    return (
                      <td
                        key={u.code}
                        className={`px-4 py-3 ${
                          isBest
                            ? "bg-emerald-50 font-semibold text-emerald-700"
                            : "text-brand-800"
                        }`}
                      >
                        {f.get(u)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUnits.length >= 2 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 1800);
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Lưu so sánh
          </button>
          {saved && (
            <span className="text-sm text-emerald-600">
              Đã lưu (bản xem trước — sẽ đồng bộ tài khoản sau).
            </span>
          )}
        </div>
      )}
    </div>
  );
}
