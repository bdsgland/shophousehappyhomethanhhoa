import { UnitCompareTable } from "@/components/client/UnitCompareTable";

export default function ComparePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">So sánh căn hộ</h1>
        <p className="text-sm text-brand-700">
          Đặt 2–4 căn cạnh nhau để so sánh diện tích, mặt tiền, giá và tiện ích —
          giúp bạn chọn căn phù hợp nhất.
        </p>
      </header>
      <UnitCompareTable />
    </div>
  );
}
