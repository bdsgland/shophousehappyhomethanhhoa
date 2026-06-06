"use client";

import { useEffect, useMemo, useState } from "react";

import { Download, Send } from "@/components/dashboard/icons";
import { fetchInventory, type InventoryUnit } from "@/lib/api";
import { formatVnd, parsePriceToVnd } from "@/lib/format";

type PayMethod = "once" | "installment" | "bank";

const METHODS: {
  key: PayMethod;
  label: string;
  hint: string;
  discount: number;
}[] = [
  { key: "once", label: "Trả 1 lần", hint: "Chiết khấu 5%", discount: 0.05 },
  {
    key: "installment",
    label: "Trả góp 24 tháng",
    hint: "Chiết khấu 3%",
    discount: 0.03,
  },
  {
    key: "bank",
    label: "Vay ngân hàng 70%",
    hint: "Không chiết khấu thêm",
    discount: 0,
  },
];

const VAT_RATE = 0.1;
const MAINTENANCE_RATE = 0.02;

export function PricingCalculator() {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [unitCode, setUnitCode] = useState<string>("");
  const [method, setMethod] = useState<PayMethod>("once");
  const [depositPct, setDepositPct] = useState(30);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory().then((rows) => {
      if (!rows) return;
      const available = rows.filter((u) => u.status !== "Đã bán");
      setUnits(available);
      if (available[0]) setUnitCode(available[0].code);
    });
  }, []);

  const unit = useMemo(
    () => units.find((u) => u.code === unitCode) ?? null,
    [units, unitCode],
  );

  const calc = useMemo(() => {
    if (!unit) return null;
    const listPrice = parsePriceToVnd(unit.price);
    const m = METHODS.find((x) => x.key === method)!;
    const discount = listPrice * m.discount;
    const net = listPrice - discount;
    const vat = net * VAT_RATE;
    const maintenance = net * MAINTENANCE_RATE;
    const total = net + vat + maintenance;
    const deposit = total * (depositPct / 100);
    const loanOrRemaining = total - deposit;
    return {
      listPrice,
      discountPct: m.discount,
      discount,
      net,
      vat,
      maintenance,
      total,
      deposit,
      loanOrRemaining,
      isBank: method === "bank",
    };
  }, [unit, method, depositPct]);

  const inputCls =
    "mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300";
  const labelCls = "block text-sm font-medium text-brand-800";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* FORM */}
      <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-brand-900">Thông tin căn &amp; thanh toán</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Chọn căn</label>
            <select
              className={inputCls}
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
            >
              {units.length === 0 && <option>Đang tải quỹ căn…</option>}
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} · {u.zone} · {u.area}m² · MT {u.facade}m · {u.price}
                </option>
              ))}
            </select>
            {unit && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-700">
                <div>
                  Phân khu: <b className="text-brand-900">{unit.zone}</b>
                </div>
                <div>
                  Loại: <b className="text-brand-900">{unit.type}</b>
                </div>
                <div>
                  Diện tích: <b className="text-brand-900">{unit.area} m²</b>
                </div>
                <div>
                  Mặt tiền: <b className="text-brand-900">{unit.facade} m</b>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Phương thức thanh toán</label>
            <div className="mt-2 space-y-2">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    method === m.key
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-brand-100 text-brand-700 hover:border-indigo-300"
                  }`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span
                    className={`text-xs ${
                      m.discount > 0 ? "text-emerald-600" : "text-brand-400"
                    }`}
                  >
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={labelCls}>Tỷ lệ đặt cọc</label>
              <span className="text-sm font-semibold text-indigo-700">{depositPct}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={depositPct}
              onChange={(e) => setDepositPct(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[11px] text-brand-400">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* KẾT QUẢ */}
      <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-brand-900">Phiếu tính giá</h2>
        {!calc ? (
          <p className="mt-4 text-sm text-brand-600">Chọn một căn để xem chi tiết.</p>
        ) : (
          <div className="mt-4">
            <dl className="divide-y divide-brand-50 text-sm">
              <Row label="Giá niêm yết" value={formatVnd(calc.listPrice)} />
              <Row
                label={`Chiết khấu (${(calc.discountPct * 100).toFixed(0)}%)`}
                value={calc.discount > 0 ? `- ${formatVnd(calc.discount)}` : "—"}
                valueClass="text-emerald-600"
              />
              <Row
                label="Giá sau chiết khấu"
                value={formatVnd(calc.net)}
                strong
              />
              <Row label="VAT (10%)" value={`+ ${formatVnd(calc.vat)}`} />
              <Row
                label="Phí bảo trì (2%)"
                value={`+ ${formatVnd(calc.maintenance)}`}
              />
              <div className="flex items-center justify-between py-3">
                <dt className="text-base font-bold text-brand-900">
                  Tổng cần thanh toán
                </dt>
                <dd className="text-lg font-bold text-indigo-700">
                  {formatVnd(calc.total)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 rounded-xl bg-indigo-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Phương án thanh toán
              </div>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-700">
                    Đặt cọc ({depositPct}%)
                  </span>
                  <span className="font-semibold text-brand-900">
                    {formatVnd(calc.deposit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-700">
                    {calc.isBank ? "Số tiền cần vay" : "Số tiền còn lại"}
                  </span>
                  <span className="font-semibold text-brand-900">
                    {formatVnd(calc.loanOrRemaining)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setSentMsg("Tính năng xuất PDF sẽ sớm có. Hãy lưu màn hình tạm thời.")
                }
                className="inline-flex items-center gap-2 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-800 hover:border-indigo-300"
              >
                <Download size={16} /> Xuất phiếu PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  setSentMsg("Đã gửi yêu cầu tư vấn — chuyên viên ELC sẽ liên hệ bạn sớm.")
                }
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Send size={16} /> Gửi cho sale tư vấn
              </button>
            </div>
            {sentMsg && (
              <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                {sentMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  valueClass,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className={`text-brand-700 ${strong ? "font-semibold text-brand-900" : ""}`}>
        {label}
      </dt>
      <dd
        className={`font-medium ${strong ? "text-brand-900" : "text-brand-800"} ${
          valueClass ?? ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
