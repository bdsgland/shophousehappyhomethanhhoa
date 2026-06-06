import { PricingCalculator } from "@/components/client/PricingCalculator";

export default function PricingPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Phiếu tính giá</h1>
        <p className="text-sm text-brand-700">
          Chọn căn và phương thức thanh toán để xem bảng tính giá chi tiết kèm chiết
          khấu, VAT và phí bảo trì.
        </p>
      </header>
      <PricingCalculator />
    </div>
  );
}
