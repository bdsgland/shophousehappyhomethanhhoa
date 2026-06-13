"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { SalePerformanceContent } from "@/components/sales/SalePerformanceContent";
import { Button } from "@/components/ui/button";

/**
 * Route cũ của "Hiệu suất Sale" — nay nội dung đã được gộp thành một tab
 * trong trang "Sale & Hoa hồng" (/sales). Giữ lại route này để không vỡ
 * các liên kết/bookmark cũ; chỉ tái dùng component SalePerformanceContent.
 */
export default function SalesPerformancePage() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm-sales-performance"] }),
        qc.invalidateQueries({ queryKey: ["crm-leads-trend"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Hiệu suất Sale"
        description="Xếp hạng sale theo điểm tuần — cơ sở để hệ thống ưu tiên chia hot lead."
        action={
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Làm mới
          </Button>
        }
      />
      <SalePerformanceContent />
    </div>
  );
}
