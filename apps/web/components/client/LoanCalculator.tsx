"use client";

import { useMemo, useState } from "react";

import { formatNumber, formatShort, formatVnd, parseNumber } from "@/lib/format";

// ---- Mô hình tính ----

type Method = "annuity" | "flat";

type ScheduleRow = {
  month: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
};

type YearRow = {
  year: number;
  interest: number;
  principal: number;
  payment: number;
  endBalance: number;
};

const BANKS = [
  { key: "BIDV", label: "BIDV", rate: 8.5 },
  { key: "TCB", label: "Techcombank", rate: 8.7 },
  { key: "VCB", label: "Vietcombank", rate: 8.3 },
  { key: "OTHER", label: "Khác (tự nhập)", rate: 0 },
];

const TERMS = [5, 10, 15, 20, 25];

/**
 * Sinh lịch trả nợ theo tháng.
 *
 * - `annuity` (lãi giảm dần / niên kim): trả đều mỗi kỳ, lãi tính trên dư nợ
 *   còn lại (PMT). Khi có ưu đãi 0% trong `graceMonths` đầu, kỳ ân hạn lãi=0
 *   và payment = dư nợ / số kỳ còn lại; hết ưu đãi sẽ tính lại PMT trên dư nợ
 *   còn lại theo lãi suất thực.
 * - `flat` (lãi cố định): gốc chia đều, lãi tính cố định trên dư nợ gốc ban
 *   đầu; kỳ ân hạn lãi=0.
 */
function buildSchedule(
  principalAmount: number,
  annualRatePct: number,
  months: number,
  method: Method,
  graceMonths: number,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  if (principalAmount <= 0 || months <= 0) return rows;

  const grace = Math.max(0, Math.min(graceMonths, months));
  let balance = principalAmount;

  if (method === "flat") {
    const principalPerMonth = principalAmount / months;
    const flatMonthlyInterest = (principalAmount * (annualRatePct / 100)) / 12;
    for (let m = 1; m <= months; m++) {
      const interest = m <= grace ? 0 : flatMonthlyInterest;
      const principal = principalPerMonth;
      balance = Math.max(0, balance - principal);
      rows.push({ month: m, interest, principal, payment: interest + principal, balance });
    }
    return rows;
  }

  // annuity
  for (let m = 1; m <= months; m++) {
    const remaining = months - m + 1;
    const inGrace = m <= grace;
    const monthlyRate = inGrace ? 0 : annualRatePct / 100 / 12;
    let payment: number;
    if (monthlyRate === 0) {
      payment = balance / remaining;
    } else {
      payment =
        (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remaining));
    }
    const interest = balance * monthlyRate;
    let principal = payment - interest;
    if (principal > balance) principal = balance;
    balance = Math.max(0, balance - principal);
    rows.push({ month: m, interest, principal, payment: interest + principal, balance });
  }
  return rows;
}

function groupByYear(rows: ScheduleRow[]): YearRow[] {
  const years: YearRow[] = [];
  rows.forEach((r) => {
    const yi = Math.floor((r.month - 1) / 12);
    if (!years[yi]) {
      years[yi] = { year: yi + 1, interest: 0, principal: 0, payment: 0, endBalance: 0 };
    }
    years[yi].interest += r.interest;
    years[yi].principal += r.principal;
    years[yi].payment += r.payment;
    years[yi].endBalance = r.balance;
  });
  return years;
}

export function LoanCalculator() {
  const [homeValue, setHomeValue] = useState(3_000_000_000);
  const [loanPct, setLoanPct] = useState(70);
  const [termYears, setTermYears] = useState(20);
  const [bankKey, setBankKey] = useState("BIDV");
  const [customRate, setCustomRate] = useState(9);
  const [method, setMethod] = useState<Method>("annuity");
  const [elcGrace, setElcGrace] = useState(false);

  const bank = BANKS.find((b) => b.key === bankKey)!;
  const rate = bankKey === "OTHER" ? customRate : bank.rate;
  const loanAmount = Math.round((homeValue * loanPct) / 100);
  const months = termYears * 12;
  const graceMonths = elcGrace ? 42 : 0;

  const schedule = useMemo(
    () => buildSchedule(loanAmount, rate, months, method, graceMonths),
    [loanAmount, rate, months, method, graceMonths],
  );

  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const totalPayment = schedule.reduce((s, r) => s + r.payment, 0);
  const firstPayment = schedule[0]?.payment ?? 0;
  const afterGracePayment =
    graceMonths > 0 ? schedule[graceMonths]?.payment ?? firstPayment : firstPayment;
  const years = useMemo(() => groupByYear(schedule), [schedule]);

  // Biểu đồ cột gốc + lãi mỗi năm.
  const chartYears = years;
  const maxYearPayment = Math.max(1, ...chartYears.map((y) => y.payment));

  const inputCls =
    "mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300";
  const labelCls = "block text-sm font-medium text-brand-800";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* FORM */}
      <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-brand-900">Thông số khoản vay</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Giá trị căn nhà</label>
            <input
              className={inputCls}
              inputMode="numeric"
              value={formatNumber(homeValue)}
              onChange={(e) => setHomeValue(parseNumber(e.target.value))}
            />
            <div className="mt-1 text-xs text-brand-500">≈ {formatShort(homeValue)}</div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={labelCls}>Số tiền vay</label>
              <span className="text-sm font-semibold text-indigo-700">
                {loanPct}% · {formatShort(loanAmount)}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={loanPct}
              onChange={(e) => setLoanPct(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[11px] text-brand-400">
              <span>10%</span>
              <span>Tối đa 80%</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Thời hạn vay</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TERMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTermYears(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    termYears === t
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-brand-100 text-brand-700 hover:border-indigo-300"
                  }`}
                >
                  {t} năm
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Ngân hàng / lãi suất</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {BANKS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBankKey(b.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    bankKey === b.key
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-brand-100 text-brand-700 hover:border-indigo-300"
                  }`}
                >
                  <div className="font-medium">{b.label}</div>
                  {b.key !== "OTHER" && (
                    <div className="text-xs text-brand-500">{b.rate}%/năm</div>
                  )}
                </button>
              ))}
            </div>
            {bankKey === "OTHER" && (
              <div className="mt-2">
                <input
                  type="number"
                  step={0.1}
                  className={inputCls}
                  value={customRate}
                  onChange={(e) => setCustomRate(Number(e.target.value))}
                  placeholder="Lãi suất %/năm"
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Phương thức trả</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("annuity")}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  method === "annuity"
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-brand-100 text-brand-700 hover:border-indigo-300"
                }`}
              >
                Lãi giảm dần (trả đều)
              </button>
              <button
                type="button"
                onClick={() => setMethod("flat")}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  method === "flat"
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-brand-100 text-brand-700 hover:border-indigo-300"
                }`}
              >
                Lãi cố định (trên gốc)
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <input
              type="checkbox"
              checked={elcGrace}
              onChange={(e) => setElcGrace(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-500"
            />
            <span className="text-sm text-amber-900">
              <span className="font-semibold">Ưu đãi ELC:</span> Hỗ trợ lãi suất 0%
              trong 42 tháng đầu
            </span>
          </label>
        </div>
      </div>

      {/* KẾT QUẢ */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-brand-600">Trả hàng tháng</div>
            <div className="mt-1 text-xl font-bold text-indigo-700">
              {formatShort(afterGracePayment)}
            </div>
            {graceMonths > 0 && (
              <div className="text-[11px] text-amber-700">
                42 tháng đầu: {formatShort(firstPayment)}/tháng
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-brand-600">Tổng tiền lãi</div>
            <div className="mt-1 text-xl font-bold text-rose-600">
              {formatShort(totalInterest)}
            </div>
          </div>
          <div className="col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <div className="text-xs text-indigo-700">Tổng phải trả (gốc + lãi)</div>
            <div className="mt-1 text-2xl font-bold text-indigo-900">
              {formatVnd(totalPayment)}
            </div>
            <div className="text-xs text-indigo-700">
              Gốc {formatShort(loanAmount)} + Lãi {formatShort(totalInterest)}
            </div>
          </div>
        </div>

        {/* Biểu đồ cột gốc + lãi theo năm */}
        <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-brand-900">
              Gốc &amp; lãi theo năm
            </div>
            <div className="flex items-center gap-3 text-[11px] text-brand-600">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500" />
                Gốc
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />
                Lãi
              </span>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${Math.max(chartYears.length * 34 + 20, 100)} 140`}
            className="w-full"
            role="img"
            aria-label="Biểu đồ gốc và lãi theo năm"
          >
            {chartYears.map((y, i) => {
              const x = 20 + i * 34;
              const fullH = 110;
              const totalH = (y.payment / maxYearPayment) * fullH;
              const principalH = (y.principal / Math.max(y.payment, 1)) * totalH;
              const interestH = totalH - principalH;
              const baseY = 120;
              return (
                <g key={y.year}>
                  <rect
                    x={x}
                    y={baseY - interestH}
                    width={20}
                    height={interestH}
                    className="fill-rose-400"
                  />
                  <rect
                    x={x}
                    y={baseY - interestH - principalH}
                    width={20}
                    height={principalH}
                    className="fill-indigo-500"
                    rx={1}
                  />
                  {(i % Math.ceil(chartYears.length / 12 || 1) === 0 ||
                    i === chartYears.length - 1) && (
                    <text
                      x={x + 10}
                      y={134}
                      textAnchor="middle"
                      className="fill-brand-500 text-[8px]"
                    >
                      N{y.year}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Lịch trả nợ vài năm đầu */}
        <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-brand-900">
            Lịch trả nợ theo năm
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-brand-600">
                  <th className="py-1.5 pr-2 font-medium">Năm</th>
                  <th className="py-1.5 px-2 text-right font-medium">Gốc</th>
                  <th className="py-1.5 px-2 text-right font-medium">Lãi</th>
                  <th className="py-1.5 px-2 text-right font-medium">Tổng trả</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Dư nợ cuối</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year} className="border-t border-brand-50">
                    <td className="py-1.5 pr-2 font-medium text-brand-800">{y.year}</td>
                    <td className="py-1.5 px-2 text-right text-brand-700">
                      {formatShort(y.principal)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-rose-600">
                      {formatShort(y.interest)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-medium text-brand-900">
                      {formatShort(y.payment)}
                    </td>
                    <td className="py-1.5 pl-2 text-right text-brand-500">
                      {formatShort(y.endBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-brand-400">
            * Kết quả mang tính tham khảo. Lãi suất thực tế và chính sách ưu đãi vui
            lòng xác nhận với ngân hàng và chuyên viên ELC.
          </p>
        </div>
      </div>
    </div>
  );
}
