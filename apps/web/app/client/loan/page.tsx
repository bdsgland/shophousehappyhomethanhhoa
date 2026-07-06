import { LoanCalculator } from "@/components/client/LoanCalculator";

export default function LoanPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Tính lãi vay ngân hàng</h1>
        <p className="text-sm text-brand-700">
          Ước tính khoản vay mua nhà tại Happy Home Thanh Hóa — chọn ngân hàng,
          thời hạn và phương thức trả để xem lịch trả nợ chi tiết.
        </p>
      </header>
      <LoanCalculator />
    </div>
  );
}
